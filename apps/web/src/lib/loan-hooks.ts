"use client";

import { circleVaultAbi } from "@wealthkart/sdk";
import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";

import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import {
  type LoanState,
  loanFromChain,
  type RequestKind,
  requestKindOf,
  requestStatus,
  type RequestStatus,
} from "@/lib/loans";
import { useVaultAction } from "@/lib/use-vault-action";

/**
 * Every LoanBook read and write the app makes (ADR 0038), in one file, so a contract change
 * (ABI or behaviour) is adjusted here and nowhere else. Components get plain numbers back.
 *
 * Contract behaviour this file follows (ADR 0043):
 * - one stake, one loan: a member with a loan or request can't guarantee and a guarantor can't
 *   borrow. There is no `guaranteeOf` view, so the page works it out from the events
 *   (`loanTies`) and the guarantor picker leaves those members out;
 * - after a dissolve, `proposeSettle` settles at once with no vote (returns 0);
 * - the payout re-checks eligibility, so a passed request can still close as Failed;
 * - each loan fixes its rates, tenor, `defaultAfter` and `interestFee` at payout: the panel
 *   reads them from `loanOf`, never from the live rules;
 * - exiting and frozen members can't borrow, guarantee or vote (`memberOf.exiting`).
 */

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** Open loan and settle requests are bounded by twice the member count; one read gets them. */
export const MAX_OPEN_LOAN_REQUESTS = 100;
export const LOAN_REQUESTS_PAGE_SIZE = 5;

export interface MyLoan {
  loan: LoanState | null;
  /** `interestDue`: unpaid interest up to and including this month. */
  interest: bigint;
  fees: bigint;
  overdueMonths: number;
  /** `payoffDue`: what Repay in full sends (principal plus any rule-17 month). */
  payoff: bigint;
  /** This wallet's open loan request id, or 0. */
  pendingId: bigint;
  lendable: bigint;
  stake: bigint;
  totalAssets: bigint;
  memberCount: number;
  voter: boolean;
  frozen: boolean;
  dormant: boolean;
  active: boolean;
  /** Asked to leave the circle (in notice or waiting to be paid). */
  exiting: boolean;
}

/** The connected wallet's loan, what it owes now, and what it needs to ask for one. */
export function useMyLoan(circle: Address | null) {
  const { address } = useCoreWallet();
  const me = address ?? ZERO;
  const vault = { abi: circleVaultAbi, address: circle ?? undefined } as const;
  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...vault, functionName: "loanOf", args: [me] },
      { ...vault, functionName: "interestDue", args: [me] },
      { ...vault, functionName: "payoffDue", args: [me] },
      { ...vault, functionName: "pendingLoanOf", args: [me] },
      { ...vault, functionName: "lendableCash" },
      { ...vault, functionName: "stakeOf", args: [me] },
      { ...vault, functionName: "totalAssets" },
      { ...vault, functionName: "memberCount" },
      { ...vault, functionName: "memberOf", args: [me] },
    ] as const,
    query: { enabled: Boolean(circle && address), refetchInterval: 15_000 },
  });
  const r = q.data;
  const ok = <T>(i: number): T | undefined =>
    r?.[i]?.status === "success" ? (r[i].result as T) : undefined;
  const due = ok<readonly [bigint, bigint, bigint]>(1);
  const member = ok<{
    voter: boolean;
    frozen: boolean;
    dormant: boolean;
    active: boolean;
    exiting: boolean;
  }>(8);
  const data: MyLoan | undefined = r
    ? {
        loan: loanFromChain(ok<object>(0)),
        interest: due?.[0] ?? 0n,
        fees: due?.[1] ?? 0n,
        overdueMonths: Number(due?.[2] ?? 0n),
        payoff: ok<bigint>(2) ?? 0n,
        pendingId: ok<bigint>(3) ?? 0n,
        lendable: ok<bigint>(4) ?? 0n,
        stake: ok<bigint>(5) ?? 0n,
        totalAssets: ok<bigint>(6) ?? 0n,
        memberCount: Number(ok<bigint>(7) ?? 0n),
        voter: member?.voter ?? false,
        frozen: member?.frozen ?? false,
        dormant: member?.dormant ?? false,
        active: member?.active ?? false,
        exiting: member?.exiting ?? false,
      }
    : undefined;
  return { ...q, data };
}

export interface LoanRequestView {
  id: bigint;
  kind: RequestKind;
  status: RequestStatus;
  medical: boolean;
  guarantorAccepted: boolean;
  borrower: Address;
  borrowerName: string;
  guarantor: Address;
  guarantorName: string;
  deadline: number;
  eligible: number;
  yes: number;
  no: number;
  /** Loan: amount asked for. Settle: principal owed when proposed. */
  amount: bigint;
  canVote: boolean;
}

