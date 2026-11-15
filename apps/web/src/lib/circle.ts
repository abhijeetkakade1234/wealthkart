"use client";

import { DEPLOYMENTS, circleFactoryAbi, circleVaultAbi } from "@wealthkart/sdk";
import { type Address, isAddress } from "viem";
import { useBlock, useReadContract, useReadContracts } from "wagmi";

import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { type RequestKind, requestKind } from "@/lib/membership";

export const CIRCLES_PAGE_SIZE = 12;
export const MEMBERS_PAGE_SIZE = 10;

/** Build-time override for E2E runs against a local chain. Unset in real builds. */
const FACTORY_OVERRIDE = process.env.NEXT_PUBLIC_FACTORY_OVERRIDE;

/** The factory for the wallet's current chain, or null if not deployed there yet. */
export function useFactory(): Address | null {
  const { chainId } = useCoreWallet();
  if (!chainId) return null;
  if (FACTORY_OVERRIDE && isAddress(FACTORY_OVERRIDE)) return FACTORY_OVERRIDE;
  return DEPLOYMENTS[chainId]?.circleFactory ?? null;
}

/** Parses `?id=` safely; anything that isn't an address becomes null ("circle not found"). */
export function parseCircleId(raw: string | null): Address | null {
  return raw && isAddress(raw) ? (raw as Address) : null;
}

export interface CircleSummary {
  address: Address;
  name: string;
  totalAssets: bigint;
  memberCount: bigint;
  stake: bigint;
  due: { period: bigint; amount: bigint; fees: bigint; payable: boolean } | null;
  isMember: boolean;
}

/** One page of the connected wallet's circles, with the numbers each card needs. */
export function useMyCircles(page: number) {
  const { address } = useCoreWallet();
  const factory = useFactory();
  const enabled = Boolean(factory && address);

  const count = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "circlesOfCount",
    args: address ? [address] : undefined,
    query: { enabled },
  });

  const list = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "circlesOf",
    args: address
      ? [address, BigInt((page - 1) * CIRCLES_PAGE_SIZE), BigInt(CIRCLES_PAGE_SIZE)]
      : undefined,
    query: { enabled, placeholderData: (prev) => prev },
  });

  const circles = (list.data ?? []) as readonly Address[];
  const details = useReadContracts({
    allowFailure: true,
    contracts: circles.flatMap((c) => [
      { abi: circleVaultAbi, address: c, functionName: "name" } as const,
      { abi: circleVaultAbi, address: c, functionName: "totalAssets" } as const,
      { abi: circleVaultAbi, address: c, functionName: "memberCount" } as const,
      { abi: circleVaultAbi, address: c, functionName: "stakeOf", args: [address!] } as const,
      { abi: circleVaultAbi, address: c, functionName: "amountDue", args: [address!] } as const,
    ]),
    query: { enabled: enabled && circles.length > 0, placeholderData: (prev) => prev },
  });

  const summaries: CircleSummary[] = circles.map((c, i) => {
    const r = details.data?.slice(i * 5, i * 5 + 5) ?? [];
    const due =
      r[4]?.status === "success"
        ? (r[4].result as readonly [bigint, bigint, bigint, boolean])
        : null;
    return {
      address: c,
      name: r[0]?.status === "success" ? (r[0].result as string) : "Circle",
      totalAssets: r[1]?.status === "success" ? (r[1].result as bigint) : 0n,
      memberCount: r[2]?.status === "success" ? (r[2].result as bigint) : 0n,
      stake: r[3]?.status === "success" ? (r[3].result as bigint) : 0n,
      // amountDue reverts with NotAMember for circles this wallet isn't in.
      due: due ? { period: due[0], amount: due[1], fees: due[2], payable: due[3] } : null,
      isMember: r[4]?.status === "success",
    };
  });

  return {
    factory,
    total: count.data === undefined ? undefined : Number(count.data),
    circles: summaries,
    isPending:
      enabled && (count.isPending || list.isPending || (circles.length > 0 && details.isPending)),
    isError: count.isError || list.isError,
    refetch: () => {
      void count.refetch();
      void list.refetch();
      void details.refetch();
    },
  };
}

