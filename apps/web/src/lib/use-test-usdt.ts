"use client";

import { useReadContract } from "wagmi";

import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { useFactoryUsdt } from "@/lib/circle";
import { faucetAbi, faucetMintAmount, testUsdtFaucetVisible } from "@/lib/faucet";
import { useBufferedWriteContract } from "@/lib/use-buffered-write";
import { useTx } from "@/lib/use-tx";
import { TARGET_CHAIN } from "@/lib/wagmi";

const NETWORK = process.env.NEXT_PUBLIC_NETWORK;
const MAINNET_BUILD = (NETWORK ?? "").trim().toLowerCase() === "mainnet";

/**
 * The "Get test USDT" faucet (ADR 0053): whether to show it, and a `mint` that sends the
 * connected wallet one tap's worth. On a mainnet build nothing is even read.
 */
export function useTestUsdtFaucet() {
  const { address } = useCoreWallet();
  const { usdt } = useFactoryUsdt();
  const cap = useReadContract({
    abi: faucetAbi,
    address: usdt ?? undefined,
    functionName: "MINT_CAP",
    // Real USDt has no MINT_CAP, so the call fails and the button stays hidden.
    query: { enabled: Boolean(usdt) && !MAINNET_BUILD, staleTime: Infinity, retry: false },
  });
  const mintCap = cap.data as bigint | undefined;
  const visible = testUsdtFaucetVisible({
    network: NETWORK,
    chainId: TARGET_CHAIN.id,
    usdt,
    mintCap,
  });
  const amount = mintCap ? faucetMintAmount(mintCap) : 0n;
  const tx = useTx();
  const write = useBufferedWriteContract();

  /** Mints one tap's worth to the connected wallet. Resolves true once it is mined. */
  async function mint(): Promise<boolean> {
    if (!visible || !usdt || !address) return false;
    const receipt = await tx.run(() =>
      write({ abi: faucetAbi, address: usdt, functionName: "mint", args: [address, amount] }),
    );
    return Boolean(receipt);
  }

  return { visible: visible && Boolean(address), amount, mint, tx };
}
