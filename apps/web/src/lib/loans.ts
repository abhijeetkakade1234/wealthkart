import {
  type InterestConfig,
  type Loan as EngineLoan,
  interestFor,
  minimumInterest,
} from "@wealthkart/rules";
import { formatAvax } from "@wealthkart/sdk";

import type { DecodedLog } from "@/lib/events";
import { formatBps, type RulesParams } from "@/lib/rules";

/**
 * Pure helpers that mirror the LoanBook library (ADR 0038), so the Loans screens can explain
 * limits, interest, tenors and defaults before anything is sent. Unit tested in
 * `__tests__/loans.test.ts`; chain reads live in `loan-hooks.ts`.
 */

export const BPS = 10_000n;
/** LoanBook.TENORS: tenors with their own rate; after the third the loan is due in full. */
export const TENORS = 3;

/** LoanBook.Status order. */
export const REQUEST_STATUS = [
  "none",
  "open",
  "approved",
  "rejected",
  "expired",
  "cancelled",
  "failed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUS)[number];

export function requestStatus(n: number): RequestStatus {
  return REQUEST_STATUS[n] ?? "none";
}

/** LoanBook.Kind order. */
export type RequestKind = "loan" | "settle";
export function requestKindOf(n: number): RequestKind {
  return n === 1 ? "settle" : "loan";
}

/** AVAX with enough decimals that small interest amounts don't read as 0.00. */
export function avax(wei: bigint): string {
  const abs = wei < 0n ? -wei : wei;
  return formatAvax(wei, abs !== 0n && abs < 10n ** 16n ? 4 : 2);
}

// ------------------------------------------------------------------ limits

export interface LimitInputs {
  totalAssets: bigint;
  /** Your own stake at today's value. */
  myStake: bigint;
  /** Your guarantor's stake (0 without one). */
  guarantorStake: bigint;
  /** `lendableCash()`: cash minus the reserve. */
  lendable: bigint;
  rules: Pick<RulesParams, "maxLoanBps" | "kMultiplier" | "medicalCap" | "reserveBps">;
  medical: boolean;
}

export type LimitKey = "fund" | "stake" | "cash" | "medical";

export interface LimitLine {
  key: LimitKey;
  label: string;
  cap: bigint;
  /** Why the limit exists, in plain words. */
  explain: string;
}

/** Same three caps as LoanBook._limit, plus the medical cap; `limit` is the lowest. */
export function loanLimits(i: LimitInputs): {
  lines: LimitLine[];
  limit: bigint;
  binding: LimitKey;
} {
  const fund = (i.totalAssets * BigInt(i.rules.maxLoanBps)) / BPS;
  const stake = (i.myStake + i.guarantorStake) * BigInt(i.rules.kMultiplier);
  const lines: LimitLine[] = [
    {
      key: "fund",
      label: "Biggest loan the circle allows",
      cap: fund,
      explain: `One loan can be at most ${formatBps(i.rules.maxLoanBps)} of the circle's value.`,
    },
    {
      key: "stake",
      label: "Your savings limit",
      cap: stake,
      explain:
        i.guarantorStake > 0n
          ? `${i.rules.kMultiplier} times your savings plus your guarantor's.`
          : `${i.rules.kMultiplier} times your savings. A guarantor's savings count too.`,
    },
    {
      key: "cash",
      label: "Cash free to lend",
      cap: i.lendable,
      explain: `Cash in the circle, minus the ${formatBps(i.rules.reserveBps)} it always keeps back.`,
    },
  ];
  if (i.medical) {
    lines.push({
      key: "medical",
      label: "Medical loan limit",
      cap: i.rules.medicalCap,
      explain: "The most the circle lends for a medical need.",
    });
  }
  let best = lines[0]!;
  for (const l of lines) if (l.cap < best.cap) best = l;
  return { lines, limit: best.cap, binding: best.key };
}

/** Parses a typed AVAX amount ("0.5", "1,2" is refused) to wei; null if not a number > 0. */
export function parseAvaxInput(text: string): bigint | null {
  const t = text.trim();
  if (!/^\d{1,9}(\.\d{1,18})?$/.test(t)) return null;
  const [w = "0", f = ""] = t.split(".");
  const wei = BigInt(w) * 10n ** 18n + BigInt(f.padEnd(18, "0"));
  return wei > 0n ? wei : null;
}

// ------------------------------------------------------------------ interest and tenors

/** The rules engine config for a circle's current rules (preview before asking). */
export function interestConfig(
  r: Pick<
    RulesParams,
    | "interestBps"
    | "tenorMonths"
    | "tenor2Bps"
    | "tenor3Bps"
    | "medicalFreeMonths"
    | "minInterestMonth"
  >,
): InterestConfig {
  return {
    rateBps: r.interestBps,
    tenor: { months: r.tenorMonths, ratesBps: [r.interestBps, r.tenor2Bps, r.tenor3Bps] },
    medicalFreePeriods: r.medicalFreeMonths,
    minimumOneMonth: r.minInterestMonth,
  };
}

/** A running loan in plain numbers (from `loanOf`). */
export interface LoanState {
  guarantor: string;
  disbursedPeriod: number;
  paidThrough: number;
  principal: bigint;
  amount: bigint;
  carried: bigint;
  rate1: number;
  rate2: number;
  rate3: number;
  tenorMonths: number;
  freeMonths: number;
  medical: boolean;
  defaulted: boolean;
  charged: boolean;
}

/** viem's struct output of `loanOf` to plain numbers; null when there is no loan. */
export function loanFromChain(raw: unknown): LoanState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const principal = BigInt((r.principal as bigint | number | undefined) ?? 0);
  if (principal === 0n) return null;
  return {
    guarantor: String(r.guarantor ?? ""),
    disbursedPeriod: Number(r.disbursedPeriod ?? 0),
    paidThrough: Number(r.paidThrough ?? 0),
    principal,
    amount: BigInt((r.amount as bigint | number | undefined) ?? 0),
    carried: BigInt((r.carried as bigint | number | undefined) ?? 0),
    rate1: Number(r.rate1 ?? 0),
    rate2: Number(r.rate2 ?? 0),
    rate3: Number(r.rate3 ?? 0),
    tenorMonths: Number(r.tenorMonths ?? 1),
    freeMonths: Number(r.freeMonths ?? 0),
    medical: Boolean(r.medical),
    defaulted: Boolean(r.defaulted),
    charged: Boolean(r.charged),
  };
}

