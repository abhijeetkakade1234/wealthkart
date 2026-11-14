/**
 * XIRR: annualised internal rate of return for irregular cash flows
 * (Excel-compatible: actual/365 day count). Display-only, so plain `number`.
 *
 * Deterministic: Newton from a fixed guess, then bisection on [-0.9999, 100]
 * if Newton fails to converge or leaves the domain. Returns `null` when the
 * flows have no sign change (no rate exists).
 */
export interface CashFlow {
  /** Unix seconds. */
  at: number;
  /** Negative = money in (paid by the member), positive = money out. */
  amount: number;
}

const DAY = 86_400;
const TOL = 1e-10;
const MAX_NEWTON = 50;
const MAX_BISECT = 300;
const LOW = -0.9999;
const HIGH = 100;

function npv(rate: number, flows: readonly CashFlow[], t0: number): number {
  let s = 0;
  for (const f of flows) s += f.amount / Math.pow(1 + rate, (f.at - t0) / DAY / 365);
  return s;
}

function dNpv(rate: number, flows: readonly CashFlow[], t0: number): number {
  let s = 0;
  for (const f of flows) {
    const y = (f.at - t0) / DAY / 365;
    s -= (y * f.amount) / Math.pow(1 + rate, y + 1);
  }
  return s;
}

export function xirr(flows: readonly CashFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = Math.min(...flows.map((f) => f.at));

  let r = guess;
  for (let i = 0; i < MAX_NEWTON; i++) {
    const v = npv(r, flows, t0);
    if (Math.abs(v) < TOL) return r;
    const d = dNpv(r, flows, t0);
    if (d === 0 || !Number.isFinite(d)) break;
    const next = r - v / d;
    if (!Number.isFinite(next) || next <= LOW || next >= HIGH) break;
    if (Math.abs(next - r) < TOL) return next;
    r = next;
  }

  let lo = LOW;
  let hi = HIGH;
  let fLo = npv(lo, flows, t0);
  if (fLo * npv(hi, flows, t0) > 0) return null;
  for (let i = 0; i < MAX_BISECT; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows, t0);
    if (Math.abs(fMid) < TOL || (hi - lo) / 2 < TOL) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}
