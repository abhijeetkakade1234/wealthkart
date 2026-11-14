/**
 * Loan interest (G1 guide §4 "Loan interest", rules 15, 17, 18).
 *
 * Amounts are `bigint` in the smallest unit (wei for AVAX, paise for the G1
 * INR replay). Rates are basis points per month (100 = 1%).
 *
 * - Interest starts the period after disbursal.
 * - Each period's interest is on the balance at the start of that period, so a
 *   mid-month repayment doesn't cut this month's interest.
 * - Rule 15: optional tenors (default 6 months at 1% / 1.5% / 2%). After the
 *   last tenor the loan is due; the rate stays at the last tenor's rate.
 * - Rule 18: medical loans pay nothing for the disbursal period and the next
 *   two. Free months win over the tenor rate (S-ACCT-06); the tenor clock
 *   still runs from the first period after disbursal.
 * - Rule 17: a loan sent and fully repaid inside its disbursal period still
 *   owes one month's interest at the first-tenor rate (not for medical loans).
 * - Rounding favours the vault: interest rounds up.
 */
import type { PeriodIndex } from "./periods.js";

export const BPS = 10_000n;

export interface TenorRule {
  /** Months per tenor (G1: 6). */
  months: number;
  /** Rate per tenor in bps per month (G1: [100, 150, 200]). */
  ratesBps: readonly number[];
}

export interface InterestConfig {
  /** Flat rate when no tenor rule applies, bps per month (G1: 100). */
  rateBps: number;
  /** Rule 15; `null` = flat rate. */
  tenor: TenorRule | null;
  /** Rule 18: interest-free periods for medical loans, counting the disbursal period (G1: 3). */
  medicalFreePeriods: number;
  /** Rule 17: minimum one month's interest for a loan repaid in its disbursal period. */
  minimumOneMonth: boolean;
}

export const G1_INTEREST: InterestConfig = {
  rateBps: 100,
  tenor: { months: 6, ratesBps: [100, 150, 200] },
  medicalFreePeriods: 3,
  minimumOneMonth: true,
};

export interface Loan {
  id: number;
  principal: bigint;
  disbursedPeriod: PeriodIndex;
  medical: boolean;
  /**
   * First interest-bearing period of the current tenor run. Defaults to
   * `disbursedPeriod + 1`; "Start a new tenor" moves it forward.
   */
  tenorStart?: PeriodIndex;
}

export interface RateInfo {
  rateBps: number;
  /** 1-based tenor, or 0 before interest starts / without a tenor rule. */
  tenor: number;
  /** Past the last tenor: the loan is due (no extension after 18 months). */
  due: boolean;
  /** Rule 18 free month. */
  free: boolean;
}

function assertConfig(cfg: InterestConfig): void {
  if (!Number.isInteger(cfg.rateBps) || cfg.rateBps < 0) throw new RangeError("bad rateBps");
  if (cfg.tenor) {
    if (!Number.isInteger(cfg.tenor.months) || cfg.tenor.months < 1)
      throw new RangeError("bad tenor months");
    if (cfg.tenor.ratesBps.length === 0) throw new RangeError("tenor needs at least one rate");
  }
}

/** Rate that applies to `loan` in `period`. */
export function rateFor(loan: Loan, period: PeriodIndex, cfg: InterestConfig): RateInfo {
  assertConfig(cfg);
  if (period <= loan.disbursedPeriod) return { rateBps: 0, tenor: 0, due: false, free: false };

  let rateBps = cfg.rateBps;
  let tenor = 0;
  let due = false;
  if (cfg.tenor) {
    const start = loan.tenorStart ?? loan.disbursedPeriod + 1;
    const monthNo = Math.max(1, period - start + 1);
    const t = Math.ceil(monthNo / cfg.tenor.months);
    const rates = cfg.tenor.ratesBps;
    tenor = Math.min(t, rates.length);
    due = t > rates.length;
    rateBps = rates[tenor - 1] as number;
  }

  const free = loan.medical && period < loan.disbursedPeriod + cfg.medicalFreePeriods;
  return { rateBps: free ? 0 : rateBps, tenor, due, free };
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return a === 0n ? 0n : (a + b - 1n) / b;
}

/** Interest for one period on the balance owed at the start of that period. */
export function interestFor(
  loan: Loan,
  period: PeriodIndex,
  balanceAtStart: bigint,
  cfg: InterestConfig,
): bigint {
  if (balanceAtStart < 0n) throw new RangeError("balance must be >= 0");
  const { rateBps } = rateFor(loan, period, cfg);
  return ceilDiv(balanceAtStart * BigInt(rateBps), BPS);
}

/**
 * Rule 17: interest owed by a loan fully repaid in its own disbursal period
 * (otherwise it would owe nothing). Medical loans are exempt.
 */
export function minimumInterest(loan: Loan, cfg: InterestConfig): bigint {
  if (!cfg.minimumOneMonth || loan.medical) return 0n;
  const firstRate = cfg.tenor ? (cfg.tenor.ratesBps[0] as number) : cfg.rateBps;
  return ceilDiv(loan.principal * BigInt(firstRate), BPS);
}

export interface OpenLoan extends Loan {
  balance: bigint;
}

/**
 * Split a repayment across the payer's own loans: the chosen loan first, then
 * oldest first (by disbursal period, then id). Paying more than is owed is
 * rejected, never silently kept (S-LOAN-11).
 */
export function allocateRepayment(
  loans: readonly OpenLoan[],
  amount: bigint,
  chosenId?: number,
): { loans: OpenLoan[]; applied: { id: number; amount: bigint }[] } {
  if (amount <= 0n) throw new RangeError("repayment must be > 0");
  const owed = loans.reduce((s, l) => s + l.balance, 0n);
  if (amount > owed) throw new RangeError("repayment is more than the loans owed");
  if (chosenId !== undefined && !loans.some((l) => l.id === chosenId))
    throw new RangeError("chosen loan not found");

  const order = [...loans].sort((a, b) => {
    if (a.id === chosenId) return -1;
    if (b.id === chosenId) return 1;
    return a.disbursedPeriod - b.disbursedPeriod || a.id - b.id;
  });

  let left = amount;
  const paid = new Map<number, bigint>();
  for (const l of order) {
    if (left === 0n) break;
    const take = l.balance < left ? l.balance : left;
    if (take > 0n) {
      paid.set(l.id, take);
      left -= take;
    }
  }
  return {
    loans: loans.map((l) => ({ ...l, balance: l.balance - (paid.get(l.id) ?? 0n) })),
    applied: order
      .filter((l) => paid.has(l.id))
      .map((l) => ({ id: l.id, amount: paid.get(l.id)! })),
  };
}
