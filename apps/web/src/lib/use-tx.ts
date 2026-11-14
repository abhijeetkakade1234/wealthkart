"use client";

import { explorerTxUrl } from "@wealthkart/sdk";
import { useCallback, useState } from "react";
import type { Hash, TransactionReceipt } from "viem";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import type { TxStatus } from "@/components/kit";

import { toFriendlyError } from "./messages";

export interface TxState {
  status: TxStatus | "idle";
  hash?: Hash;
  explorerUrl?: string;
  failedAt?: "confirm" | "sending";
  failedMessage?: string;
}

/**
 * Drives the TxTracker for one transaction: wallet confirm → sending → confirmed / failed.
 * `send` must return the tx hash (e.g. wagmi's writeContractAsync). Errors become
 * catalogue messages; the returned promise resolves to the receipt or null.
 */
export function useTx() {
  const config = useConfig();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const run = useCallback(
    async (send: () => Promise<Hash>): Promise<TransactionReceipt | null> => {
      setState({ status: "confirm" });
      let hash: Hash;
      try {
        hash = await send();
      } catch (e) {
        setState({
          status: "failed",
          failedAt: "confirm",
          failedMessage: toFriendlyError(e).message,
        });
        return null;
      }
      const chainId = config.state.chainId;
      const explorerUrl = explorerTxUrl(chainId, hash) ?? undefined;
      setState({ status: "sending", hash, explorerUrl });
      try {
        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        setState({ status: "confirmed", hash, explorerUrl });
        return receipt;
      } catch (e) {
        setState({
          status: "failed",
          failedAt: "sending",
          hash,
          explorerUrl,
          failedMessage: toFriendlyError(e).message,
        });
        return null;
      }
    },
    [config],
  );

  return { ...state, run, reset: () => setState({ status: "idle" }) };
}
