import { dueMoment, periodFromYearMonth } from "@wealthkart/rules";
import { describe, expect, it } from "vitest";

import {
  type CircleEvent,
  cellState,
  memberHistories,
  monthlySeries,
  totals,
} from "@/lib/analytics";

const AVAX = 10n ** 18n;
const HALF = AVAX / 2n;
const FEE = AVAX / 100n;
const DEC = periodFromYearMonth(2026, 12);
const JAN = DEC + 1;
const FEB = DEC + 2;
const due = (p: number) => dueMoment(p, 10);
let n = 0;
const at = () => ({ block: BigInt(++n), logIndex: 0, tx: `0x${n}` });

const A = "0xAaaa000000000000000000000000000000000001";
const B = "0xBbbb000000000000000000000000000000000002";

const events: CircleEvent[] = [
  { type: "joined", member: A, joinPeriod: DEC, ...at() },
  { type: "joined", member: B, joinPeriod: DEC, ...at() },
  // A pays Dec on time; B pays Dec late (one fee).
  {
    type: "contributed",
    member: A,
    period: DEC,
    installment: HALF,
    fees: 0n,
    shares: HALF,
    ...at(),
  },
  {
    type: "contributed",
    member: B,
    period: DEC,
    installment: HALF,
    fees: FEE,
    shares: HALF,
    ...at(),
  },
  // A declares a January holiday and pays it inside the grace, no fee.
  { type: "holiday", member: A, period: JAN, ...at() },
  {
    type: "contributed",
    member: A,
    period: JAN,
    installment: HALF,
    fees: 0n,
    shares: HALF - 1000n,
    ...at(),
  },
];

describe("monthly series (D7)", () => {
  it("S-ACT-02 credits each installment to its month and accumulates value and NAV", () => {
    const s = monthlySeries(events, DEC, FEB);
    expect(s.map((p) => p.period)).toEqual([DEC, JAN, FEB]);
    expect(s[0]!.installments).toBe(AVAX);
    expect(s[0]!.fees).toBe(FEE);
    expect(s[0]!.value).toBe(AVAX + FEE);
    expect(s[1]!.value).toBe(AVAX + FEE + HALF);
    expect(s[2]!.value).toBe(s[1]!.value); // nothing in February yet
    // Index starts at 1.00; December's fee lifts it above.
    const sharesE6 = (x: bigint) => x * 1_000_000n;
    const s2 = monthlySeries(
      events.map((e) => (e.type === "contributed" ? { ...e, shares: sharesE6(e.shares) } : e)),
      DEC,
      FEB,
    );
    expect(s2[0]!.navE18! > AVAX).toBe(true);
    expect(s2[0]!.navE18! < AVAX + AVAX / 50n).toBe(true);
  });

  it("returns null NAV before any shares exist", () => {
    expect(monthlySeries([], DEC, DEC)[0]!.navE18).toBeNull();
  });

  it("totals payments, fees and late payments", () => {
    expect(totals(events)).toEqual({
      installments: AVAX + HALF,
      fees: FEE,
      payments: 3,
      late: 1,
    });
  });
});

describe("payment heatmap (D7)", () => {
  const h = memberHistories(events);
  const ha = h.get(A.toLowerCase());
  const hb = h.get(B.toLowerCase());

  it("S-ACT-03 marks on time, late, holiday, missed, due and before-joining", () => {
    const now = due(FEB) - 3600; // early February, before its due moment
    expect(cellState(ha, DEC - 1, FEB, now, due)).toBe("before");
    expect(cellState(ha, DEC, FEB, now, due)).toBe("on-time");
    expect(cellState(hb, DEC, FEB, now, due)).toBe("late");
    expect(cellState(ha, JAN, FEB, now, due)).toBe("holiday");
    expect(cellState(hb, JAN, FEB, now, due)).toBe("missed"); // January's deadline passed
    expect(cellState(hb, FEB, FEB, now, due)).toBe("due");
    expect(cellState(hb, FEB + 1, FEB, now, due)).toBe("upcoming");
    expect(cellState(undefined, DEC, FEB, now, due)).toBe("before");
  });

  it("S-ACT-03 an unpaid holiday month isn't missed until the next due moment", () => {
    const hol = memberHistories([
      { type: "joined", member: A, joinPeriod: DEC, ...at() },
      { type: "holiday", member: A, period: DEC, ...at() },
    ]).get(A.toLowerCase());
    expect(cellState(hol, DEC, JAN, due(DEC) + 60, due)).toBe("due");
    expect(cellState(hol, DEC, JAN, due(JAN) + 60, due)).toBe("missed");
  });

  it("S-ACT-03 dormant months show as paused, not missed, until the member wakes", () => {
    const d = memberHistories([
      { type: "joined", member: B, joinPeriod: DEC, ...at() },
      { type: "dormant", member: B, period: FEB, ...at() },
      { type: "woke", member: B, nextPeriod: FEB + 3, ...at() },
    ]).get(B.toLowerCase());
    const now = due(FEB + 4) + 60;
    expect(cellState(d, JAN, FEB + 4, now, due)).toBe("missed"); // before dormancy
    expect(cellState(d, FEB, FEB + 4, now, due)).toBe("dormant");
    expect(cellState(d, FEB + 2, FEB + 4, now, due)).toBe("dormant");
    expect(cellState(d, FEB + 3, FEB + 4, now, due)).toBe("missed"); // after waking
  });
});
