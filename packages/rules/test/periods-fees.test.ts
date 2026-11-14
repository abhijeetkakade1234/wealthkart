import { describe, expect, it } from "vitest";
import {
  canDeclareHoliday,
  dueMoment,
  lateFeesFor,
  periodFromYearMonth,
  periodOf,
  type LateFeeConfig,
} from "../src/index.js";

const AVAX = 10n ** 18n;
const cfg: LateFeeConfig = { dueDay: 10, secondFeeDay: 20, fee1: AVAX / 100n, fee2: AVAX / 100n };
const dec2026 = periodFromYearMonth(2026, 12);
const utc = (iso: string) => Date.parse(iso) / 1000;

describe("periods (ADR 0014: UTC only)", () => {
  it("maps timestamps to calendar months in UTC", () => {
    expect(periodOf(utc("2026-12-01T00:00:00Z"))).toBe(dec2026);
    expect(periodOf(utc("2026-11-30T23:59:59Z"))).toBe(dec2026 - 1);
  });

  it("rejects due days outside 1..28", () => {
    expect(() => dueMoment(dec2026, 29)).toThrow(RangeError);
    expect(() => dueMoment(dec2026, 0)).toThrow(RangeError);
  });

  it("S-MATH-03 due day 28 exists in February, including leap years", () => {
    const feb2028 = periodFromYearMonth(2028, 2);
    expect(dueMoment(feb2028, 28)).toBe(utc("2028-02-28T23:59:59Z"));
  });
});

describe("late fees (rules 6-8)", () => {
  const unpaid = { period: dec2026, paidAt: null, holiday: false };

  it("S-PAY-02 paying at 23:59:59 UTC on the due day has no fee", () => {
    const s = { ...unpaid, paidAt: utc("2026-12-10T23:59:59Z") };
    expect(lateFeesFor(s, cfg, s.paidAt)).toBe(0n);
  });

  it("S-PAY-03 paying at 00:00:00 UTC the next day costs fee 1", () => {
    const s = { ...unpaid, paidAt: utc("2026-12-11T00:00:00Z") };
    expect(lateFeesFor(s, cfg, s.paidAt)).toBe(cfg.fee1);
  });

  it("S-PAY-04 paying after day 20 costs fee 1 + fee 2", () => {
    const s = { ...unpaid, paidAt: utc("2026-12-21T00:00:00Z") };
    expect(lateFeesFor(s, cfg, s.paidAt)).toBe(cfg.fee1 + cfg.fee2);
  });

  it("unpaid fees are evaluated lazily as of now", () => {
    expect(lateFeesFor(unpaid, cfg, utc("2026-12-15T12:00:00Z"))).toBe(cfg.fee1);
  });
});

describe("payment holiday (ADR 0017)", () => {
  it("S-LIFE-04 holiday month paid before next due date has no fee", () => {
    const s = { period: dec2026, paidAt: utc("2027-01-09T10:00:00Z"), holiday: true };
    expect(lateFeesFor(s, cfg, s.paidAt)).toBe(0n);
  });

  it("S-LIFE-04c holiday month still unpaid after next due date starts normal fees", () => {
    const s = { period: dec2026, paidAt: null, holiday: true };
    expect(lateFeesFor(s, cfg, utc("2027-01-11T00:00:00Z"))).toBe(cfg.fee1);
  });

  it("S-LIFE-04a holiday declared after the due moment is rejected", () => {
    expect(canDeclareHoliday(dec2026, 10, utc("2026-12-11T00:00:00Z"), 0, 3)).toBe(false);
    expect(canDeclareHoliday(dec2026, 10, utc("2026-12-10T23:59:59Z"), 0, 3)).toBe(true);
  });

  it("S-LIFE-04b a 4th holiday in the year is rejected", () => {
    expect(canDeclareHoliday(dec2026, 10, utc("2026-12-01T00:00:00Z"), 3, 3)).toBe(false);
  });
});
