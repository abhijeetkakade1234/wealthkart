import { dueMoment, periodFromYearMonth } from "@wealthkart/rules";
import { describe, expect, it } from "vitest";

import type { CircleEvent } from "@/lib/analytics";
import {
  annualReturn,
  cashFlows,
  formatRate,
  memberHistoryCsv,
  project,
  toCsv,
} from "@/lib/returns";

const AVAX = 10n ** 18n;
const A = "0xAaaa000000000000000000000000000000000001";
const B = "0xBbbb000000000000000000000000000000000002";
const JAN = periodFromYearMonth(2027, 1);
let n = 0;
const pay = (member: string, period: number, fees = 0n): CircleEvent => {
  n += 1;
  return {
    type: "contributed",
    member,
    period,
    installment: AVAX,
    fees,
    shares: AVAX,
    block: BigInt(n),
    logIndex: 0,
    tx: `0x${n}`,
  };
};

describe("returns (D7, Phase 3)", () => {
  // A pays 12 months of 1 AVAX; one year after the first due date the stake is worth 12.66.
  const events = Array.from({ length: 12 }, (_, i) => pay(A, JAN + i));
  const now = dueMoment(JAN + 12, 10);

  it("S-ANA-01 builds flows per member from due dates and today's value", () => {
    const flows = cashFlows([...events, pay(B, JAN)], 10, (1266n * AVAX) / 100n, now, A);
    expect(flows).toHaveLength(13);
    expect(flows[0]).toEqual({ at: dueMoment(JAN, 10), amount: -1 });
    expect(flows.at(-1)).toEqual({ at: now, amount: 12.66 });
  });

  it("S-ANA-01 a 12.66 AVAX stake from 12 monthly AVAX is about a 10% annual return", () => {
    const r = annualReturn(cashFlows(events, 10, (1266n * AVAX) / 100n, now, A))!;
    expect(r).toBeGreaterThan(0.09);
    expect(r).toBeLessThan(0.11);
    expect(formatRate(r)).toMatch(/^\+\d+\.\d% a year$/);
  });

  it("S-ANA-01 no rate before a month of history or with nothing paid", () => {
    expect(annualReturn(cashFlows([], 10, AVAX, now))).toBeNull();
    expect(
      annualReturn(cashFlows([pay(A, JAN)], 10, AVAX, dueMoment(JAN, 10) + 86_400)),
    ).toBeNull();
    expect(formatRate(null)).toBe("Not enough history yet");
  });

  it("S-ANA-02 projects with monthly compounding and clamps wild rates", () => {
    const flat = project(10, 1, 0, 2);
    expect(flat.map((p) => p.value)).toEqual([10, 22, 34]);
    const grow = project(0, 1, 0.12, 1);
    expect(grow[1]!.value).toBeGreaterThan(12.5);
    expect(grow[1]!.paidIn).toBe(12);
    expect(project(0, 1, 50, 1)[1]!.value).toBeCloseTo(project(0, 1, 0.5, 1)[1]!.value);
  });

  it("S-ANA-03 CSV quotes fields and neutralises spreadsheet formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", '=HYPERLINK("evil")']])).toBe(
      'a,b\r\n"x,y","\'=HYPERLINK(""evil"")"\r\n',
    );
  });

  it("S-ANA-03 a member's history CSV lists only their payments and holidays", () => {
    const csv = memberHistoryCsv(
      [
        pay(A, JAN, AVAX / 100n),
        pay(B, JAN),
        { type: "holiday", member: A, period: JAN + 1, block: 99n, logIndex: 0, tx: "0xh" },
      ],
      A,
      (p) => `P${p}`,
      (w) => (Number(w) / 1e18).toFixed(2),
    );
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Payment,P");
    expect(lines[1]).toContain(",1.00,0.01,1.01,");
    expect(lines[2]).toMatch(/^Payment holiday,/);
  });
});
