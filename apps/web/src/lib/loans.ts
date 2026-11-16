import {
  type InterestConfig,
  type Loan as EngineLoan,
  interestFor,
  minimumInterest,
} from "@wealthkart/rules";
import { AVAX, type CircleAsset, fmtSmall, money, parseAmount } from "@/lib/asset";

import { t } from "@/i18n/runtime";
import type { PlainKey } from "@/i18n/types";
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

/** An amount with enough decimals that small interest amounts don't read as 0.00. */
export function avax(units: bigint, asset: CircleAsset = AVAX): string {
  return fmtSmall(units, asset);
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
      label: t("loans.limits.fund"),
      cap: fund,
      explain: t("loans.limits.fundExplain", { pct: formatBps(i.rules.maxLoanBps) }),
    },
    {
      key: "stake",
      label: t("loans.limits.stake"),
      cap: stake,
      explain:
        i.guarantorStake > 0n
          ? t("loans.limits.stakeExplainGuarantor", { k: i.rules.kMultiplier })
          : t("loans.limits.stakeExplain", { k: i.rules.kMultiplier }),
    },
    {
      key: "cash",
      label: t("loans.limits.cash"),
      cap: i.lendable,
      explain: t("loans.limits.cashExplain", { pct: formatBps(i.rules.reserveBps) }),
    },
  ];
  if (i.medical) {
    lines.push({
      key: "medical",
      label: t("loans.limits.medical"),
      cap: i.rules.medicalCap,
      explain: t("loans.limits.medicalExplain"),
    });
  }
  let best = lines[0]!;
  for (const l of lines) if (l.cap < best.cap) best = l;
  return { lines, limit: best.cap, binding: best.key };
}

/**
 * Parses a typed amount ("0.5", "1,2" is refused) to the asset's smallest unit (wei, or 1e-6
 * for USDT); null if not a number > 0 or with more decimals than the asset has.
 */