type RawRequest = {
  kind: number;
  status: number;
  medical: boolean;
  guarantorAccepted: boolean;
  borrower: Address;
  deadline: bigint | number;
  eligible: number;
  guarantor: Address;
  yes: number;
  no: number;
  amount: bigint;
};

function toRequest(
  id: bigint,
  r: RawRequest,
): Omit<LoanRequestView, "borrowerName" | "guarantorName" | "canVote"> {
  return {
    id,
    kind: requestKindOf(Number(r.kind)),
    status: requestStatus(Number(r.status)),
    medical: r.medical,
    guarantorAccepted: r.guarantorAccepted,
    borrower: r.borrower,
    guarantor: r.guarantor,
    deadline: Number(r.deadline),
    eligible: Number(r.eligible),
    yes: Number(r.yes),
    no: Number(r.no),
    amount: BigInt(r.amount),
  };
}

/**
 * Every open loan and settle request with names and whether this wallet can vote; `page`
 * (1-based) slices LOAN_REQUESTS_PAGE_SIZE of them for the Votes page.
 */
export function useOpenLoanRequests(circle: Address | null, page = 1) {
  const { address } = useCoreWallet();
  const enabled = Boolean(circle && address);
  const vault = { abi: circleVaultAbi, address: circle ?? undefined } as const;
  const list = useReadContract({
    ...vault,
    functionName: "openLoanRequestsPage",
    args: [0n, BigInt(MAX_OPEN_LOAN_REQUESTS)],
    query: { enabled, refetchInterval: 15_000, placeholderData: (prev) => prev },
  });
  const ids = (list.data?.[0] ?? []) as readonly bigint[];
  const raws = (list.data?.[1] ?? []) as readonly RawRequest[];
  const extra = useReadContracts({
    allowFailure: true,
    contracts: ids.flatMap((rid, i) => [
      {
        ...vault,
        address: circle!,
        functionName: "canVoteLoan",
        args: [rid, address ?? ZERO],
      } as const,
      {
        ...vault,
        address: circle!,
        functionName: "nameOf",
        args: [raws[i]?.borrower ?? ZERO],
      } as const,
      {
        ...vault,
        address: circle!,
        functionName: "nameOf",
        args: [raws[i]?.guarantor ?? ZERO],
      } as const,
    ]),
    query: { enabled: enabled && ids.length > 0, placeholderData: (prev) => prev },
  });
  // Oldest first reads naturally on the Votes page (the contract's order shifts as requests close).
  const all: LoanRequestView[] = ids
    .map((rid, i) => {
      const e = extra.data?.slice(i * 3, i * 3 + 3) ?? [];
      return {
        ...toRequest(rid, raws[i]!),
        canVote: e[0]?.status === "success" ? (e[0].result as boolean) : false,
        borrowerName: e[1]?.status === "success" ? (e[1].result as string) : "",
        guarantorName: e[2]?.status === "success" ? (e[2].result as string) : "",
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const from = (page - 1) * LOAN_REQUESTS_PAGE_SIZE;
  return {
    all,
    total: all.length,
    requests: all.slice(from, from + LOAN_REQUESTS_PAGE_SIZE),
    isPending: enabled && list.isPending,
    isError: list.isError,
    refetch: () => {
      void list.refetch();
      void extra.refetch();
    },
  };
}

/** One loan request by id (the borrower's own while it is voted on). */
export function useLoanRequest(circle: Address | null, id: bigint) {
  const vault = { abi: circleVaultAbi, address: circle ?? undefined } as const;
  const q = useReadContract({
    ...vault,
    functionName: "loanRequest",
    args: [id],
    query: { enabled: Boolean(circle) && id > 0n, refetchInterval: 15_000 },
  });
  const raw = q.data as RawRequest | undefined;
  const g = useReadContract({
    ...vault,
    functionName: "nameOf",
    args: [raw?.guarantor ?? ZERO],
    query: { enabled: Boolean(circle && raw && raw.guarantor !== ZERO) },
  });
  return {
    ...q,
    request:
      raw && id > 0n ? { ...toRequest(id, raw), guarantorName: (g.data as string) ?? "" } : null,
  };
}

/** Members read for the guarantor picker; at most this many addresses of the list. */
export const LOAN_MEMBERS_MAX = 200;

export interface LoanMember {
  address: Address;
  name: string;
  stake: bigint;
  /** Can be named as guarantor: active, not dormant, frozen or exiting (LoanBook._checkGuarantor). */
  canGuarantee: boolean;
}

/** Members with names and stakes, for the guarantor picker and the loan charts. */
export function useLoanMembers(circle: Address | null, enabled = true) {
  const vault = { abi: circleVaultAbi, address: circle ?? undefined } as const;
  const list = useReadContract({
    ...vault,
    functionName: "membersPage",
    args: [0n, BigInt(LOAN_MEMBERS_MAX)],
    query: { enabled: Boolean(circle) && enabled },
  });
  const members = (list.data ?? []) as readonly Address[];
  const info = useReadContracts({
    allowFailure: true,
    contracts: members.flatMap((m) => [
      { ...vault, address: circle!, functionName: "memberOf", args: [m] } as const,
      { ...vault, address: circle!, functionName: "nameOf", args: [m] } as const,
      { ...vault, address: circle!, functionName: "stakeOf", args: [m] } as const,
    ]),
    query: { enabled: Boolean(circle) && enabled && members.length > 0 },
  });
  const out: LoanMember[] = [];
  members.forEach((m, i) => {
    const mo = info.data?.[i * 3];
    if (mo?.status !== "success") return;
    const x = mo.result as {
      active: boolean;
      dormant: boolean;
      frozen: boolean;
      exiting?: boolean;
    };
    if (!x.active) return;
    const nm = info.data?.[i * 3 + 1];
    const st = info.data?.[i * 3 + 2];
    out.push({
      address: m,
      name: nm?.status === "success" ? (nm.result as string) : "",
      stake: st?.status === "success" ? (st.result as bigint) : 0n,
      canGuarantee: !x.dormant && !x.frozen && !x.exiting,
    });
  });
  return { members: out, isPending: list.isPending || (members.length > 0 && info.isPending) };
}

export interface BorrowerState {
  loan: LoanState | null;
  interest: bigint;
  fees: bigint;
  overdueMonths: number;
}

/** Live loan state for a set of borrowers (the rows on the current page of the loans list). */
export function useBorrowerStates(circle: Address | null, borrowers: readonly string[]) {
  const vault = { abi: circleVaultAbi, address: circle ?? undefined } as const;
  const q = useReadContracts({
    allowFailure: true,
    contracts: borrowers.flatMap((b) => [
      { ...vault, address: circle!, functionName: "loanOf", args: [b as Address] } as const,
      { ...vault, address: circle!, functionName: "interestDue", args: [b as Address] } as const,
    ]),
    query: { enabled: Boolean(circle) && borrowers.length > 0, refetchInterval: 15_000 },
  });
  const map = new Map<string, BorrowerState>();
  borrowers.forEach((b, i) => {
    const lo = q.data?.[i * 2];
    const du = q.data?.[i * 2 + 1];
    const due =
      du?.status === "success" ? (du.result as readonly [bigint, bigint, bigint]) : undefined;
    map.set(b.toLowerCase(), {
      loan: lo?.status === "success" ? loanFromChain(lo.result) : null,
      interest: due?.[0] ?? 0n,
      fees: due?.[1] ?? 0n,
      overdueMonths: Number(due?.[2] ?? 0n),
    });
  });
  return { states: map, isPending: borrowers.length > 0 && q.isPending, refetch: q.refetch };
}

/** Fresh `interestDue` and `payoffDue` for the connected wallet, read right before paying. */
export function useLoanAmounts(circle: Address | null) {
  const { address } = useCoreWallet();
  const vault = { abi: circleVaultAbi, address: circle ?? undefined } as const;
  return useReadContracts({
    allowFailure: false,
    contracts: [
      { ...vault, functionName: "interestDue", args: [address ?? ZERO] },
      { ...vault, functionName: "payoffDue", args: [address ?? ZERO] },
    ] as const,
    query: { enabled: false },
  });
}

/**
 * One loan transaction with its tracker state. Each method is a LoanBook entry point; payable
 * ones take the exact AVAX to send.
 */
export function useLoanTx(circle: Address) {
  const a = useVaultAction(circle);
  return {
    tx: a.tx,
    working: a.working,
    request: (amount: bigint, medical: boolean, guarantor: Address | null) =>
      a.send("requestLoan", [amount, medical, guarantor ?? ZERO]),
    acceptGuarantee: (borrower: Address) => a.send("acceptGuarantee", [borrower]),
    vote: (id: bigint, support: boolean) => a.send("voteLoan", [id, support]),
    finalize: (id: bigint) => a.send("finalizeLoan", [id]),
    cancel: () => a.send("cancelLoanRequest"),
    payInterest: (value: bigint) => a.send("payInterest", undefined, value),
    repay: (value: bigint) => a.send("repay", undefined, value),
    markDefault: (borrower: Address) => a.send("markDefault", [borrower]),
    proposeSettle: (borrower: Address) => a.send("proposeSettle", [borrower]),
  };
}

/** One member's display name ("" while loading or when they have none). */
export function useMemberName(circle: Address | null, member: string | null | undefined) {
  const q = useReadContract({
    abi: circleVaultAbi,
    address: circle ?? undefined,
    functionName: "nameOf",
    args: [(member ?? ZERO) as Address],
    query: { enabled: Boolean(circle && member && member !== ZERO) },
  });
  return (q.data as string | undefined) ?? "";
}