/** Everything the circle overview and pay pages need about one circle. */
export function useCircle(id: Address | null) {
  const { address } = useCoreWallet();
  const enabled = Boolean(id && address);
  const vault = { abi: circleVaultAbi, address: id ?? undefined } as const;

  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...vault, functionName: "name" },
      { ...vault, functionName: "totalAssets" },
      { ...vault, functionName: "memberCount" },
      { ...vault, functionName: "installment" },
      { ...vault, functionName: "dueDay" },
      { ...vault, functionName: "fee1" },
      { ...vault, functionName: "fee2" },
      { ...vault, functionName: "secondFeeDay" },
      { ...vault, functionName: "holidaysPerYear" },
      { ...vault, functionName: "navPerShareE18" },
      { ...vault, functionName: "isMember", args: [address!] },
      { ...vault, functionName: "stakeOf", args: [address!] },
      { ...vault, functionName: "amountDue", args: [address!] },
      { ...vault, functionName: "votingWindow" },
      { ...vault, functionName: "quorumPct" },
      { ...vault, functionName: "maxMembers" },
      { ...vault, functionName: "memberListLength" },
      { ...vault, functionName: "nameOf", args: [address!] },
      { ...vault, functionName: "memberOf", args: [address!] },
      { ...vault, functionName: "founderInviteExpiry", args: [address!] },
      { ...vault, functionName: "openRequestOf", args: [address!] },
      { ...vault, functionName: "openRequestCount" },
      { ...vault, functionName: "dormantAfter" },
      { ...vault, functionName: "dormantCount" },
      { ...vault, functionName: "minPaidToVote" },
    ] as const,
    query: { enabled },
  });
  const registry = useIsCircle(id);

  const r = q.data;
  const ok = <T>(i: number): T | undefined =>
    r?.[i]?.status === "success" ? (r[i].result as T) : undefined;
  const due = ok<readonly [bigint, bigint, bigint, boolean]>(12);

  const me = ok<{
    active: boolean;
    dormant: boolean;
    nextPeriod: number;
    seq: number;
    nameChangedAt: bigint;
  }>(18);

  return {
    ...q,
    refetch: () => {
      void registry.refetch();
      return q.refetch();
    },
    isPending: q.isPending || registry.isPending,
    /** The factory says this address isn't one of its circles (RT-01): never pay it. */
    notACircle: registry.isCircle === false,
    // name failing means the address isn't a WealthKart circle on this network
    notFound: registry.isCircle === false || Boolean(r && r[0]?.status !== "success"),
    data: r
      ? {
          name: ok<string>(0) ?? "",
          totalAssets: ok<bigint>(1) ?? 0n,
          memberCount: ok<bigint>(2) ?? 0n,
          installment: ok<bigint>(3) ?? 0n,
          dueDay: ok<number>(4) ?? 10,
          fee1: ok<bigint>(5) ?? 0n,
          fee2: ok<bigint>(6) ?? 0n,
          secondFeeDay: ok<number>(7) ?? 20,
          holidaysPerYear: ok<number>(8) ?? 0,
          navPerShareE18: ok<bigint>(9) ?? 0n,
          isMember: ok<boolean>(10) ?? false,
          stake: ok<bigint>(11) ?? 0n,
          due: due ? { period: due[0], amount: due[1], fees: due[2], payable: due[3] } : null,
          votingWindow: ok<number>(13) ?? 0,
          quorumPct: ok<number>(14) ?? 50,
          maxMembers: ok<number>(15) ?? 0,
          memberListLength: ok<bigint>(16) ?? 0n,
          myName: ok<string>(17) ?? "",
          myNameChangedAt: me ? Number(me.nameChangedAt) : 0,
          founderInviteExpiry: Number(ok<bigint>(19) ?? 0n),
          openRequestId: ok<bigint>(20) ?? 0n,
          openRequestCount: Number(ok<bigint>(21) ?? 0n),
          dormantAfter: ok<number>(22) ?? 3,
          dormantCount: Number(ok<bigint>(23) ?? 0n),
          minPaidToVote: ok<number>(24) ?? 2,
          /** The circle voted this wallet dormant (ADR 0032); paying or waking ends it. */
          iAmDormant: me?.dormant ?? false,
        }
      : undefined,
  };
}