export function parseAvaxInput(text: string, asset: CircleAsset = AVAX): bigint | null {
  const t = text.trim();
  if (!/^\d{1,9}(\.\d+)?$/.test(t)) return null;
  const units = parseAmount(t, asset);
  return units !== null && units > 0n ? units : null;
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
  /** Late months before a default, fixed at payout (ADR 0043); 0 = read from the rules. */
  defaultAfter: number;
  /** Month the loan was marked as defaulted (0 = never). */
  defaultPeriod: number;
  /** Late fee per month of unpaid interest, fixed at payout (ADR 0043). */
  interestFee: bigint;
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
    defaultAfter: Number(r.defaultAfter ?? 0),
    defaultPeriod: Number(r.defaultPeriod ?? 0),
    interestFee: BigInt((r.interestFee as bigint | number | undefined) ?? 0),
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

/**
 * LoanBook._defaultable: the loan's own `defaultAfter` overdue months (fixed at payout; the
 * circle's current rule as a fallback), or the third tenor is over.
 */
export function isDefaultable(
  l: Pick<LoanState, "disbursedPeriod" | "tenorMonths" | "principal" | "defaulted"> & {
    defaultAfter?: number;
  },
  overdueMonths: number,
  defaultAfter: number,
  currentPeriod: number,
): boolean {
  if (l.principal === 0n || l.defaulted) return false;
  if (currentPeriod > l.disbursedPeriod + TENORS * Math.max(1, l.tenorMonths)) return true;
  return overdueMonths >= (l.defaultAfter || defaultAfter);
}

/** How a borrower lifts a default, in plain words (LoanBook._maybeCure). */
export function cureText(
  l: Pick<LoanState, "disbursedPeriod" | "tenorMonths">,
  owedNow: bigint,
  currentPeriod: number,
  asset: CircleAsset = AVAX,
): string {
  const pastTenors = currentPeriod > l.disbursedPeriod + TENORS * Math.max(1, l.tenorMonths);
  if (pastTenors) {
    return owedNow > 0n
      ? t("loans.cure.allDue", { amount: money(owedNow, asset) })
      : t("loans.cure.allDueNothing");
  }
  return t("loans.cure.pay", { amount: money(owedNow, asset) });
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
  asset: CircleAsset = AVAX,
): string | null {
  if (overdueMonths > 0) return t("loans.repayProblem.overdueFirst");
  if (mode === "full") {
    return interestNow > 0n
      ? t("loans.repayProblem.interestFirst", { amount: money(interestNow, asset) })
      : null;
  }
  if (amount === null)
    return asset.symbol === "USDT" ? t("loans.typeAmountUsdt") : t("loans.typeAmountAvax");
  if (amount >= principal) return t("loans.repayProblem.coversAll");
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
  /** The named guarantor agreed (GuaranteeAccepted). */
  guarantorAccepted: boolean;
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
          guarantorAccepted: false,
        });
        break;
      }
      case "GuaranteeAccepted": {
        const r = byId.get(Number(a.requestId as bigint));
        if (r) r.guarantorAccepted = true;
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

/** Filter, type and sort lists keep translation keys; render with `t(label)`. */
export const LOAN_FILTERS: Array<{ value: LoanFilter; label: PlainKey }> = [
  { value: "all", label: "loans.filter.all" },
  { value: "voting", label: "loans.filter.voting" },
  { value: "active", label: "loans.filter.active" },
  { value: "repaid", label: "loans.filter.repaid" },
  { value: "default", label: "loans.filter.default" },
  { value: "declined", label: "loans.filter.declined" },
];

export type LoanType = "all" | "regular" | "medical";
export const LOAN_TYPES: Array<{ value: LoanType; label: PlainKey }> = [
  { value: "all", label: "loans.filter.anyType" },
  { value: "regular", label: "loans.regular" },
  { value: "medical", label: "loans.medical" },
];

export type LoanSort = "newest" | "oldest" | "amount" | "rate";
export const LOAN_SORTS: Array<{ value: LoanSort; label: PlainKey }> = [
  { value: "newest", label: "loans.filter.newest" },
  { value: "oldest", label: "loans.filter.oldest" },
  { value: "amount", label: "loans.filter.amount" },
  { value: "rate", label: "loans.filter.rate" },
];

/** Reads a URL value against a fixed list; anything else falls back to the first entry. */
export function pickParam<T extends string>(raw: string | null, list: Array<{ value: T }>): T {
  return list.some((x) => x.value === raw) ? (raw as T) : list[0]!.value;
}

/** Translation key of each loan status; render with `t(STATUS_LABEL[status])`. */
export const STATUS_LABEL: Record<LoanRowStatus, PlainKey> = {
  voting: "loans.status.voting",
  active: "loans.status.active",
  default: "loans.status.default",
  repaid: "loans.status.repaid",
  settled: "loans.status.settled",
  declined: "loans.status.declined",
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
    if (kind === "settle") return t("loans.settled.approvedSettle");
    return waitingForGuarantor ? t("loans.settled.approvedWaiting") : t("loans.settled.approved");
  }
  if (outcome === "expired") return t("loans.settled.expired");
  return t("loans.settled.rejected");
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

/**
 * Who is tied to a loan right now, from the events (lower-case addresses): borrowers with an
 * open request or a running loan, and guarantors who accepted one. One stake backs one loan
 * (ADR 0043): a borrower can't guarantee, and a guarantor can't borrow.
 */
export function loanTies(rows: readonly LoanRecord[]): {
  borrowers: Set<string>;
  guarantors: Set<string>;
} {
  const borrowers = new Set<string>();
  const guarantors = new Set<string>();
  for (const r of rows) {
    const live = r.status === "voting" || r.status === "active" || r.status === "default";
    if (!live) continue;
    borrowers.add(r.borrower.toLowerCase());
    const g = r.guarantor.toLowerCase();
    if (g !== ZERO && (r.status !== "voting" || r.guarantorAccepted)) guarantors.add(g);
  }
  return { borrowers, guarantors };
}

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
  /** Asked to leave: in notice or waiting to be paid (Membership.Member.exiting). */
  exiting?: boolean;
  /** Backs someone else's loan (one stake, one loan). */
  guaranteeing?: boolean;
}

/** Why this wallet can't ask for a loan right now (LoanBook._checkRequest), or null. */
export function askBlocker(s: AskState): string | null {
  if (s.dissolved) return t("loans.blocked.dissolved");
  if (s.paused) return t("loans.blocked.paused");
  if (s.frozen) return t("loans.blocked.frozen");
  if (s.exiting) return t("loans.blocked.exiting");
  if (s.dormant) return t("loans.blocked.dormant");
  if (!s.voter) return t("loans.blocked.notVoter");
  if (s.hasLoan) return t("loans.blocked.hasLoan");
  if (s.hasRequest) return t("loans.blocked.hasRequest");
  if (s.guaranteeing) return t("loans.blocked.guaranteeing");
  if (s.memberCount < s.minMembersForLoans) {
    return t("loans.blocked.tooFew", { min: s.minMembersForLoans, count: s.memberCount });
  }
  return null;
}
