"use client";

import { TxTracker } from "@/components/kit";
import type { TxState } from "@/lib/use-tx";

/** The TxTracker for one `useTx` state, hidden while idle. */
export function TxFor({ tx }: { tx: TxState }) {
  if (tx.status === "idle") return null;
  return (
    <TxTracker
      status={tx.status}
      failedAt={tx.failedAt}
      failedMessage={tx.failedMessage}
      explorerUrl={tx.explorerUrl}
    />
  );
}