/**
 * Asks the factory whether `id` is one of its circles (RT-01). A look-alike contract
 * that answers name() is still refused. `isCircle` is undefined while loading or when
 * no factory is known for this network.
 */
export function useIsCircle(id: Address | null) {
  const factory = useFactory();
  const q = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "isCircle",
    args: id ? [id] : undefined,
    query: { enabled: Boolean(factory && id) },
  });
  return {
    isCircle: q.data as boolean | undefined,
    isPending: Boolean(factory && id) && q.isPending,
    refetch: q.refetch,
  };
}

/**
 * One page of the circle's member list (everyone who ever joined, so page with
 * `memberListLength`, not `memberCount`), with names, share balances, missed months and
 * any open dormant vote about them.
 */
export function useCircleMembers(id: Address | null, page: number) {
  const list = useReadContract({
    abi: circleVaultAbi,
    address: id ?? undefined,
    functionName: "membersPage",
    args: [BigInt((page - 1) * MEMBERS_PAGE_SIZE), BigInt(MEMBERS_PAGE_SIZE)],
    query: { enabled: Boolean(id), placeholderData: (prev) => prev },
  });
  const members = (list.data ?? []) as readonly Address[];
  const info = useReadContracts({
    allowFailure: true,
    contracts: members.flatMap((m) => [
      { abi: circleVaultAbi, address: id!, functionName: "memberOf", args: [m] } as const,
      { abi: circleVaultAbi, address: id!, functionName: "stakeOf", args: [m] } as const,
      { abi: circleVaultAbi, address: id!, functionName: "nameOf", args: [m] } as const,
      { abi: circleVaultAbi, address: id!, functionName: "periodsOverdue", args: [m] } as const,
      { abi: circleVaultAbi, address: id!, functionName: "openDormantOf", args: [m] } as const,
    ]),
    query: { enabled: Boolean(id) && members.length > 0, placeholderData: (prev) => prev },
  });
  return {
    ...list,
    rows: members.map((m, i) => {
      const [mo, st, nm, od, dv] = info.data?.slice(i * 5, i * 5 + 5) ?? [];
      const member =
        mo?.status === "success"
          ? (mo.result as {
              active: boolean;
              dormant: boolean;
              voter: boolean;
              paid: number;
              nextPeriod: number;
              shares: bigint;
            })
          : null;
      return {
        address: m,
        active: member?.active ?? true,
        dormant: member?.dormant ?? false,
        /** Has voting rights (ADR 0033); false while a newcomer is still paying in. */
        voter: member?.voter ?? true,
        paid: member?.paid ?? 0,
        overdue: od?.status === "success" ? Number(od.result as bigint) : 0,
        openDormantId: dv?.status === "success" ? (dv.result as bigint) : 0n,
        name: nm?.status === "success" ? (nm.result as string) : "",
        nextPeriod: member ? BigInt(member.nextPeriod) : null,
        shares: member?.shares ?? 0n,
        stake: st?.status === "success" ? (st.result as bigint) : 0n,
      };
    }),
    isPending: list.isPending || (members.length > 0 && info.isPending),
    refetch: () => {
      void list.refetch();
      void info.refetch();
    },
  };
}

export const REQUESTS_PAGE_SIZE = 10;

/** An open request: someone asking to join, or a member the circle may mark dormant. */
export interface JoinRequestView {
  id: bigint;
  kind: RequestKind;
  /** Join: the applicant. Dormant: the member it is about. */
  account: Address;
  deadline: number;
  eligible: number;
  /** Join: who vouched. Dormant: who proposed it. */
  invitedBy: Address;
  inviterName: string;
  /** Dormant: the member's display name (join requests carry `displayName`). */
  accountName: string;
  /** Open requests naming the same inviter or proposer (at most 3, ADR 0033). */
  inviterOpen: number;
  /** Members admitted with this inviter confirmed. */
  inviterAdmitted: number;
  inviterConfirmed: boolean;
  yes: number;
  no: number;
  status: number;
  displayName: string;
  canVote: boolean;
  hasVoted: boolean;
}

