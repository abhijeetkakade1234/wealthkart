"use client";

import { circleFactoryAbi, circleVaultAbi } from "@wealthkart/sdk";
import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";

import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { useFactory } from "@/lib/circle";
import { isSet } from "@/lib/nominee";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** Most members read when looking for "who named me" (cap 50 plus people who left). */
export const NOMINEE_SCAN_MAX = 200;

export interface ClaimState {
  /** Open claim vote (0 = none). */
  requestId: bigint;
  /** Set once the vote passed: the share is paid here when the notice ends. */
  payTo: Address;
  /** When a passed claim can be paid (0 = no exit queued). */
  maturesAt: number;
  /** The queued exit is waiting for cash. */
  waiting: boolean;
}

type RawExit = { requestedAt: bigint | number; maturesAt: bigint | number; waiting: boolean };

function claimFrom(
  claim: readonly [bigint, Address] | undefined,
  exit: RawExit | undefined,
): ClaimState {
  const queued = exit && Number(exit.requestedAt) > 0;
  return {
    requestId: claim?.[0] ?? 0n,
    payTo: claim?.[1] ?? ZERO,
    maturesAt: queued ? Number(exit.maturesAt) : 0,
    waiting: queued ? exit.waiting : false,
  };
}

/**
 * The connected member's backup wallet in one circle (ADR 0056): who it is (and their name
 * here, if they're a member) and any claim about this member.
 */
export function useMyBackupWallet(circle: Address | null) {
  const { address } = useCoreWallet();
  const me = address ?? ZERO;
  const vault = { abi: circleVaultAbi, address: circle ?? undefined } as const;
  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...vault, functionName: "nomineeOf", args: [me] },
      { ...vault, functionName: "nomineeClaimOf", args: [me] },
      { ...vault, functionName: "exitOf", args: [me] },
    ] as const,
    query: { enabled: Boolean(circle && address), refetchInterval: 15_000 },
  });
  const ok = <T>(i: number): T | undefined =>
    q.data?.[i]?.status === "success" ? (q.data[i].result as T) : undefined;
  const nominee = ok<Address>(0);
  const name = useReadContract({
    ...vault,
    functionName: "nameOf",
    args: [nominee ?? ZERO],
    query: { enabled: Boolean(circle && isSet(nominee)) },
  });
  return {
    isPending: q.isPending,
    isError: q.isError || Boolean(q.data && q.data[0]?.status !== "success"),
    refetch: () => {
      void q.refetch();
      void name.refetch();
    },
    data: q.data
      ? {
          nominee: isSet(nominee) ? nominee : null,
          nomineeName: (name.data as string | undefined) ?? "",
          claim: claimFrom(ok<readonly [bigint, Address]>(1), ok<RawExit>(2)),
        }
      : undefined,
  };
}

export interface NamedBy {
  member: Address;
  name: string;
  active: boolean;
  dormant: boolean;
  /** Missed installments right now (0 while dormant). */
  overdue: number;
  /** What the member's share would pay out today, after the exit fee. */
  value: bigint;
  claim: ClaimState;
}

/**
 * Members of `circle` who named the connected wallet as their backup wallet. There is no
 * reverse index on chain, so this reads `nomineeOf` for every address in the member list
 * (at most NOMINEE_SCAN_MAX, one multicall) and keeps the matches.
 */