export interface TenorStep {
  /** 1, 2 or 3. */
  tenor: number;
  from: number;
  to: number;
  rateBps: number;
  state: "past" | "now" | "next";
}

/**
 * The three tenors of a loan as a timeline (rule 15): tenor i runs `tenorMonths` months from the
 * month after the loan. After the third, the whole loan is due (`overdue`).
 */
export function tenorTimeline(
  l: Pick<LoanState, "disbursedPeriod" | "tenorMonths" | "rate1" | "rate2" | "rate3">,
  currentPeriod: number,
): { steps: TenorStep[]; lastMonth: number; overdue: boolean } {
  const d = l.disbursedPeriod;
  const t = Math.max(1, l.tenorMonths);
  const rates = [l.rate1, l.rate2, l.rate3];
  const steps: TenorStep[] = rates.map((rateBps, i) => {
    const from = d + 1 + i * t;
    const to = d + (i + 1) * t;
    const state = currentPeriod > to ? "past" : currentPeriod >= from ? "now" : "next";
    return { tenor: i + 1, from, to, rateBps, state };
  });
  // In the payout month nothing is charged yet; tenor 1 is next but reads as the current step.
  if (currentPeriod <= d) steps[0]!.state = "now";
  const lastMonth = d + TENORS * t;
  return { steps, lastMonth, overdue: currentPeriod > lastMonth };
}

/** Monthly rate charged in `period` (0 in the payout month and in medical free months). */
export function rateIn(l: LoanState, period: number): number {
  const d = l.disbursedPeriod;
  if (period <= d) return 0;
  if (l.medical && l.freeMonths > 1 && period <= d + l.freeMonths - 1) return 0;
  const t = Math.max(1, l.tenorMonths);
  const i = Math.min(TENORS, Math.ceil((period - d) / t));
  return [l.rate1, l.rate2, l.rate3][i - 1]!;
}

/** principal x bps / 10 000, rounded up like the contract. */
export function ceilBps(principal: bigint, bps: number): bigint {
  const n = principal * BigInt(bps);
  return n === 0n ? 0n : (n + BPS - 1n) / BPS;
}

export interface LoanPreview {
  /** First month that charges interest. */
  firstCharged: number;
  tenors: Array<{ tenor: number; from: number; to: number; rateBps: number; monthly: bigint }>;
  /** Last month of the third tenor: repay by then, or the loan is in default. */
  repayBy: number;
  /** Interest-free months for a medical loan, counting the payout month (0 = none). */
  freeMonths: number;
  /** Rule 17: interest if repaid before any is charged. */
  minimum: bigint;
}

/**
 * What a loan asked for now would cost, from the rules engine (packages/rules), month by month
 * per tenor on the full amount (it shrinks as you repay).
 */
