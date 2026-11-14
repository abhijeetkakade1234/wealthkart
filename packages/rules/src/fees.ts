/**
 * Late fees on missed installments (G1 rules 6-8, ADR 0009, ADR 0017).
 * Amounts are wei (`bigint`). Evaluated lazily at `nowSec`.
 */
import { dueMoment, secondFeeMoment, type PeriodIndex } from "./periods.js";

export interface LateFeeConfig {
  dueDay: number;
  secondFeeDay: number;
  fee1: bigint;
  fee2: bigint;
}

export interface InstallmentState {
  period: PeriodIndex;
  /** Unix seconds when paid, or null if unpaid. */
  paidAt: number | null;
  /** Payment holiday declared before the due moment (ADR 0017). */
  holiday: boolean;
}

/**
 * Late fees owed for one period's installment, as of `nowSec` (or as of the
 * payment time if already paid).
 *
 * Holiday: no fees for this period until the *next* period's due moment;
 * after that, fees accrue as if that later moment were the due date.
 */
export function lateFeesFor(state: InstallmentState, cfg: LateFeeConfig, nowSec: number): bigint {
  const at = state.paidAt ?? nowSec;
  const firstDeadline = state.holiday
    ? dueMoment(state.period + 1, cfg.dueDay)
    : dueMoment(state.period, cfg.dueDay);
  const secondDeadline = state.holiday
    ? secondFeeMoment(state.period + 1, cfg.secondFeeDay)
    : secondFeeMoment(state.period, cfg.secondFeeDay);

  let fees = 0n;
  if (at > firstDeadline) fees += cfg.fee1;
  if (at > secondDeadline) fees += cfg.fee2;
  return fees;
}

/** A holiday may only be declared up to (and including) the due moment. */
export function canDeclareHoliday(
  period: PeriodIndex,
  dueDay: number,
  nowSec: number,
  holidaysUsedThisYear: number,
  holidaysPerYear: number,
): boolean {
  return nowSec <= dueMoment(period, dueDay) && holidaysUsedThisYear < holidaysPerYear;
}
