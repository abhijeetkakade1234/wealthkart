/**
 * UTC date maths for reminders (ADR 0014). Mirrors `packages/rules/src/periods.ts`: a period is
 * `year * 12 + month - 1`, and the due moment is 23:59:59 UTC on the due day. Kept inline so the
 * Worker doesn't need another workspace build; `test/push-schedule.test.ts` pins the boundaries.
 */

export const DAY = 86_400;

export function periodOf(sec: number): number {
  const d = new Date(sec * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** 00:00:00 UTC on `day` of the period's month, in unix seconds. */
export function startOfDay(period: number, day: number): number {
  return Date.UTC(Math.floor(period / 12), period % 12, day) / 1000;
}

/** Last second a payment for `period` counts as on time. */
export function dueMoment(period: number, dueDay: number): number {
  return startOfDay(period, dueDay) + DAY - 1;
}

/** 00:00:00 UTC of the day `sec` falls in. */
export function utcDayStart(sec: number): number {
  return Math.floor(sec / DAY) * DAY;
}

/** Whole UTC calendar days from `now`'s day to `day` of `period` (0 = that day is today). */
export function daysUntil(nowSec: number, period: number, day: number): number {
  return Math.round((startOfDay(period, day) - utcDayStart(nowSec)) / DAY);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "10 Dec 23:59 UTC". */
export function utcLabel(sec: number): string {
  const d = new Date(sec * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm} UTC`;
}

/** "December". The year is left out: reminders are about this month or the last one. */
export function monthName(period: number): string {
  return LONG_MONTHS[period % 12]!;
}
