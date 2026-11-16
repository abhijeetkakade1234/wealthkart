import { describe, expect, it } from "vitest";

import { ALL_KINDS, KIND } from "../src/push/kinds";
import {
  type CircleFacts,
  compose,
  fmtAmount,
  freshOnly,
  type MemberFacts,
  remindersFor,
} from "../src/push/schedule";
import { daysUntil, dueMoment, periodOf, utcLabel } from "../src/push/time";

/** December 2026: period 2026 * 12 + 11. */
const DEC = 24323;
const at = (iso: string) => Date.parse(iso) / 1000;
const AVAX = 10n ** 18n;

const circle: CircleFacts = {
  address: "0xc1c1000000000000000000000000000000000001",
  name: "Sunday Savers",
  asset: { symbol: "AVAX", decimals: 18 },
  dueDay: 10,
  secondFeeDay: 20,
  fee1: AVAX / 10n,
  fee2: AVAX / 10n,
  dissolved: false,
  votes: [],
};

function member(over: Partial<MemberFacts> = {}): MemberFacts {
  return {
    active: true,
    dormant: false,
    due: { period: DEC, amount: 4n * AVAX, fees: 0n, payable: true },
    holiday: false,
    interest: null,
    exit: null,
    withdrawable: 0n,
    canVote: [],
    ...over,
  };
}

const stagesAt = (iso: string, m = member(), kinds = ALL_KINDS, c = circle) =>
  remindersFor(c, m, kinds, at(iso)).map((r) => `${r.topic}#${r.stage}`);

