import { VIRTUAL_SHARES } from "@wealthkart/rules";

/**
 * Pure analytics over a circle's on-chain events (PLAN.md D7). Everything here is derived
 * from logs every member can read, so every member sees the same numbers. No React, no I/O:
 * `src/lib/events.ts` fetches and normalises the logs, these functions shape them for charts.
 */

/** A circle event, normalised from CircleVault / Membership logs. */
export type CircleEvent =
  | {
      type: "contributed";
      member: string;
      period: number;
      installment: bigint;
      fees: bigint;
      shares: bigint;
      block: bigint;
      logIndex: number;
      tx: string;
    }
  | { type: "holiday"; member: string; period: number; block: bigint; logIndex: number; tx: string }
  | {
      type: "joined";
      member: string;
      joinPeriod: number;
      block: bigint;
      logIndex: number;
      tx: string;
    }
  | { type: "dormant"; member: string; period: number; block: bigint; logIndex: number; tx: string }
  | {
      type: "woke";
      member: string;
      nextPeriod: number;
      block: bigint;
      logIndex: number;
      tx: string;
    };

export interface MonthPoint {
  period: number;
  /** Installments credited to this month, in wei. */
  installments: bigint;
  /** Late fees paid on this month's installments, in wei. */
  fees: bigint;
  /** Circle value after this month's installments and fees (cumulative), in wei. */
  value: bigint;
  /**
   * Share value as an index that starts at 1.00 (1e18): what 1 AVAX paid in at the very start
   * is worth now. Shares carry VIRTUAL_SHARES extra precision (ADR 0006), so the raw value of
   * one share is tiny; the index is what people can read. Null before any shares exist.
   */
  navE18: bigint | null;
}

const E18 = 10n ** 18n;

/**
 * Month-by-month series from `fromPeriod` to `toPeriod`, by the month each installment is
 * for (a late payment for March counts in March). Phase 1 money is installments and fees
 * only; loans and interest join in Phase 2.
 */
export function monthlySeries(
  events: readonly CircleEvent[],
  fromPeriod: number,
  toPeriod: number,
): MonthPoint[] {
  const byPeriod = new Map<number, { installments: bigint; fees: bigint; shares: bigint }>();
  for (const e of events) {
    if (e.type !== "contributed") continue;
    const m = byPeriod.get(e.period) ?? { installments: 0n, fees: 0n, shares: 0n };
    m.installments += e.installment;
    m.fees += e.fees;
    m.shares += e.shares;
    byPeriod.set(e.period, m);
  }
  const points: MonthPoint[] = [];
  let value = 0n;
  let shares = 0n;
  for (let p = fromPeriod; p <= toPeriod; p++) {
    const m = byPeriod.get(p) ?? { installments: 0n, fees: 0n, shares: 0n };
    value += m.installments + m.fees;
    shares += m.shares;
    points.push({
      period: p,
      installments: m.installments,
      fees: m.fees,
      value,
      navE18: shares > 0n ? (value * E18 * VIRTUAL_SHARES) / shares : null,
    });
  }
  return points;
}

/** One heatmap cell: what happened to a member's installment for one month. */
export type CellState =
  | "before" // not a member yet
  | "on-time"
  | "late" // paid with late fees
  | "holiday" // paid inside a payment-holiday's grace (ADR 0017)
  | "missed" // fee-free deadline passed, still unpaid
  | "due" // this month, deadline not passed yet
  | "upcoming"
  | "dormant"; // circle voted the member dormant: nothing owed (ADR 0032)

export interface MemberHistory {
  joinPeriod: number | null;
  /** Late fees paid per month paid. */
  paid: Map<number, bigint>;
  holidays: Set<number>;
  /** [from, to) month ranges spent dormant; `to` null while still dormant. */
  dormant: Array<[number, number | null]>;
}

/** Groups events per member (addresses lowercased). */
export function memberHistories(events: readonly CircleEvent[]): Map<string, MemberHistory> {
  const out = new Map<string, MemberHistory>();
  const get = (member: string) => {
    const key = member.toLowerCase();
    let h = out.get(key);
    if (!h) {
      h = { joinPeriod: null, paid: new Map(), holidays: new Set(), dormant: [] };
      out.set(key, h);
    }
    return h;
  };
  const ordered = [...events].sort((a, b) =>
    a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1,
  );
  for (const e of ordered) {
    const h = get(e.member);
    switch (e.type) {
      case "joined":
        if (h.joinPeriod === null) h.joinPeriod = e.joinPeriod;
        break;
      case "contributed":
        h.paid.set(e.period, e.fees);
        break;
      case "holiday":
        h.holidays.add(e.period);
        break;
      case "dormant":
        h.dormant.push([e.period, null]);
        break;
      case "woke": {
        const open = h.dormant.find((r) => r[1] === null);
        if (open) open[1] = e.nextPeriod;
        break;
      }
    }
  }
  return out;
}

/**
 * The state of `period` for one member. `dueMoment(p)` is the due moment of month p in
 * seconds (packages/rules), `nowSec` is chain time.
 */
export function cellState(
  h: MemberHistory | undefined,
  period: number,
  currentPeriod: number,
  nowSec: number,
  dueMoment: (p: number) => number,
): CellState {
  if (!h || h.joinPeriod === null || period < h.joinPeriod) return "before";
  const fees = h.paid.get(period);
  const holiday = h.holidays.has(period);
  if (fees !== undefined) {
    if (fees > 0n) return "late";
    return holiday ? "holiday" : "on-time";
  }
  if (h.dormant.some(([from, to]) => period >= from && (to === null || period < to))) {
    return "dormant";
  }
  const deadline = holiday ? dueMoment(period + 1) : dueMoment(period);
  if (nowSec > deadline) return "missed";
  return period <= currentPeriod ? "due" : "upcoming";
}

/** Plain words for each cell state: the heatmap legend and each cell's label. */
export const CELL_LABEL: Record<CellState, string> = {
  before: "Not a member yet",
  "on-time": "Paid on time",
  late: "Paid late",
  holiday: "Paid after a holiday",
  missed: "Missed",
  due: "Due this month",
  upcoming: "Not due yet",
  dormant: "Paused (dormant)",
};

/** Totals for the analytics summary line. */
export function totals(events: readonly CircleEvent[]) {
  let installments = 0n;
  let fees = 0n;
  let payments = 0;
  let late = 0;
  for (const e of events) {
    if (e.type !== "contributed") continue;
    installments += e.installment;
    fees += e.fees;
    payments += 1;
    if (e.fees > 0n) late += 1;
  }
  return { installments, fees, payments, late };
}
