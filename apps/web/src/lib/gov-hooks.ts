"use client";

import { circleVaultAbi } from "@wealthkart/sdk";
import type { Address } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { useReadContract, useReadContracts } from "wagmi";

import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { type ExitEntry, type ProposalKind, proposalKind } from "@/lib/governance";
import { type RulesParams, rulesFromChain } from "@/lib/rules";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/**
 * Exits, guardian and governance state of one circle for the connected wallet (ADR 0039,
 * 0040): current rules, a passed rule change waiting to apply, pause and rage-quit windows,
 * dissolution, this wallet's pending exit and anything waiting to be withdrawn.
 */
export function useCircleGov(id: Address | null) {
  const { address } = useCoreWallet();
  const me = address ?? ZERO;
  const vault = { abi: circleVaultAbi, address: id ?? undefined } as const;
  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...vault, functionName: "rules" },
      { ...vault, functionName: "pendingRuleChange" },
      { ...vault, functionName: "pausedUntil" },
      { ...vault, functionName: "rageQuitUntil" },
      { ...vault, functionName: "dissolved" },
      { ...vault, functionName: "guardianDisabled" },
      { ...vault, functionName: "exitOf", args: [me] },
      { ...vault, functionName: "exitValue", args: [me] },
      { ...vault, functionName: "exitsWaiting" },
      { ...vault, functionName: "withdrawable", args: [me] },
      { ...vault, functionName: "loansOutstanding" },
      { ...vault, functionName: "creator" },
      { ...vault, functionName: "memberOf", args: [me] },
      { ...vault, functionName: "nomineeClaimOf", args: [me] },
    ] as const,
    query: { enabled: Boolean(id && address), refetchInterval: 15_000 },
  });
  const queryClient = useQueryClient();
  const r = q.data;
  const ok = <T>(i: number): T | undefined =>
    r?.[i]?.status === "success" ? (r[i].result as T) : undefined;

  const rulesRaw = ok<object>(0);
  const pending = ok<readonly [object, bigint | number]>(1);
  const entry = ok<{
    requestedAt: bigint | number;
    maturesAt: bigint | number;
    slot: number;
    feeBps: number;
    waiting: boolean;
  }>(6);
  const member = ok<{ frozen: boolean; loanTies: number; active: boolean }>(12);
  const creator = ok<Address>(11);
  const pendingAt = pending ? Number(pending[1]) : 0;

  const exit: ExitEntry | null = entry
    ? {
        requestedAt: Number(entry.requestedAt),
        maturesAt: Number(entry.maturesAt),
        feeBps: Number(entry.feeBps),
        waiting: entry.waiting,
      }
    : null;

  return {
    ...q,
    /**
     * Refetches every chain read on the page (this state, proposal lists, chain time) after a
     * transaction, so a new proposal or a window that just ended shows at once.
     */
    refetch: () => {
      void queryClient.invalidateQueries({
        predicate: (x) =>
          ["block", "readContract", "readContracts"].includes(String(x.queryKey[0])),
      });
      return q.refetch();
    },
    data: r
      ? {
          rules: rulesRaw ? rulesFromChain(rulesRaw) : null,
          pendingRules: pending && pendingAt > 0 ? rulesFromChain(pending[0]) : null,
          /** When the passed rule change can be applied (0 = none waiting). */
          pendingAt,
          pausedUntil: Number(ok<bigint | number>(2) ?? 0),
          rageQuitUntil: Number(ok<bigint | number>(3) ?? 0),
          dissolved: ok<boolean>(4) ?? false,
          guardianDisabled: ok<boolean>(5) ?? false,
          // "No exit pending" is requestedAt == 0 (ADR 0043: the queue is a linked list now).
          exit: exit && exit.requestedAt > 0 ? exit : null,
          exitValue: ok<bigint>(7) ?? 0n,
          exitsWaiting: Number(ok<bigint>(8) ?? 0n),
          withdrawable: ok<bigint>(9) ?? 0n,
          loansOutstanding: ok<bigint>(10) ?? 0n,
          creator: creator ?? ZERO,
          isGuardian: Boolean(
            address && creator && creator.toLowerCase() === address.toLowerCase(),
          ),
          frozen: member?.frozen ?? false,
          loanTies: Number(member?.loanTies ?? 0),
          /** This wallet's queued exit is a passed backup-wallet claim (ADR 0056), not its own. */
          claimQueued: Boolean(
            ok<readonly [bigint, Address]>(13) &&
            ok<readonly [bigint, Address]>(13)![1].toLowerCase() !== ZERO,
          ),
        }
      : undefined,
  };
}

/** At most 10 proposals are open at once (Governance.MAX_OPEN_PROPOSALS), so one read gets all. */
export const MAX_OPEN_PROPOSALS = 10;
export const PROPOSALS_PAGE_SIZE = 5;

export interface ProposalView {
  id: bigint;
  kind: ProposalKind;
  status: number;
  reason: number;
  passPct: number;
  eligible: number;
  yes: number;
  no: number;
  proposer: Address;
  proposerName: string;
  deadline: number;
  subject: Address;
  subjectName: string;
  period: number;
  canVote: boolean;
  /** Rule changes: the rules asked for. */
  newRules: RulesParams | null;
}

