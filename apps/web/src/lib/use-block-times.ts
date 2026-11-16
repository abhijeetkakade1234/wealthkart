"use client";

import { useQueries } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import { formatDate } from "@/i18n/runtime";

/** Timestamps for the blocks on the current page only (one read per block, cached). */
export function useBlockTimes(items: ReadonlyArray<{ block: bigint }>): Map<string, number> {
  const client = usePublicClient();
  const blocks = [...new Set(items.map((i) => i.block))];
  const results = useQueries({
    queries: blocks.map((b) => ({
      queryKey: ["block-time", client?.chain.id, String(b)],
      enabled: Boolean(client),
      staleTime: Infinity,
      queryFn: async () => Number((await client!.getBlock({ blockNumber: b })).timestamp),
    })),
  });
  const out = new Map<string, number>();
  blocks.forEach((b, i) => {
    const t = results[i]?.data;
    if (t !== undefined) out.set(String(b), t);
  });
  return out;
}

/** "3 Dec 2026, 14:05 UTC": deadlines and records are UTC on-chain (ADR 0014). */
export function formatWhen(sec: number): string {
  const d = new Date(sec * 1000);
  // English stays en-GB ("3 Dec 2026"); hi/mr use their own month names.
  const date = formatDate(d, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = formatDate(d, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${date}, ${time} UTC`;
}