export function useNamedBy(circle: Address | null) {
  const { address } = useCoreWallet();
  const vault = { abi: circleVaultAbi, address: circle ?? undefined } as const;
  const len = useReadContract({
    ...vault,
    functionName: "memberListLength",
    query: { enabled: Boolean(circle && address) },
  });
  const n = Math.min(Number((len.data as bigint | undefined) ?? 0n), NOMINEE_SCAN_MAX);
  const list = useReadContract({
    ...vault,
    functionName: "membersPage",
    args: [0n, BigInt(n)],
    query: { enabled: Boolean(circle && address) && n > 0 },
  });
  const all = (list.data ?? []) as readonly Address[];
  const noms = useReadContracts({
    allowFailure: true,
    contracts: all.map(
      (m) => ({ ...vault, address: circle!, functionName: "nomineeOf", args: [m] }) as const,
    ),
    query: { enabled: all.length > 0, refetchInterval: 15_000 },
  });
  const mine = all.filter((_, i) => {
    const r = noms.data?.[i];
    return (
      r?.status === "success" &&
      address !== undefined &&
      (r.result as string).toLowerCase() === address.toLowerCase()
    );
  });
  const details = useReadContracts({
    allowFailure: true,
    contracts: mine.flatMap((m) => [
      { ...vault, address: circle!, functionName: "memberOf", args: [m] } as const,
      { ...vault, address: circle!, functionName: "nameOf", args: [m] } as const,
      { ...vault, address: circle!, functionName: "periodsOverdue", args: [m] } as const,
      { ...vault, address: circle!, functionName: "exitValue", args: [m] } as const,
      { ...vault, address: circle!, functionName: "nomineeClaimOf", args: [m] } as const,
      { ...vault, address: circle!, functionName: "exitOf", args: [m] } as const,
    ]),
    query: { enabled: mine.length > 0, refetchInterval: 15_000 },
  });
  const rows: NamedBy[] = mine.map((m, i) => {
    const r = details.data?.slice(i * 6, i * 6 + 6) ?? [];
    const ok = <T>(j: number): T | undefined =>
      r[j]?.status === "success" ? (r[j]!.result as T) : undefined;
    const mo = ok<{ active: boolean; dormant: boolean }>(0);
    return {
      member: m,
      name: ok<string>(1) ?? "",
      active: mo?.active ?? false,
      dormant: mo?.dormant ?? false,
      overdue: Number(ok<bigint>(2) ?? 0n),
      value: ok<bigint>(3) ?? 0n,
      claim: claimFrom(ok<readonly [bigint, Address]>(4), ok<RawExit>(5)),
    };
  });
  return {
    rows,
    isPending:
      Boolean(circle && address) &&
      (len.isPending ||
        (n > 0 && list.isPending) ||
        (all.length > 0 && noms.isPending) ||
        (mine.length > 0 && details.isPending)),
    isError: len.isError || list.isError || noms.isError,
    refetch: () => {
      void len.refetch();
      void list.refetch();
      void noms.refetch();
      void details.refetch();
    },
  };
}

/** The exit queue (live exits only), to know how far `processExits` must go. */
export function useExitQueue(circle: Address | null, enabled: boolean) {
  const vault = { abi: circleVaultAbi, address: circle ?? undefined } as const;
  const len = useReadContract({
    ...vault,
    functionName: "exitQueueLength",
    query: { enabled: Boolean(circle) && enabled },
  });
  const n = Number((len.data as bigint | undefined) ?? 0n);
  const page = useReadContract({
    ...vault,
    functionName: "exitQueuePage",
    args: [0n, BigInt(Math.min(n, 100))],
    query: { enabled: Boolean(circle) && enabled && n > 0 },
  });
  return {
    queue: (page.data ?? []) as readonly Address[],
    refetch: () => {
      void len.refetch();
      void page.refetch();
    },
  };
}

/** Circles checked for the first-run "backup wallet" item (same cap as the portfolio). */
export const COVERAGE_MAX = 100;

/**
 * Whether every circle the connected wallet is in has a backup wallet set (ADR 0056), for the
 * first-run checklist. `allSet` is undefined while loading and null if the read failed.
 */
export function useBackupCoverage() {
  const { address } = useCoreWallet();
  const factory = useFactory();
  const enabled = Boolean(factory && address);
  const list = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "circlesOf",
    args: address ? [address, 0n, BigInt(COVERAGE_MAX)] : undefined,
    query: { enabled },
  });
  const circles = (list.data ?? []) as readonly Address[];
  const noms = useReadContracts({
    allowFailure: true,
    contracts: circles.flatMap((c) => [
      { abi: circleVaultAbi, address: c, functionName: "nomineeOf", args: [address!] } as const,
      { abi: circleVaultAbi, address: c, functionName: "isMember", args: [address!] } as const,
    ]),
    query: { enabled: enabled && circles.length > 0 },
  });
  let allSet: boolean | undefined | null;
  if (!enabled || list.isPending || (circles.length > 0 && noms.isPending)) allSet = undefined;
  else if (list.isError || noms.isError) allSet = null;
  else if (circles.length === 0) allSet = false;
  else {
    allSet = circles.every((_, i) => {
      const n = noms.data?.[i * 2];
      const m = noms.data?.[i * 2 + 1];
      // A circle the wallet has left doesn't need one.
      if (m?.status === "success" && m.result === false) return true;
      return n?.status === "success" && isSet(n.result as string);
    });
  }
  return { allSet };
}
