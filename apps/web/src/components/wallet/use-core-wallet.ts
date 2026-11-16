"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { CORE_CONNECTOR_ID, TARGET_CHAIN } from "@/lib/wagmi";

export type WalletStatus =
  | "connecting"
  | "no-core" // Core extension not installed / not announced
  | "disconnected"
  | "wrong-network"
  | "ready";

/** Pure mapping from wagmi's account state to what the UI should show. */
export function walletStatusOf(input: {
  status: "connected" | "connecting" | "reconnecting" | "disconnected";
  chainId: number | undefined;
  hasCore: boolean;
}): WalletStatus {
  const { status, chainId, hasCore } = input;
  if (status === "connecting" || status === "reconnecting") return "connecting";
  if (status === "connected") return chainId === TARGET_CHAIN.id ? "ready" : "wrong-network";
  return hasCore ? "disconnected" : "no-core";
}

/** One place that answers "can this person use the app right now?" for Core Wallet. */
export function useCoreWallet() {
  const { address, chainId, status } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  const core = connectors.find((c) => c.id === CORE_CONNECTOR_ID);

  const walletStatus = walletStatusOf({ status, chainId, hasCore: Boolean(core) });

  return {
    address,
    chainId,
    status: walletStatus,
    targetChain: TARGET_CHAIN,
    connect: async () => {
      if (!core) throw new Error("Core Wallet not found");
      await connectAsync({ connector: core, chainId: TARGET_CHAIN.id });
    },
    switchToTarget: async () => {
      await switchChainAsync({ chainId: TARGET_CHAIN.id });
    },
    disconnect: () => disconnect(),
  };
}
