/**
 * G1 history replay (docs/testing.md "History replay").
 *
 * Fixture: test/fixtures/g1-ledger.json, extracted from the anonymised xlsx by
 * scripts/extract-g1.py. Each month has the installment, who paid, the
 * Credits/Deductions cell, the UTI investment and each member's Debit cell
 * (interest + repayment − loan sent, netted into one number by the sheet).
 *
 * The Nov-26 snapshot (CLAUDE.md) is reproduced to the rupee.
 */
import { describe, expect, it } from "vitest";
import ledger from "./fixtures/g1-ledger.json" with { type: "json" };
import {
  interestFor,
  periodFromYearMonth,
  rateFor,
  xirr,
  type InterestConfig,
} from "../src/index.js";

const PAISE = 100n;
const r = (rupees: number) => BigInt(rupees) * PAISE;
const sum = (xs: readonly bigint[]) => xs.reduce((a, b) => a + b, 0n);

const months = ledger.months.filter((m) => m.month <= "2026-11"); // snapshot month
const paidIn = sum(months.map((m) => r(m.installment) * BigInt(m.paid.reduce((a, b) => a + b, 0))));
const credits = sum(months.map((m) => r(m.credit)));
const uti = sum(months.map((m) => r(m.uti)));
const debitNet = sum(months.flatMap((m) => m.debit.map(r)));
const outstanding = sum(ledger.outstandingSummaryColE.map(r));
const cash = paidIn + credits + debitNet - uti;
const currentValue = cash + uti + outstanding;

describe("G1 replay: Nov-26 snapshot", () => {
  it("S-ACCT-08 fixture covers Apr-18..Dec-26 for 12 members, no gaps", () => {
    expect(ledger.months).toHaveLength(105);
    expect(ledger.members).toEqual(
      Array.from({ length: 12 }, (_, i) => `MEMBER ${String(i + 1).padStart(2, "0")}`),
    );
    const ps = ledger.months.map((m) => {
      const [y, mo] = m.month.split("-").map(Number);
      return periodFromYearMonth(y as number, mo as number);
    });
    ps.forEach((p, i) => i > 0 && expect(p).toBe((ps[i - 1] as number) + 1));
  });

  it("S-ACCT-09 installment bands match the sheet's hard-coded row 110", () => {
    const band = (i: number) =>
      i < 31 ? 1000 : i < 48 ? 1500 : i < 65 ? 2000 : i < 90 ? 3000 : 4000;
    ledger.months.forEach((m, i) => expect(m.installment).toBe(band(i)));
  });

  it("S-ACCT-10 paid in ₹26,58,000 (₹2,21,500 each)", () => {
    expect(paidIn).toBe(r(2_658_000));
    for (let k = 0; k < 12; k++) {
      expect(sum(months.map((m) => (m.paid[k] ? r(m.installment) : 0n)))).toBe(r(221_500));
    }
  });

  it("S-ACCT-11 current value ₹35,73,552 = cash + UTI + loans lent out", () => {
    expect(uti).toBe(r(501_000));
    expect(outstanding).toBe(r(2_335_000));
    expect(cash).toBe(r(737_552));
    expect(currentValue).toBe(r(3_573_552));
    expect(currentValue - paidIn).toBe(r(915_552)); // profit
  });

  it("S-ACCT-12 interest earned ₹8,65,375 = net Debit + outstanding (row 110)", () => {
    // net Debit = interest + repaid − lent, outstanding = lent − repaid ⇒ sum = interest
    expect(debitNet + sum(ledger.outstandingDebitRow110.map(r))).toBe(r(865_375));
    // the sheet keeps two hand-edited copies of outstanding; they must agree
    expect(ledger.outstandingDebitRow110).toEqual(ledger.outstandingSummaryColE);
  });

  it("S-LOAN-17 Oct-26 Debit row equals 1% of each member's start-of-month balance", () => {
    // G1 never switched rule 15 on (Debit rows 111/112 are all zero): flat 1%.
    const flat: InterestConfig = {
      rateBps: 100,
      tenor: null,
      medicalFreePeriods: 3,
      minimumOneMonth: false,
    };
    const oct = ledger.months.find((m) => m.month === "2026-10")!;
    const nov = ledger.months.find((m) => m.month === "2026-11")!;
    const octP = periodFromYearMonth(2026, 10);
    ledger.outstandingDebitRow110.forEach((now, k) => {
      // a loan sent late in Oct is booked in the Nov row; it wasn't owed at the start of Oct
      const novLoan = Math.max(0, -(nov.debit[k] as number));
      const startOfOct = r(now - novLoan);
      const l = { id: k, principal: startOfOct, disbursedPeriod: octP - 2, medical: false };
      expect(rateFor(l, octP, flat).rateBps).toBe(100);
      expect(interestFor(l, octP, startOfOct, flat)).toBe(r(oct.debit[k] as number));
    });
  });

  it("S-ACCT-13 fund XIRR Apr-18..Nov-26 is pinned (installments on the 10th, value on 30 Nov 26)", () => {
    const flows = months.map((m) => {
      const [y, mo] = m.month.split("-").map(Number);
      return {
        at: Date.UTC(y as number, (mo as number) - 1, 10) / 1000,
        amount: -m.installment * m.paid.reduce((a, b) => a + b, 0),
      };
    });
    flows.push({ at: Date.UTC(2026, 10, 30) / 1000, amount: Number(currentValue / PAISE) });
    const rate = xirr(flows);
    expect(rate).not.toBeNull();
    expect(rate as number).toBeCloseTo(0.0906, 4); // ≈ 9.06% a year
  });
});
