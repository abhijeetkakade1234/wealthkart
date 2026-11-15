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
  /** Every decoded log, oldest first, for the activity feed. */
  logs: DecodedLog[];
  /** True when the circle is older than MAX_CHUNKS * LOG_CHUNK blocks: only recent history. */
  partial: boolean;
  /** First block actually read. */
  fromBlock: bigint;
}

export type DecodedLog = {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: `0x${string}` | null;
};

/** Turns decoded vault logs into the analytics event shape; ignores events charts don't use. */
export function normalise(logs: readonly DecodedLog[]): CircleEvent[] {
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

/** Indexer base URL (ADR 0036); empty means read everything from the RPC. */
export const INDEXER_URL = (process.env.NEXT_PUBLIC_INDEXER_URL || "").replace(/\/$/, "");

/** Turns the indexer's bigint encoding ({"$n":"123"}) back into bigints. */
export function reviveBigints<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reviveBigints) as T;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === "$n" && typeof o.$n === "string") {
      return BigInt(o.$n) as T;
    }
    return Object.fromEntries(keys.map((k) => [k, reviveBigints(o[k])])) as T;
  }
  return value;
}

type IndexerPage = {
  chainId: number;
  indexedTo: string | null;
  logs: Array<{
    eventName: string;
    args: unknown;
    blockNumber: string;
    logIndex: number;
    transactionHash: `0x${string}`;
  }>;
  next: { fromBlock: number; fromLogIndex: number } | null;
};

/** Pages through the indexer's logs for one circle. Null if it serves another chain. */
export async function fetchIndexed(
  base: string,
  circle: string,
  chainId: number,
  fetcher: typeof fetch = fetch,
): Promise<{ logs: DecodedLog[]; indexedTo: bigint } | null> {
  const logs: DecodedLog[] = [];
  let cursor = { fromBlock: 0, fromLogIndex: 0 };
  let indexedTo: bigint | null = null;
  for (let page = 0; page < 100; page++) {
    const url = `${base}/v1/circles/${circle}/logs?fromBlock=${cursor.fromBlock}&fromLogIndex=${cursor.fromLogIndex}`;
    const res = await fetcher(url);
    if (!res.ok) throw new Error(`Indexer answered ${res.status}`);
    const body = (await res.json()) as IndexerPage;
    if (body.chainId !== chainId || body.indexedTo === null) return null;
    // The first page's cursor is the safe one: later pages may include newer blocks.
    if (indexedTo === null) indexedTo = BigInt(body.indexedTo);
    for (const l of body.logs) {
      const block = BigInt(l.blockNumber);
      if (block > indexedTo) continue;
      logs.push({
        eventName: l.eventName,
        args: reviveBigints(l.args) as Record<string, unknown>,
        blockNumber: block,
        logIndex: l.logIndex,
        transactionHash: l.transactionHash,
      });
    }
    if (!body.next) break;
    cursor = body.next;
  }
  return { logs, indexedTo: indexedTo ?? 0n };
}

/** Every event of one circle, from the indexer and the chain, refreshed every 30 s. */
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
      // No cache: a refetch right after a transaction must see the block it landed in.
      const latest = await client!.getBlockNumber({ cacheTime: 0 });
      // History from the indexer when one is configured (ADR 0036); only the newest blocks
      // come from the RPC. Any indexer trouble falls back to reading the RPC directly.
      let start = createdAt!;
      const logs: DecodedLog[] = [];
      let fromIndexer = false;
      if (INDEXER_URL) {
        try {
          const indexed = await fetchIndexed(INDEXER_URL, id!, client!.chain.id);
          if (indexed) {
            logs.push(...indexed.logs);
            if (indexed.indexedTo + 1n > start) start = indexed.indexedTo + 1n;
            fromIndexer = true;
          }
        } catch {
          logs.length = 0;
        }
      }
      const { ranges, partial } =
        start > latest
          ? { ranges: [] as Array<[bigint, bigint]>, partial: false }
          : chunkRanges(start, latest, LOG_CHUNK, MAX_CHUNKS);
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
        for (const part of batch) logs.push(...(part as unknown as DecodedLog[]));
      }
      return {
        events: normalise(logs),
        logs,
        partial: !fromIndexer && partial,
        fromBlock: fromIndexer ? createdAt! : (ranges[0]?.[0] ?? createdAt!),
      };
    },
  });
}