export function loanPreview(
  amount: bigint,
  rules: RulesParams,
  medical: boolean,
  currentPeriod: number,
): LoanPreview {
  const cfg = interestConfig(rules);
  const loan: EngineLoan = { id: 0, principal: amount, disbursedPeriod: currentPeriod, medical };
  // The tenor's own rate, read as if no medical free month applied (free months are listed
  // separately).
  const plain: EngineLoan = { ...loan, medical: false };
  const t = Math.max(1, rules.tenorMonths);
  const tenors = [rules.interestBps, rules.tenor2Bps, rules.tenor3Bps].map((rateBps, i) => {
    const from = currentPeriod + 1 + i * t;
    const to = currentPeriod + (i + 1) * t;
    return { tenor: i + 1, from, to, rateBps, monthly: interestFor(plain, to, amount, cfg) };
  });
  let firstCharged = currentPeriod + 1;
  if (medical && rules.medicalFreeMonths > 1)
    firstCharged = currentPeriod + rules.medicalFreeMonths;
  return {
    firstCharged,
    tenors,
    repayBy: currentPeriod + TENORS * t,
    freeMonths: medical ? rules.medicalFreeMonths : 0,
    minimum: minimumInterest(loan, cfg),
  };
}

/** LoanBook._defaultable: `defaultAfter` overdue months, or the third tenor is over. */
export function isDefaultable(
  l: Pick<LoanState, "disbursedPeriod" | "tenorMonths" | "principal" | "defaulted">,
  overdueMonths: number,
  defaultAfter: number,
  currentPeriod: number,
): boolean {
  if (l.principal === 0n || l.defaulted) return false;
  if (currentPeriod > l.disbursedPeriod + TENORS * Math.max(1, l.tenorMonths)) return true;
  return overdueMonths >= defaultAfter;
}

/** How a borrower lifts a default, in plain words (LoanBook._maybeCure). */
export function cureText(
  l: Pick<LoanState, "disbursedPeriod" | "tenorMonths">,
  owedNow: bigint,
  currentPeriod: number,
): string {
  const pastTenors = currentPeriod > l.disbursedPeriod + TENORS * Math.max(1, l.tenorMonths);
  if (pastTenors) {
    return owedNow > 0n
      ? `All three loan terms are over, so the whole loan is due. Pay the ${avax(owedNow)} AVAX of interest and fees, then repay the rest of the loan, and the freeze lifts.`
      : "All three loan terms are over, so the whole loan is due. Repay it in full and the freeze lifts.";
  }
  return `Pay the ${avax(owedNow)} AVAX of interest and late fees you owe and the freeze lifts straight away.`;
}

/**
 * What the Repay form will send: a part payment as typed, or the exact payoff for "full".
 * Closing needs every booked month paid first (`interestNow` = 0), and a part payment needs no
 * overdue interest (LoanBook.repay).
 */
export function repayProblem(
  mode: "part" | "full",
  amount: bigint | null,
  principal: bigint,
  interestNow: bigint,
  overdueMonths: number,
): string | null {
  if (overdueMonths > 0) return "Pay the overdue interest first. Then you can repay.";
  if (mode === "full") {
    return interestNow > 0n
      ? `Pay this month's interest (${avax(interestNow)} AVAX) first, then repay the loan in full.`
      : null;
  }
  if (amount === null) return "Type an amount in AVAX, like 0.25.";
  if (amount >= principal) return "That covers the whole loan. Choose Repay in full instead.";
  return null;
}

// ------------------------------------------------------------------ loan records from events

export type LoanRowStatus = "voting" | "active" | "default" | "repaid" | "settled" | "declined";

export interface LoanRecord {
  requestId: number;
  borrower: string;
  guarantor: string;
  amount: bigint;
  medical: boolean;
  /** Block of the request (newest first sorting and the date shown). */
  block: bigint;
  status: LoanRowStatus;
  /** Why a request didn't go ahead (rejected, expired, cancelled, failed). */
  closedAs?: RequestStatus;
  disbursedPeriod?: number;
  /** Principal still owed, from repayments seen in the events. */
  outstanding: bigint;
}

const ZERO = "0x0000000000000000000000000000000000000000";
const big = (v: unknown) => BigInt((v as bigint | number | undefined) ?? 0);