type RawRequest = {
  kind: number;
  account: Address;
  deadline: bigint;
  eligible: number;
  invitedBy: Address;
  yes: number;
  no: number;
  status: number;
  inviterConfirmed: boolean;
  displayName: string;
};

function toView(
  id: bigint,
  r: RawRequest,
): Omit<
  JoinRequestView,
  "inviterName" | "accountName" | "inviterOpen" | "inviterAdmitted" | "canVote" | "hasVoted"
> {
  return {
    id,
    kind: requestKind(Number(r.kind)),
    account: r.account,
    deadline: Number(r.deadline),
    eligible: Number(r.eligible),
    invitedBy: r.invitedBy,
    inviterConfirmed: r.inviterConfirmed,
    yes: Number(r.yes),
    no: Number(r.no),
    status: Number(r.status),
    displayName: r.displayName,
  };
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** One page of open requests (join and dormant), with whether the connected wallet can vote on each. */
export function useJoinRequests(id: Address | null, page: number) {
  const { address } = useCoreWallet();
  const enabled = Boolean(id && address);
  const vault = { abi: circleVaultAbi, address: id ?? undefined } as const;

  const count = useReadContract({
    ...vault,
    functionName: "openRequestCount",
    query: { enabled, refetchInterval: 15_000 },
  });
  const list = useReadContract({
    ...vault,
    functionName: "openRequestsPage",
    args: [BigInt((page - 1) * REQUESTS_PAGE_SIZE), BigInt(REQUESTS_PAGE_SIZE)],
    query: { enabled, refetchInterval: 15_000, placeholderData: (prev) => prev },
  });
  const ids = (list.data?.[0] ?? []) as readonly bigint[];
  const raws = (list.data?.[1] ?? []) as readonly RawRequest[];

  const extra = useReadContracts({
    allowFailure: true,
    contracts: ids.flatMap((rid, i) => [
      { ...vault, address: id!, functionName: "canVote", args: [rid, address!] } as const,
      { ...vault, address: id!, functionName: "hasVoted", args: [rid, address!] } as const,
      {
        ...vault,
        address: id!,
        functionName: "nameOf",
        args: [raws[i]?.invitedBy ?? ZERO],
      } as const,
      {
        ...vault,
        address: id!,
        functionName: "nameOf",
        args: [raws[i]?.account ?? ZERO],
      } as const,
      {
        ...vault,
        address: id!,
        functionName: "openRequestsBy",
        args: [raws[i]?.invitedBy ?? ZERO],
      } as const,
      {
        ...vault,
        address: id!,
        functionName: "admittedVia",
        args: [raws[i]?.invitedBy ?? ZERO],
      } as const,
    ]),
    query: { enabled: enabled && ids.length > 0, placeholderData: (prev) => prev },
  });

  const requests: JoinRequestView[] = ids.map((rid, i) => {
    const e = extra.data?.slice(i * 6, i * 6 + 6) ?? [];
    return {
      ...toView(rid, raws[i]!),
      canVote: e[0]?.status === "success" ? (e[0].result as boolean) : false,
      hasVoted: e[1]?.status === "success" ? (e[1].result as boolean) : false,
      inviterName: e[2]?.status === "success" ? (e[2].result as string) : "",
      accountName: e[3]?.status === "success" ? (e[3].result as string) : "",
      inviterOpen: e[4]?.status === "success" ? Number(e[4].result as bigint) : 0,
      inviterAdmitted: e[5]?.status === "success" ? Number(e[5].result as bigint) : 0,
    };
  });

  return {
    total: count.data === undefined ? undefined : Number(count.data),
    requests,
    isPending: enabled && (count.isPending || list.isPending),
    isError: count.isError || list.isError,
    refetch: () => {
      void count.refetch();
      void list.refetch();
      void extra.refetch();
    },
  };
}

/** One join request by id (e.g. the applicant's own), polled while it may still change. */
export function useJoinRequest(id: Address | null, requestId: bigint | null) {
  const q = useReadContract({
    abi: circleVaultAbi,
    address: id ?? undefined,
    functionName: "getRequest",
    args: requestId ? [requestId] : undefined,
    query: { enabled: Boolean(id && requestId), refetchInterval: 15_000 },
  });
  return {
    ...q,
    request: q.data && requestId ? toView(requestId, q.data as RawRequest) : null,
  };
}

/**
 * Chain time (latest block timestamp, seconds). Deadlines are judged by the chain, not the
 * device clock, so "voting has ended" matches what the contract will decide.
 */
export function useChainNow(): number {
  const block = useBlock({ query: { refetchInterval: 15_000 } });
  return block.data ? Number(block.data.timestamp) : Math.floor(Date.now() / 1000);
}

/** Circles summed on the portfolio header; more than this shows a note instead of a wrong total. */
export const PORTFOLIO_MAX = 100;

export interface PortfolioRow {
  address: Address;
  name: string;
  stake: bigint;
  /** Installments this wallet has paid here, times the installment (late fees not included). */
  paidIn: bigint;
  /** This wallet's share of the circle, in basis points (0..10000). */
  shareBps: number;
}

/**
 * Totals across every circle this wallet is in (PLAN.md D7, "My portfolio"): value, what was
 * paid in, gain, and the split by circle. Reads up to PORTFOLIO_MAX circles.
 */
export function usePortfolio() {
  const { address } = useCoreWallet();
  const factory = useFactory();
  const enabled = Boolean(factory && address);

  const list = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "circlesOf",
    args: address ? [address, 0n, BigInt(PORTFOLIO_MAX)] : undefined,
    query: { enabled },
  });
  const count = useReadContract({
    abi: circleFactoryAbi,
    address: factory ?? undefined,
    functionName: "circlesOfCount",
    args: address ? [address] : undefined,
    query: { enabled },
  });
  const circles = (list.data ?? []) as readonly Address[];
  const details = useReadContracts({
    allowFailure: true,
    contracts: circles.flatMap((c) => [
      { abi: circleVaultAbi, address: c, functionName: "name" } as const,
      { abi: circleVaultAbi, address: c, functionName: "stakeOf", args: [address!] } as const,
      { abi: circleVaultAbi, address: c, functionName: "memberOf", args: [address!] } as const,
      { abi: circleVaultAbi, address: c, functionName: "installment" } as const,
      { abi: circleVaultAbi, address: c, functionName: "totalAssets" } as const,
    ]),
    query: { enabled: enabled && circles.length > 0 },
  });

  const rows: PortfolioRow[] = circles.map((c, i) => {
    const r = details.data?.slice(i * 5, i * 5 + 5) ?? [];
    const ok = <T>(j: number): T | undefined =>
      r[j]?.status === "success" ? (r[j]!.result as T) : undefined;
    const stake = ok<bigint>(1) ?? 0n;
    const paid = ok<{ paid: number }>(2)?.paid ?? 0;
    const installment = ok<bigint>(3) ?? 0n;
    const assets = ok<bigint>(4) ?? 0n;
    return {
      address: c,
      name: ok<string>(0) ?? "Circle",
      stake,
      paidIn: BigInt(paid) * installment,
      shareBps: assets > 0n ? Number((stake * 10_000n) / assets) : 0,
    };
  });
  const value = rows.reduce((s, r) => s + r.stake, 0n);
  const paidIn = rows.reduce((s, r) => s + r.paidIn, 0n);
  const total = count.data === undefined ? undefined : Number(count.data);

  return {
    rows,
    value,
    paidIn,
    gain: value - paidIn,
    total,
    truncated: total !== undefined && total > PORTFOLIO_MAX,
    isPending: enabled && (list.isPending || (circles.length > 0 && details.isPending)),
    isError: list.isError || details.isError,
    refetch: () => {
      void list.refetch();
      void details.refetch();
    },
  };
}
