"use client";

import { circleVaultAbi } from "@wealthkart/sdk";
import type { Address, ContractFunctionArgs, ContractFunctionName, TransactionReceipt } from "viem";
import { useWriteContract } from "wagmi";

import { useTx } from "@/lib/use-tx";

type VaultWrite = ContractFunctionName<typeof circleVaultAbi, "nonpayable" | "payable">;

/**
 * One vault transaction with its tracker state: `send("requestExit")`, `send("voteProposal",
 * [id, true])`, `send("repay", [], amount)`. Resolves to the receipt, or null when it failed (the tracker explains why).
 */
export function useVaultAction(circle: Address) {
  const { writeContractAsync } = useWriteContract();
  const tx = useTx();
  const working = tx.status === "confirm" || tx.status === "sending";

  function send<F extends VaultWrite>(
    functionName: F,
    args?: ContractFunctionArgs<typeof circleVaultAbi, "nonpayable" | "payable", F>,
    /** AVAX to send with a payable call (e.g. `payInterest`, `repay`). */
    value?: bigint,
  ): Promise<TransactionReceipt | null> {
    return tx.run(() =>
      writeContractAsync({
        abi: circleVaultAbi,
        address: circle,
        functionName,
        args,
        ...(value !== undefined ? { value } : {}),
      } as unknown as Parameters<typeof writeContractAsync>[0]),
    );
  }

  return { tx, send, working };
}
