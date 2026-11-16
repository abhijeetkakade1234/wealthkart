"use client";

import { circleVaultAbi } from "@wealthkart/sdk";
import { useState } from "react";
import { type Address, type ContractFunctionArgs, type TransactionReceipt, erc20Abi } from "viem";
import { usePublicClient } from "wagmi";

import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { type CircleAsset, fmt, isToken, useCircleAsset } from "@/lib/asset";
import { messages, toFriendlyError } from "@/lib/messages";
import { useBufferedWriteContract } from "@/lib/use-buffered-write";
import { useTx } from "@/lib/use-tx";

/** The vault calls that take money in (ADR 0046). */
export type PaymentFn = "contribute" | "payInterest" | "repay";

export type PayStep = "approve" | "pay";

/** Where one step of the two-step USDT payment is. */
export type StepStatus = "upcoming" | "working" | "done" | "failed";

export interface PaymentRequest {
  fn: PaymentFn;
  /**
   * Reads the exact amount due right before paying (`amountDue`, `interestDue`, `payoffDue`, or
   * the typed amount). Called again if a late fee starts between approve and pay.
   */
  amount: () => Promise<bigint>;
  /**
   * USDT only: how much to approve for an exact `amount`, when a known bound exists above it.
   * Installments approve installment + both late fees, so a UTC due-day boundary passing
   * between approve and pay doesn't fail the payment; the vault still pulls only the exact
   * amount due. Defaults to the exact amount (interest, repay).
   */
  approveCeiling?: (amount: bigint) => Promise<bigint>;
}

/** How many times a USDT payment re-reads the amount and approves again (late fee races). */
const MAX_APPROVE_ROUNDS = 2;

/**
 * Pays the circle in its own asset. AVAX: one transaction with `value`. USDT: checks the token
 * balance first, approves the amount (or the request's `approveCeiling`, never unlimited) on
 * the token (skipped when the allowance already covers it), waits for that, then calls the vault with no value. If the amount grew in
 * between (a late fee started), the pay step would fail with TokenAllowanceTooLow; the hook
 * catches that in a simulation, re-reads the amount and approves again.
 *
 * `repay` always goes through the `repay(uint256)` overload, which works for both assets.
 */