describe("reminder schedule (ADR 0052)", () => {
  it("S-REM-01 UTC date maths matches the contract: due moment is 23:59:59 UTC on the due day", () => {
    expect(periodOf(at("2026-12-01T00:00:00Z"))).toBe(DEC);
    expect(periodOf(at("2026-11-30T23:59:59Z"))).toBe(DEC - 1);
    expect(dueMoment(DEC, 10)).toBe(at("2026-12-10T23:59:59Z"));
    expect(daysUntil(at("2026-12-07T00:00:00Z"), DEC, 10)).toBe(3);
    expect(daysUntil(at("2026-12-07T23:59:59Z"), DEC, 10)).toBe(3);
    expect(daysUntil(at("2026-12-10T23:59:59Z"), DEC, 10)).toBe(0);
    expect(daysUntil(at("2026-12-11T00:00:00Z"), DEC, 10)).toBe(-1);
    expect(utcLabel(dueMoment(DEC, 10))).toBe("10 Dec 23:59 UTC");
    // January wraps the year.
    expect(dueMoment(DEC + 1, 5)).toBe(at("2027-01-05T23:59:59Z"));
  });

  it("S-REM-02 installment reminders: 3 days before, the day before, the due day, nothing before or after", () => {
    expect(stagesAt("2026-12-06T23:59:59Z")).toEqual([]);
    expect(stagesAt("2026-12-07T00:00:00Z")).toEqual([`due:${DEC}#1`]);
    expect(stagesAt("2026-12-08T12:00:00Z")).toEqual([`due:${DEC}#1`]);
    expect(stagesAt("2026-12-09T00:00:00Z")).toEqual([`due:${DEC}#2`]);
    expect(stagesAt("2026-12-10T00:00:00Z")).toEqual([`due:${DEC}#3`]);
    const r = remindersFor(circle, member(), ALL_KINDS, at("2026-12-07T01:00:00Z"))[0]!;
    expect(r.body).toBe("Your 4.00 AVAX for December is due in 3 days, by 10 Dec 23:59 UTC.");
    expect(r.url).toBe(`/app/circle/pay/?id=${circle.address}`);
    expect(r.at).toBe(dueMoment(DEC, 10));
    expect(remindersFor(circle, member(), ALL_KINDS, at("2026-12-10T01:00:00Z"))[0]!.body).toBe(
      "Your 4.00 AVAX for December is due today, by 10 Dec 23:59 UTC.",
    );
  });

  it("S-REM-03 late fee warnings: 6 hours before the due moment, on the second-fee day, and once a month is missed", () => {
    expect(stagesAt("2026-12-10T17:59:59Z")).toEqual([`due:${DEC}#3`]);
    expect(stagesAt("2026-12-10T18:00:00Z")).toEqual([`due:${DEC}#3`, `late:${DEC}#1`]);
    const warn = remindersFor(circle, member(), KIND.late, at("2026-12-10T21:30:00Z"))[0]!;
    expect(warn.body).toBe(
      "December is still unpaid. A late fee of 0.10 AVAX starts in about 3 hours, after 10 Dec 23:59 UTC.",
    );
    // After the due moment: quiet until the second-fee day.
    expect(stagesAt("2026-12-11T00:00:00Z")).toEqual([]);
    expect(stagesAt("2026-12-19T23:00:00Z")).toEqual([]);
    expect(stagesAt("2026-12-20T00:00:00Z")).toEqual([`late:${DEC}#2`]);
    // The month is over and still unpaid.
    expect(stagesAt("2027-01-02T00:00:00Z")).toEqual([`late:${DEC}#3`]);
    // No second fee configured: no second warning.
    expect(stagesAt("2026-12-20T00:00:00Z", member(), ALL_KINDS, { ...circle, fee2: 0n })).toEqual(
      [],
    );
  });

  it("S-REM-04 no installment reminders when paid, dormant, on a payment holiday, switched off or closing", () => {
    const now = "2026-12-10T20:00:00Z";
    const paid = member({ due: { period: DEC + 1, amount: 4n * AVAX, fees: 0n, payable: false } });
    expect(stagesAt(now, paid)).toEqual([]);
    expect(stagesAt(now, member({ dormant: true }))).toEqual([]);
    expect(stagesAt(now, member({ holiday: true }))).toEqual([]);
    expect(stagesAt(now, member(), ALL_KINDS & ~KIND.due & ~KIND.late)).toEqual([]);
    expect(stagesAt(now, member(), KIND.late)).toEqual([`late:${DEC}#1`]);
    expect(stagesAt(now, member(), ALL_KINDS, { ...circle, dissolved: true })).toEqual([]);
  });

  it("S-REM-05 loan interest: due soon in the last 3 days, then late once it's overdue", () => {
    const loan = member({
      due: { period: DEC + 1, amount: 0n, fees: 0n, payable: false },
      interest: { interest: AVAX / 20n, fees: 0n, overdue: 0 },
    });
    expect(stagesAt("2026-12-06T12:00:00Z", loan)).toEqual([]);
    expect(stagesAt("2026-12-08T12:00:00Z", loan)).toEqual([`int:${DEC}#1`]);
    const late = member({
      due: { period: DEC + 1, amount: 0n, fees: 0n, payable: false },
      interest: { interest: AVAX / 20n, fees: AVAX / 100n, overdue: 1 },
    });
    const r = remindersFor(circle, late, ALL_KINDS, at("2026-12-15T12:00:00Z"));
    expect(r.map((x) => `${x.topic}#${x.stage}`)).toEqual([`int:${DEC}#2`]);
    expect(r[0]!.body).toBe("Your loan interest is late. 0.06 AVAX is owed now, including fees.");
    expect(r[0]!.url).toBe(`/app/circle/loans/?id=${circle.address}`);
  });

  it("S-REM-06 votes: once when waiting for you, again on the last day; never for votes you can't cast", () => {
    const now = at("2026-12-01T12:00:00Z");
    const c = {
      ...circle,
      votes: [
        { key: "m:1", deadline: now + 3 * 86_400 },
        { key: "l:2", deadline: now + 3_600 },
        { key: "p:3", deadline: now + 86_400 * 2 },
      ],
    };
    const m = member({
      due: { period: DEC + 1, amount: 0n, fees: 0n, payable: false },
      canVote: ["m:1", "l:2"],
    });
    const cands = remindersFor(c, m, ALL_KINDS, now);
    expect(cands.map((x) => `${x.topic}#${x.stage}`)).toEqual(["vote:m:1#1", "vote:l:2#2"]);
    const notes = compose(c, cands);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.body).toBe("2 votes are waiting for you. The first closes 1 Dec 13:00 UTC.");
    expect(notes[0]!.topics).toHaveLength(2);
    expect(notes[0]!.url).toBe(`/app/circle/votes/?id=${c.address}`);
    // One vote, last day.
    const one = compose(c, cands.slice(1));
    expect(one[0]!.body).toBe("Last day to vote. It closes 1 Dec 13:00 UTC.");
    // Dormant members aren't asked.
    expect(remindersFor(c, { ...m, dormant: true }, ALL_KINDS, now)).toEqual([]);
  });

  it("S-REM-07 money waiting: exit ready to collect and refused payouts, each once per amount", () => {
    const now = at("2026-12-01T12:00:00Z");
    const m = member({
      due: null,
      exit: { maturesAt: now - 10 },
      withdrawable: 1_250_000n,
    });
    const c = { ...circle, asset: { symbol: "USDT", decimals: 6 } };
    const r = remindersFor(c, m, KIND.money, now);
    expect(r.map((x) => x.topic)).toEqual([`exit:${now - 10}`, "wd:1250000"]);
    expect(r[1]!.body).toBe("1.25 USDT is waiting for you to withdraw.");
    // Notice not over yet: nothing.
    expect(
      remindersFor(c, { ...m, exit: { maturesAt: now + 10 }, withdrawable: 0n }, KIND.money, now),
    ).toEqual([]);
  });

  it("S-REM-08 dedupe: a stage is sent once, and a lower stage never after a higher one", () => {
    const cands = remindersFor(circle, member(), ALL_KINDS, at("2026-12-09T03:00:00Z"));
    expect(freshOnly(cands, new Map())).toHaveLength(1);
    expect(freshOnly(cands, new Map([[`due:${DEC}`, 2]]))).toHaveLength(0);
    expect(freshOnly(cands, new Map([[`due:${DEC}`, 3]]))).toHaveLength(0);
    expect(freshOnly(cands, new Map([[`due:${DEC}`, 1]]))).toHaveLength(1);
  });

  it("S-REM-09 amounts: AVAX and USDT decimals, small AVAX amounts keep four decimals", () => {
    expect(fmtAmount(4n * AVAX, { symbol: "AVAX", decimals: 18 })).toBe("4.00");
    expect(fmtAmount(AVAX / 1000n, { symbol: "AVAX", decimals: 18 })).toBe("0.0010");
    expect(fmtAmount(50_000_000n, { symbol: "USDT", decimals: 6 })).toBe("50.00");
    expect(fmtAmount(1_234_567_890n, { symbol: "USDT", decimals: 6 })).toBe("1,234.56");
  });
});
