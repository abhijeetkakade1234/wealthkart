"use client";

import { explorerTxUrl } from "@wealthkart/sdk";
import { useCallback, useRef, useState } from "react";
import type { Hash, TransactionReceipt } from "viem";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import type { TxStatus } from "@/components/kit";

import { type FriendlyErrorCode, toFriendlyError } from "./messages";

export interface TxState {
  status: TxStatus | "idle";
  hash?: Hash;
  explorerUrl?: string;
  failedAt?: "confirm" | "sending";
  failedMessage?: string;
  /** Catalogue code of the failure, so a caller can react (e.g. approve again). */
  failedCode?: FriendlyErrorCode;
}

/**
 * Drives the TxTracker for one transaction: wallet confirm → sending → confirmed / failed.
 * `send` must return the tx hash (e.g. wagmi's writeContractAsync). Errors become
 * catalogue messages; the returned promise resolves to the receipt or null.
 */
export function useTx() {
  const config = useConfig();
  const [state, setState] = useState<TxState>({ status: "idle" });
  const lastCode = useRef<FriendlyErrorCode | undefined>(undefined);

  const run = useCallback(
    async (send: () => Promise<Hash>): Promise<TransactionReceipt | null> => {
      setState({ status: "confirm" });
      lastCode.current = undefined;
      let hash: Hash;
      try {
        hash = await send();
      } catch (e) {
        const f = toFriendlyError(e);
        lastCode.current = f.code;
        setState({
          status: "failed",
          failedAt: "confirm",
          failedMessage: f.message,
          failedCode: f.code,
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
        const f = toFriendlyError(e);
        lastCode.current = f.code;
        setState({
          status: "failed",
          failedAt: "sending",
          hash,
          explorerUrl,
          failedMessage: f.message,
          failedCode: f.code,
        });
        return null;
      }
    },
    [config],
  );

  return {
    ...state,
    run,
    /** Code of the last failure, readable right after `run` resolves (state lags a render). */
    lastFailedCode: () => lastCode.current,
    /** Shows a failure that happened before anything reached the wallet (e.g. a balance check). */
    fail: (failedMessage: string, failedCode?: FriendlyErrorCode) =>
      setState({ status: "failed", failedAt: "confirm", failedMessage, failedCode }),
    reset: () => setState({ status: "idle" }),
  };
}