export function useAssetPayment(circle: Address | null) {
  const { asset, isPending: assetPending } = useCircleAsset(circle);
  const { address } = useCoreWallet();
  const publicClient = usePublicClient();
  const write = useBufferedWriteContract();
  const approveTx = useTx();
  const payTx = useTx();
  const [step, setStep] = useState<PayStep | null>(null);
  const [approveStatus, setApproveStatus] = useState<StepStatus>("upcoming");
  const [payStatus, setPayStatus] = useState<StepStatus>("upcoming");

  const [working, setWorking] = useState(false);
  /** What the last approve asked for (shown on the approve step); null until then. */
  const [approving, setApproving] = useState<bigint | null>(null);

  function args(fn: PaymentFn, amount: bigint) {
    return (fn === "repay" ? [amount] : []) as unknown as ContractFunctionArgs<
      typeof circleVaultAbi,
      "payable",
      PaymentFn
    >;
  }

  async function sendPay(vault: Address, fn: PaymentFn, amount: bigint, value: bigint | undefined) {
    return payTx.run(() =>
      write({
        abi: circleVaultAbi,
        address: vault,
        functionName: fn,
        args: args(fn, amount),
        ...(value !== undefined ? { value } : {}),
      } as unknown as Parameters<typeof write>[0]),
    );
  }

  function reset() {
    setStep(null);
    setApproving(null);
    setApproveStatus("upcoming");
    setPayStatus("upcoming");
    approveTx.reset();
    payTx.reset();
  }

  /**
   * Runs the payment. Resolves to the receipt and the amount paid, or null when it failed or
   * was cancelled (the trackers and step states explain why).
   */
  async function pay(
    req: PaymentRequest,
  ): Promise<{ receipt: TransactionReceipt; amount: bigint } | null> {
    if (!circle || !address || !publicClient || working) return null;
    setWorking(true);
    try {
      return await run(req, circle, address, publicClient);
    } finally {
      setWorking(false);
    }
  }

  async function run(
    req: PaymentRequest,
    circle: Address,
    address: Address,
    client: NonNullable<typeof publicClient>,
  ): Promise<{ receipt: TransactionReceipt; amount: bigint } | null> {
    approveTx.reset();
    payTx.reset();
    setApproveStatus("upcoming");
    setPayStatus("upcoming");

    if (!isToken(asset)) {
      setStep("pay");
      setPayStatus("working");
      const amount = await req.amount();
      const receipt = await sendPay(circle, req.fn, amount, amount);
      setPayStatus(receipt ? "done" : "failed");
      return receipt ? { receipt, amount } : null;
    }

    const token = asset.token;
    for (let round = 0; round < MAX_APPROVE_ROUNDS; round++) {
      setStep("approve");
      setApproveStatus("working");
      const amount = await req.amount();
      const [balance, allowance] = await Promise.all([
        client.readContract({
          abi: erc20Abi,
          address: token,
          functionName: "balanceOf",
          args: [address],
        }),
        client.readContract({
          abi: erc20Abi,
          address: token,
          functionName: "allowance",
          args: [address, circle],
        }),
      ]);
      if (balance < amount) {
        setApproveStatus("failed");
        approveTx.fail(
          messages.notEnoughToken({
            needed: fmt(amount, asset),
            have: fmt(balance, asset),
            symbol: asset.symbol,
          }),
          "token-balance-too-low",
        );
        return null;
      }
      if (allowance < amount) {
        // This payment (or its known ceiling), never an unlimited allowance (ADR 0046).
        const ceiling = req.approveCeiling ? await req.approveCeiling(amount) : amount;
        const approveAmount = ceiling > amount ? ceiling : amount;
        setApproving(approveAmount);
        const approved = await approveTx.run(() =>
          write({
            abi: erc20Abi,
            address: token,
            functionName: "approve",
            args: [circle, approveAmount],
          } as unknown as Parameters<typeof write>[0]),
        );
        if (!approved) {
          setApproveStatus("failed");
          return null;
        }
      }
      setApproveStatus("done");

      // A late fee may have started since the amount was read: check before asking the wallet.
      setStep("pay");
      setPayStatus("working");
      try {
        await client.simulateContract({
          abi: circleVaultAbi,
          address: circle,
          functionName: req.fn,
          args: args(req.fn, amount),
          account: address,
        } as unknown as Parameters<typeof client.simulateContract>[0]);
      } catch (e) {
        if (
          toFriendlyError(e).code === "token-allowance-too-low" &&
          round + 1 < MAX_APPROVE_ROUNDS
        ) {
          setPayStatus("upcoming");
          continue;
        }
        // Anything else: send anyway so the tracker shows the contract's own reason.
      }
      const receipt = await sendPay(circle, req.fn, amount, undefined);
      if (receipt) {
        setPayStatus("done");
        return { receipt, amount };
      }
      if (payTx.lastFailedCode() === "token-allowance-too-low" && round + 1 < MAX_APPROVE_ROUNDS) {
        setPayStatus("upcoming");
        continue;
      }
      setPayStatus("failed");
      return null;
    }
    setPayStatus("failed");
    return null;
  }

  return {
    asset,
    assetPending,
    pay,
    reset,
    working,
    step,
    approveStatus,
    payStatus,
    approving,
    approveTx,
    payTx,
    /** The tracker to show: the approve's while approving or when it failed, else the pay's. */
    tx: step === "approve" || approveStatus === "failed" ? approveTx : payTx,
  };
}

export type AssetPayment = ReturnType<typeof useAssetPayment>;

/** "Approve 25.00 USDT" / "Pay 25.00 USDT" style labels for the two steps. */
export function stepLabels(amount: bigint, asset: CircleAsset) {
  const a = `${fmt(amount, asset)} ${asset.symbol}`;
  return { approve: `Approve ${a}`, pay: `Pay ${a}` };
}
