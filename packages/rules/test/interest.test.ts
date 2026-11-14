import { describe, expect, it } from "vitest";
import {
  allocateRepayment,
  G1_INTEREST,
  interestFor,
  minimumInterest,
  periodFromYearMonth,
  rateFor,
  xirr,
  type InterestConfig,
  type Loan,
  type OpenLoan,
} from "../src/index.js";

const RUPEE = 100n; // paise
const FLAT: InterestConfig = { ...G1_INTEREST, tenor: null };
const MAR26 = periodFromYearMonth(2026, 3);

const loan = (over: Partial<Loan> = {}): Loan => ({
  id: 1,
  principal: 200_000n * RUPEE,
  disbursedPeriod: MAR26,
  medical: false,
  ...over,
});

describe("loan interest (guide §4, rules 15/17/18)", () => {
  it("S-LOAN-07 interest starts the month after disbursal, on the start-of-month balance", () => {
    const l = loan();
    expect(interestFor(l, MAR26, l.principal, FLAT)).toBe(0n);
    expect(interestFor(l, MAR26 + 1, l.principal, FLAT)).toBe(2_000n * RUPEE);
    // guide example: ₹50k repaid mid-December still pays December on ₹2L; January on ₹1.5L
    expect(interestFor(l, MAR26 + 2, 200_000n * RUPEE, FLAT)).toBe(2_000n * RUPEE);
    expect(interestFor(l, MAR26 + 3, 150_000n * RUPEE, FLAT)).toBe(1_500n * RUPEE);
  });

  it("S-LOAN-08 a loan repaid in its disbursal month still owes one month (rule 17)", () => {
    expect(minimumInterest(loan(), G1_INTEREST)).toBe(2_000n * RUPEE);
    expect(minimumInterest(loan({ medical: true }), G1_INTEREST)).toBe(0n);
    expect(minimumInterest(loan(), { ...G1_INTEREST, minimumOneMonth: false })).toBe(0n);
  });

  it("S-LOAN-09 medical loan: disbursal month + next two are free, then the normal rate", () => {
    // guide: sent 2 Dec → nothing for Dec, Jan, Feb; interest from March
    const dec = periodFromYearMonth(2026, 12);
    const l = loan({ medical: true, disbursedPeriod: dec, principal: 100_000n * RUPEE });
    for (const p of [dec, dec + 1, dec + 2]) expect(interestFor(l, p, l.principal, FLAT)).toBe(0n);
    expect(interestFor(l, dec + 3, l.principal, FLAT)).toBe(1_000n * RUPEE);
  });

  it("S-LOAN-14 tenor 1 → 2 → 3 rate steps, then the loan is due", () => {
    const l = loan();
    const at = (n: number) => rateFor(l, MAR26 + n, G1_INTEREST);
    expect(at(1)).toMatchObject({ rateBps: 100, tenor: 1, due: false });
    expect(at(6)).toMatchObject({ rateBps: 100, tenor: 1 });
    expect(at(7)).toMatchObject({ rateBps: 150, tenor: 2 });
    expect(at(13)).toMatchObject({ rateBps: 200, tenor: 3 });
    expect(at(18)).toMatchObject({ rateBps: 200, tenor: 3, due: false });
    expect(at(19)).toMatchObject({ rateBps: 200, tenor: 3, due: true });
    // "Start a new tenor" resets to 1% from the given period
    expect(rateFor({ ...l, tenorStart: MAR26 + 7 }, MAR26 + 7, G1_INTEREST).rateBps).toBe(100);
  });

  it("S-ACCT-06 medical free months win over the tenor rate; tenor clock keeps running", () => {
    const l = loan({ medical: true });
    expect(rateFor(l, MAR26 + 2, G1_INTEREST)).toMatchObject({ rateBps: 0, free: true, tenor: 1 });
    expect(rateFor(l, MAR26 + 3, G1_INTEREST)).toMatchObject({ rateBps: 100, free: false });
  });

  it("S-MATH-02 interest rounds up (vault side) on odd balances", () => {
    expect(interestFor(loan(), MAR26 + 1, 101n, FLAT)).toBe(2n); // 1.01 → 2
    expect(interestFor(loan(), MAR26 + 1, 0n, FLAT)).toBe(0n);
  });
});

describe("repayment allocation", () => {
  const book: OpenLoan[] = [
    { ...loan({ id: 3, disbursedPeriod: MAR26 + 2 }), balance: 50_000n },
    { ...loan({ id: 1, disbursedPeriod: MAR26 }), balance: 100_000n },
    { ...loan({ id: 2, disbursedPeriod: MAR26 + 1 }), balance: 30_000n },
  ];

  it("S-LOAN-12 chosen loan first, then oldest", () => {
    const r = allocateRepayment(book, 70_000n, 3);
    expect(r.applied).toEqual([
      { id: 3, amount: 50_000n },
      { id: 1, amount: 20_000n },
    ]);
    const r2 = allocateRepayment(book, 120_000n);
    expect(r2.applied).toEqual([
      { id: 1, amount: 100_000n },
      { id: 2, amount: 20_000n },
    ]);
    expect(r2.loans.find((l) => l.id === 2)?.balance).toBe(10_000n);
  });

  it("S-LOAN-11 overpaying is rejected, never lost", () => {
    expect(() => allocateRepayment(book, 180_001n)).toThrow(RangeError);
    expect(allocateRepayment(book, 180_000n).loans.every((l) => l.balance === 0n)).toBe(true);
  });
});

describe("xirr", () => {
  const DAY = 86_400;
  const t0 = Date.UTC(2025, 0, 1) / 1000;

  it("matches a known one-year 10% return", () => {
    const r = xirr([
      { at: t0, amount: -1000 },
      { at: t0 + 365 * DAY, amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 8);
  });

  it("handles losses and needs a sign change", () => {
    expect(
      xirr([
        { at: t0, amount: -1000 },
        { at: t0 + 365 * DAY, amount: 500 },
      ]),
    ).toBeCloseTo(-0.5, 8);
    expect(xirr([{ at: t0, amount: -1 }])).toBeNull();
    expect(
      xirr([
        { at: t0, amount: 1 },
        { at: t0 + DAY, amount: 2 },
      ]),
    ).toBeNull();
  });

  it("is deterministic and falls back to bisection from a bad guess", () => {
    const flows = [
      { at: t0, amount: -1000 },
      { at: t0 + 90 * DAY, amount: 1500 },
    ];
    const a = xirr(flows, 0.1);
    const b = xirr(flows, 99);
    expect(a).not.toBeNull();
    expect(b).toBeCloseTo(a as number, 6);
    expect(xirr(flows, 0.1)).toBe(a);
  });
});
