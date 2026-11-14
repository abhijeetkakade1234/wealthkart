/**
 * Installment periods and deadlines. All times are UTC (ADR 0014).
 *
 * A period is one calendar month, identified by a monotonically increasing
 * index: `year * 12 + (month - 1)`. Period 24300 = January 2025.
 * The due moment is 23:59:59 UTC on `dueDay` of that month; `dueDay` is 1..28.
 */

const SECONDS_PER_DAY = 86_400;

export const MIN_DUE_DAY = 1;
export const MAX_DUE_DAY = 28;

/** Default day after which late fee 2 applies (G1 rule 8). */
export const DEFAULT_SECOND_FEE_DAY = 20;

export type PeriodIndex = number;

export function assertDueDay(dueDay: number): void {
  if (!Number.isInteger(dueDay) || dueDay < MIN_DUE_DAY || dueDay > MAX_DUE_DAY) {
    throw new RangeError(`dueDay must be an integer from ${MIN_DUE_DAY} to ${MAX_DUE_DAY}`);
  }
}

/** Period index for a unix timestamp in seconds. */
export function periodOf(timestampSec: number): PeriodIndex {
  const d = new Date(timestampSec * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function periodFromYearMonth(year: number, month1to12: number): PeriodIndex {
  return year * 12 + (month1to12 - 1);
}

export function yearMonthOf(period: PeriodIndex): { year: number; month: number } {
  return { year: Math.floor(period / 12), month: (period % 12) + 1 };
}

/** Unix seconds of 00:00:00 UTC on `day` of the period's month. */
export function startOfDay(period: PeriodIndex, day: number): number {
  const { year, month } = yearMonthOf(period);
  return Date.UTC(year, month - 1, day) / 1000;
}

/** Last second (inclusive) a payment counts as on time: 23:59:59 UTC on dueDay. */
export function dueMoment(period: PeriodIndex, dueDay: number): number {
  assertDueDay(dueDay);
  return startOfDay(period, dueDay) + SECONDS_PER_DAY - 1;
}

/** Last second (inclusive) before late fee 2 applies: 23:59:59 UTC on secondFeeDay. */
export function secondFeeMoment(period: PeriodIndex, secondFeeDay: number): number {
  assertDueDay(secondFeeDay);
  return startOfDay(period, secondFeeDay) + SECONDS_PER_DAY - 1;
}