type RawProposal = {
  kind: number;
  status: number;
  reason: number;
  passPct: number;
  eligible: number;
  yes: number;
  no: number;
  proposer: Address;
  deadline: bigint;
  subject: Address;
  period: number;
};

/**
 * Open circle proposals, paged in the browser (`page` is 1-based, PROPOSALS_PAGE_SIZE each),
 * with names, whether this wallet can vote, and the rules a rule change asks for.
 */
export function useProposals(id: Address | null, page: number) {
  const { address } = useCoreWallet();
  const enabled = Boolean(id && address);
  const vault = { abi: circleVaultAbi, address: id ?? undefined } as const;
  const list = useReadContract({
    ...vault,
    functionName: "openProposalsPage",
    args: [0n, BigInt(MAX_OPEN_PROPOSALS)],
    query: { enabled, refetchInterval: 15_000, placeholderData: (prev) => prev },
  });
  const allIds = (list.data?.[0] ?? []) as readonly bigint[];
  const allRaw = (list.data?.[1] ?? []) as readonly RawProposal[];
  const total = allIds.length;
  const from = (page - 1) * PROPOSALS_PAGE_SIZE;
  const ids = allIds.slice(from, from + PROPOSALS_PAGE_SIZE);
  const raws = allRaw.slice(from, from + PROPOSALS_PAGE_SIZE);

  const extra = useReadContracts({
    allowFailure: true,
    contracts: ids.flatMap((pid, i) => [
      {
        ...vault,
        address: id!,
        functionName: "canVoteProposal",
        args: [pid, address ?? ZERO],
      } as const,
      {
        ...vault,
        address: id!,
        functionName: "nameOf",
        args: [raws[i]?.proposer ?? ZERO],
      } as const,
      { ...vault, address: id!, functionName: "nameOf", args: [raws[i]?.subject ?? ZERO] } as const,
      { ...vault, address: id!, functionName: "proposalRules", args: [pid] } as const,
    ]),
    query: { enabled: enabled && ids.length > 0, placeholderData: (prev) => prev },
  });

  const proposals: ProposalView[] = ids.map((pid, i) => {
    const raw = raws[i]!;
    const e = extra.data?.slice(i * 4, i * 4 + 4) ?? [];
    const kind = proposalKind(Number(raw.kind));
    return {
      id: pid,
      kind,
      status: Number(raw.status),
      reason: Number(raw.reason),
      passPct: Number(raw.passPct),
      eligible: Number(raw.eligible),
      yes: Number(raw.yes),
      no: Number(raw.no),
      proposer: raw.proposer,
      proposerName: e[1]?.status === "success" ? (e[1].result as string) : "",
      deadline: Number(raw.deadline),
      subject: raw.subject,
      subjectName: e[2]?.status === "success" ? (e[2].result as string) : "",
      period: Number(raw.period),
      canVote: e[0]?.status === "success" ? (e[0].result as boolean) : false,
      newRules:
        kind === "rule-change" && e[3]?.status === "success"
          ? rulesFromChain(e[3].result as object)
          : null,
    };
  });

  return {
    total,
    proposals,
    isPending: enabled && list.isPending,
    isError: list.isError,
    refetch: () => {
      void list.refetch();
      void extra.refetch();
    },
  };
}

export type CircleGov = NonNullable<ReturnType<typeof useCircleGov>["data"]>;

/** Members a fee waiver can name; reads the first MEMBER_OPTIONS_MAX addresses of the list. */
export const MEMBER_OPTIONS_MAX = 200;

export interface MemberOption {
  address: Address;
  name: string;
  /** First unpaid period. */
  nextPeriod: number;
}

/** Active members with names and their first unpaid month, for the fee-waiver form. */
export function useMemberOptions(id: Address | null, enabled = true) {
  const list = useReadContract({
    abi: circleVaultAbi,
    address: id ?? undefined,
    functionName: "membersPage",
    args: [0n, BigInt(MEMBER_OPTIONS_MAX)],
    query: { enabled: Boolean(id) && enabled },
  });
  const members = (list.data ?? []) as readonly Address[];
  const info = useReadContracts({
    allowFailure: true,
    contracts: members.flatMap((m) => [
      { abi: circleVaultAbi, address: id!, functionName: "memberOf", args: [m] } as const,
      { abi: circleVaultAbi, address: id!, functionName: "nameOf", args: [m] } as const,
    ]),
    query: { enabled: Boolean(id) && enabled && members.length > 0 },
  });
  const options: MemberOption[] = [];
  members.forEach((m, i) => {
    const mo = info.data?.[i * 2];
    const nm = info.data?.[i * 2 + 1];
    if (mo?.status !== "success") return;
    const member = mo.result as { active: boolean; nextPeriod: number };
    if (!member.active) return;
    options.push({
      address: m,
      name: nm?.status === "success" ? (nm.result as string) : "",
      nextPeriod: Number(member.nextPeriod),
    });
  });
  return { options, isPending: list.isPending || (members.length > 0 && info.isPending) };
}
