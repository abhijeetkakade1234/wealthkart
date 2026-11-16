import { type CashFlow, dueMoment, xirr } from "@wealthkart/rules";
import { formatEther } from "viem";

import type { CircleEvent } from "@/lib/analytics";

/**
 * Returns, projections and CSV export (PLAN.md D7, Phase 3). Pure and unit tested.
 * Dates come from each installment's due moment (deterministic, no block lookups), so a late
 * payment counts on its month's due date. Projections are illustrations, never promises
 * (ADR 0024): the page says so next to them.
 */

const avax = (wei: bigint) => Number(formatEther(wei));

/** Cash flows for XIRR: payments in (negative) and today's value out (positive). */
export function cashFlows(
  events: readonly CircleEvent[],
  dueDay: number,
  valueNow: bigint,
  nowSec: number,
  member?: string,
): CashFlow[] {
  const who = member?.toLowerCase();
  const flows: CashFlow[] = [];
  for (const e of events) {
    if (e.type !== "contributed") continue;
    if (who && e.member.toLowerCase() !== who) continue;
    flows.push({ at: dueMoment(e.period, dueDay), amount: -avax(e.installment + e.fees) });
  }
  if (flows.length > 0 && valueNow > 0n) flows.push({ at: nowSec, amount: avax(valueNow) });
  return flows;
}

/**
 * Annual return (XIRR) or null when it can't be measured yet: no payments, under ~a month of
 * history, or no rate exists.
 */
export function annualReturn(flows: readonly CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const first = Math.min(...flows.map((f) => f.at));
  const last = Math.max(...flows.map((f) => f.at));
  if (last - first < 28 * 86_400) return null;
  const r = xirr(flows);
  return r === null || !Number.isFinite(r) ? null : r;
}

export interface ProjectionPoint {
  year: number;
  /** Value in AVAX if the same installment keeps going in and the rate holds. */
  value: number;
  /** Installments paid in by then, AVAX. */
  paidIn: number;
}

/**
 * What today's value could grow to with the same monthly installment at `annualRate`,
 * compounding monthly. Rate is clamped to -50%..+50% so a short noisy history can't draw an
 * absurd curve.
 */
export function project(
  valueNow: number,
  monthly: number,
  annualRate: number,
  years: number,
): ProjectionPoint[] {
  const rate = Math.max(-0.5, Math.min(0.5, annualRate));
  const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
  const points: ProjectionPoint[] = [{ year: 0, value: valueNow, paidIn: 0 }];
  let value = valueNow;
  let paidIn = 0;
  for (let m = 1; m <= years * 12; m++) {
    value = value * (1 + monthlyRate) + monthly;
    paidIn += monthly;
    if (m % 12 === 0) points.push({ year: m / 12, value, paidIn });
  }
  return points;
}

/** "+4.2% a year" style label. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "Not enough history yet";
  const pct = rate * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% a year`;
}

/** One CSV field, quoted when needed (RFC 4180), with formula injection neutralised. */
function field(v: string): string {
  // A cell starting with = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.map(field).join(",")).join("\r\n") + "\r\n";
}

/** A member's own history as CSV rows: payments and holidays, oldest first. */
export function memberHistoryCsv(
  events: readonly CircleEvent[],
  member: string,
  label: (period: number) => string,
  amount: (wei: bigint) => string,
): string {
  const who = member.toLowerCase();
  const rows: string[][] = [];
  const mine = events
    .filter((e) => e.member.toLowerCase() === who)
    .sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));
  for (const e of mine) {
    if (e.type === "contributed") {
      rows.push([
        "Payment",
        label(e.period),
        amount(e.installment),
        amount(e.fees),
        amount(e.installment + e.fees),
        e.block.toString(),
        e.tx,
      ]);
    } else if (e.type === "holiday") {
      rows.push(["Payment holiday", label(e.period), "0", "0", "0", e.block.toString(), e.tx]);
    }
  }
  return toCsv(
    [
      "Type",
      "Month",
      "Installment (AVAX)",
      "Late fees (AVAX)",
      "Total (AVAX)",
      "Block",
      "Transaction",
    ],
    rows,
  );
}