/** Every loan request and what became of it, built from the circle's events (oldest first in). */
export function loansFromLogs(logs: readonly DecodedLog[]): LoanRecord[] {
  const ordered = [...logs].sort((a, b) => {
    const ab = a.blockNumber ?? 0n;
    const bb = b.blockNumber ?? 0n;
    return ab === bb ? (a.logIndex ?? 0) - (b.logIndex ?? 0) : ab < bb ? -1 : 1;
  });
  const byId = new Map<number, LoanRecord>();
  // Borrower (lower case) -> their running loan's request id.
  const running = new Map<string, number>();
  for (const l of ordered) {
    const a = l.args;
    switch (l.eventName) {
      case "LoanRequested": {
        const id = Number(a.requestId as bigint);
        byId.set(id, {
          requestId: id,
          borrower: String(a.borrower),
          guarantor: String(a.guarantor ?? ZERO),
          amount: big(a.amount),
          medical: Boolean(a.medical),
          block: l.blockNumber ?? 0n,
          status: "voting",
          outstanding: 0n,
        });
        break;
      }
      case "LoanRequestClosed": {
        if (Number(a.kind) !== 0) break;
        const r = byId.get(Number(a.requestId as bigint));
        const st = requestStatus(Number(a.status));
        if (r && st !== "approved") {
          r.status = "declined";
          r.closedAs = st;
        }
        break;
      }
      case "LoanDisbursed": {
        const r = byId.get(Number(a.requestId as bigint));
        if (!r) break;
        r.status = "active";
        r.disbursedPeriod = Number(a.period as bigint);
        r.outstanding = big(a.amount);
        running.set(r.borrower.toLowerCase(), r.requestId);
        break;
      }
      case "LoanRepaid": {
        const r = byId.get(running.get(String(a.borrower).toLowerCase()) ?? -1);
        if (!r) break;
        r.outstanding = big(a.remaining);
        if (r.outstanding === 0n) {
          r.status = "repaid";
          running.delete(r.borrower.toLowerCase());
        }
        break;
      }
      case "LoanDefaulted":
      case "LoanCured": {
        const r = byId.get(running.get(String(a.borrower).toLowerCase()) ?? -1);
        if (r) r.status = l.eventName === "LoanDefaulted" ? "default" : "active";
        break;
      }
      case "LoanSettled": {
        const r = byId.get(running.get(String(a.borrower).toLowerCase()) ?? -1);
        if (!r) break;
        r.status = "settled";
        r.outstanding = 0n;
        running.delete(r.borrower.toLowerCase());
        break;
      }
    }
  }
  return [...byId.values()];
}

export type LoanFilter = "all" | "voting" | "active" | "repaid" | "default" | "declined";

export const LOAN_FILTERS: Array<{ value: LoanFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "voting", label: "Voting" },
  { value: "active", label: "Active" },
  { value: "repaid", label: "Repaid" },
  { value: "default", label: "Default" },
  { value: "declined", label: "Didn't go ahead" },
];

export type LoanType = "all" | "regular" | "medical";
export const LOAN_TYPES: Array<{ value: LoanType; label: string }> = [
  { value: "all", label: "Any type" },
  { value: "regular", label: "Regular" },
  { value: "medical", label: "Medical" },
];

export type LoanSort = "newest" | "oldest" | "amount" | "rate";
export const LOAN_SORTS: Array<{ value: LoanSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "amount", label: "Biggest amount" },
  { value: "rate", label: "Highest rate now" },
];

/** Reads a URL value against a fixed list; anything else falls back to the first entry. */
export function pickParam<T extends string>(raw: string | null, list: Array<{ value: T }>): T {
  return list.some((x) => x.value === raw) ? (raw as T) : list[0]!.value;
}

export const STATUS_LABEL: Record<LoanRowStatus, string> = {
  voting: "Voting",
  active: "Active",
  default: "In default",
  repaid: "Repaid",
  settled: "Settled from savings",
  declined: "Didn't go ahead",
};

/** Status filter, type filter and search over borrower names and addresses. */
export function filterLoans(
  rows: readonly LoanRecord[],
  status: LoanFilter,
  type: LoanType,
  query: string,
  name: (address: string) => string,
): LoanRecord[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (status !== "all") {
      if (
        status === "default"
          ? r.status !== "default" && r.status !== "settled"
          : r.status !== status
      ) {
        return false;
      }
    }
    if (type === "medical" && !r.medical) return false;
    if (type === "regular" && r.medical) return false;
    if (!q) return true;
    return r.borrower.toLowerCase().includes(q) || name(r.borrower).toLowerCase().includes(q);
  });
}

