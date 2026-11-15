"use client";

import { useQuery } from "@tanstack/react-query";
import { circleVaultAbi } from "@wealthkart/sdk";
import type { Address } from "viem";
import { usePublicClient, useReadContract } from "wagmi";

import type { CircleEvent } from "@/lib/analytics";

/**
 * Block range per `eth_getLogs` call. Public Avalanche RPCs cap the range (2048 blocks), so we
 * read in chunks from the circle's `createdAtBlock`. The Phase 1 indexer replaces this with a
 * cached feed; until then `MAX_CHUNKS` bounds the work and the result says if it was cut short.
 */
export const LOG_CHUNK = BigInt(process.env.NEXT_PUBLIC_LOG_CHUNK || 2048);
export const MAX_CHUNKS = 300;
const PARALLEL = 4;

export interface CircleEvents {
  events: CircleEvent[];
  /** True when the circle is older than MAX_CHUNKS * LOG_CHUNK blocks: only recent history. */
  partial: boolean;
  /** First block actually read. */
  fromBlock: bigint;
}

type Decoded = {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: `0x${string}` | null;
};

/** Turns decoded vault logs into the analytics event shape; ignores events charts don't use. */
export function normalise(logs: readonly Decoded[]): CircleEvent[] {
  const out: CircleEvent[] = [];
  for (const l of logs) {
    const base = {
      block: l.blockNumber ?? 0n,
      logIndex: l.logIndex ?? 0,
      tx: l.transactionHash ?? "",
    };
    const a = l.args;
    switch (l.eventName) {
      case "Contributed":
        out.push({
          type: "contributed",
          member: a.member as string,
          period: Number(a.period as bigint),
          installment: a.installment as bigint,
          fees: a.lateFees as bigint,
          shares: a.sharesMinted as bigint,
          ...base,
        });
        break;
      case "HolidayDeclared":
        out.push({
          type: "holiday",
          member: a.member as string,
          period: Number(a.period as bigint),
          ...base,
        });
        break;
      case "MemberAdded":
        out.push({
          type: "joined",
          member: a.member as string,
          joinPeriod: Number(a.joinPeriod as bigint),
          ...base,
        });
        break;
      case "MemberDormant":
        out.push({
          type: "dormant",
          member: a.member as string,
          period: Number(a.period as bigint),
          ...base,
        });
        break;
      case "MemberWoke":
        out.push({
          type: "woke",
          member: a.member as string,
          nextPeriod: Number(a.nextPeriod as bigint),
          ...base,
        });
        break;
    }
  }
  return out;
}

/** Splits [from, to] into chunks of `size` blocks, keeping only the newest `max` chunks. */
export function chunkRanges(
  from: bigint,
  to: bigint,
  size: bigint,
  max: number,
): { ranges: Array<[bigint, bigint]>; partial: boolean } {
  const ranges: Array<[bigint, bigint]> = [];
  for (let end = to; end >= from && ranges.length < max; end -= size) {
    const start = end - size + 1n > from ? end - size + 1n : from;
    ranges.push([start, end]);
    if (start === from) break;
  }
  const partial = ranges.length > 0 && ranges[ranges.length - 1]![0] > from;
  return { ranges: ranges.reverse(), partial };
}

/** Every event of one circle, read from the chain, refreshed every 30 s. */
export function useCircleEvents(id: Address | null) {
  const client = usePublicClient();
  const created = useReadContract({
    abi: circleVaultAbi,
    address: id ?? undefined,
    functionName: "createdAtBlock",
    query: { enabled: Boolean(id) },
  });
  const createdAt = created.data as bigint | undefined;

  return useQuery({
    queryKey: ["circle-events", id, client?.chain.id, String(createdAt)],
    enabled: Boolean(id && client && createdAt !== undefined),
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<CircleEvents> => {
      const latest = await client!.getBlockNumber();
      const { ranges, partial } = chunkRanges(createdAt!, latest, LOG_CHUNK, MAX_CHUNKS);
      const logs: Decoded[] = [];
      for (let i = 0; i < ranges.length; i += PARALLEL) {
        const batch = await Promise.all(
          ranges.slice(i, i + PARALLEL).map(([fromBlock, toBlock]) =>
            client!.getContractEvents({
              address: id!,
              abi: circleVaultAbi,
              fromBlock,
              toBlock,
            }),
          ),
        );
        for (const part of batch) logs.push(...(part as unknown as Decoded[]));
      }
      return {
        events: normalise(logs),
        partial,
        fromBlock: ranges[0]?.[0] ?? createdAt!,
      };
    },
  });
}