/** Sorts a copy. `rateOf` gives the rate charged now (null for loans not running). */
export function sortLoans(
  rows: readonly LoanRecord[],
  sort: LoanSort,
  rateOf: (r: LoanRecord) => number | null = () => null,
): LoanRecord[] {
  const out = [...rows];
  const newest = (a: LoanRecord, b: LoanRecord) => b.requestId - a.requestId;
  switch (sort) {
    case "oldest":
      return out.sort((a, b) => a.requestId - b.requestId);
    case "amount":
      return out.sort((a, b) =>
        a.amount === b.amount ? newest(a, b) : a.amount < b.amount ? 1 : -1,
      );
    case "rate":
      return out.sort((a, b) => {
        const ra = rateOf(a) ?? -1;
        const rb = rateOf(b) ?? -1;
        return ra === rb ? newest(a, b) : rb - ra;
      });
    default:
      return out.sort(newest);
  }
}

// ------------------------------------------------------------------ requests on the Votes page

/** The line a loan request card shows once its result is certain (or the window ended). */
export function loanSettledLine(
  outcome: "approved" | "rejected" | "expired",
  kind: RequestKind,
  waitingForGuarantor: boolean,
): string {
  if (outcome === "approved") {
    if (kind === "settle") return "Enough members voted yes. Anyone can settle it now.";
    return waitingForGuarantor
      ? "Enough members voted yes. The AVAX goes out as soon as the guarantor agrees to back it."
      : "Enough members voted yes. Anyone can settle it to send the AVAX.";
  }
  if (outcome === "expired") {
    return "Voting time ran out before enough members voted. Anyone can record the result.";
  }
  return "There aren't enough yes votes for this to pass. Anyone can record the result.";
}

// ------------------------------------------------------------------ charts

export interface MemberOutstanding {
  borrower: string;
  outstanding: bigint;
}

/** Principal still owed per borrower (running and defaulted loans), biggest first. */
export function outstandingByMember(rows: readonly LoanRecord[]): MemberOutstanding[] {
  const m = new Map<string, MemberOutstanding>();
  for (const r of rows) {
    if ((r.status !== "active" && r.status !== "default") || r.outstanding === 0n) continue;
    const k = r.borrower.toLowerCase();
    const cur = m.get(k);
    if (cur) cur.outstanding += r.outstanding;
    else m.set(k, { borrower: r.borrower, outstanding: r.outstanding });
  }
  return [...m.values()].sort((a, b) =>
    a.outstanding === b.outstanding ? 0 : a.outstanding < b.outstanding ? 1 : -1,
  );
}

export interface MoneySplit {
  lent: bigint;
  reserve: bigint;
  free: bigint;
  total: bigint;
}

/**
 * Where the circle's money is (Ledger.cash, LoanBook._lendable): lent out, the reserve kept back
 * (rounded up, never more than the cash), and cash free to lend.
 */
export function moneySplit(
  totalAssets: bigint,
  loansOutstanding: bigint,
  reserveBps: number,
): MoneySplit {
  const lent = loansOutstanding > totalAssets ? totalAssets : loansOutstanding;
  const cash = totalAssets - lent;
  const n = totalAssets * BigInt(reserveBps);
  const want = n === 0n ? 0n : (n + BPS - 1n) / BPS;
  const reserve = want > cash ? cash : want;
  return { lent, reserve, free: cash - reserve, total: totalAssets };
}

/** Share of the whole in percent, one decimal ("62.5%"); "0%" for an empty whole. */
export function shareText(part: bigint, whole: bigint): string {
  if (whole === 0n) return "0%";
  const tenths = Number((part * 1000n + whole / 2n) / whole);
  return `${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)}%`;
}

// ------------------------------------------------------------------ asking

export interface AskState {
  voter: boolean;
  frozen: boolean;
  dormant: boolean;
  hasLoan: boolean;
  hasRequest: boolean;
  memberCount: number;
  minMembersForLoans: number;
  paused: boolean;
  dissolved: boolean;
}

/** Why this wallet can't ask for a loan right now (LoanBook._checkRequest), or null. */
export function askBlocker(s: AskState): string | null {
  if (s.dissolved) return "This circle has voted to close, so no new loans start.";
  if (s.paused) return "Loans are paused for a short time by the circle's guardian.";
  if (s.frozen)
    return "You're frozen because of a loan in default, so you can't ask for a new one.";
  if (s.dormant) return "Your payments are paused (dormant). Come back first, then you can ask.";
  if (!s.voter) return "You can ask for a loan once you can vote in this circle.";
  if (s.hasLoan) return "You already have a loan. Repay it before asking for another.";
  if (s.hasRequest) return "You already asked for a loan. Wait for the vote, or withdraw it.";
  if (s.memberCount < s.minMembersForLoans) {
    return `Loans start once the circle has ${s.minMembersForLoans} members. It has ${s.memberCount}.`;
  }
  return null;
}
