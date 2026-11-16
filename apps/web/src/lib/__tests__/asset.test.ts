import { describe, expect, it } from "vitest";

import {
  AVAX,
  circleAsset,
  fmt,
  fmtSmall,
  money,
  parseAmount,
  toInputText,
  toNumber,
} from "@/lib/asset";
import { DEFAULTS, maxMembersProblem, validate } from "@/lib/circle-form";
import { cureText, parseAvaxInput, repayProblem } from "@/lib/loans";
import { formatRule, rulesFromForm, rulesToForm, defaultRules } from "@/lib/rules";
import { memberHistoryCsv } from "@/lib/returns";

const TOKEN = "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7";
const USDT = circleAsset(TOKEN);
const SELF = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

describe("S-WEB-62 circle asset: AVAX (18 decimals) or USDT (6 decimals) from vault.asset()", () => {
  it("zero address or nothing means AVAX; any token address means USDT", () => {
    expect(circleAsset("0x0000000000000000000000000000000000000000")).toEqual(AVAX);
    expect(circleAsset(undefined)).toEqual(AVAX);
    expect(circleAsset("not an address")).toEqual(AVAX);
    expect(USDT).toEqual({ token: TOKEN, symbol: "USDT", decimals: 6 });
  });

  it("formats each asset with its own decimals, rounding down", () => {
    expect(fmt(25_000_000n, USDT)).toBe("25.00");
    expect(fmt(1_999_999n, USDT)).toBe("1.99");
    expect(fmt(10n ** 18n / 2n, AVAX)).toBe("0.50");
    expect(money(25_500_000n, USDT)).toBe("25.50 USDT");
    expect(money(10n ** 18n, AVAX)).toBe("1.00 AVAX");
  });

  it("keeps four decimals for amounts under 0.01 in either asset", () => {
    expect(fmtSmall(5_000n, USDT)).toBe("0.0050");
    expect(fmtSmall(10n ** 16n / 2n, AVAX)).toBe("0.0050");
    expect(fmtSmall(0n, USDT)).toBe("0.00");
  });

  it("parses typed amounts to the asset's smallest unit and refuses extra decimals", () => {
    expect(parseAmount("25", USDT)).toBe(25_000_000n);
    expect(parseAmount("0.000001", USDT)).toBe(1n);
    expect(parseAmount("0.0000001", USDT)).toBeNull();
    expect(parseAmount("0.5", AVAX)).toBe(10n ** 18n / 2n);
    expect(parseAmount("0.000000000000000001", AVAX)).toBe(1n);
    for (const bad of ["", "abc", "1,5", "-1", "1e3", ".5"])
      expect(parseAmount(bad, USDT)).toBeNull();
  });

  it("round-trips form text and gives chart numbers", () => {
    expect(toInputText(1_500_000n, USDT)).toBe("1.5");
    expect(toInputText(25_000_000n, USDT)).toBe("25");
    expect(toInputText(10n ** 16n, AVAX)).toBe("0.01");
    expect(toNumber(12_340_000n, USDT)).toBeCloseTo(12.34);
    expect(toNumber(3n * 10n ** 18n, AVAX)).toBe(3);
  });

  it("loan and rule helpers speak the circle's asset", () => {
    expect(parseAvaxInput("2.5", USDT)).toBe(2_500_000n);
    expect(parseAvaxInput("0", USDT)).toBeNull();
    expect(repayProblem("part", null, 10n, 0n, 0, USDT)).toMatch(/in USDT, like 25/);
    expect(cureText({ disbursedPeriod: 0, tenorMonths: 6 }, 1_000_000n, 1, USDT)).toMatch(
      /Pay the 1\.00 USDT of interest/,
    );
    expect(formatRule("interestFee", 1_000_000n, USDT)).toBe("1.00 USDT");
    const rules = defaultRules(50_000_000n);
    const form = rulesToForm(rules, USDT);
    expect(form.interestFee).toBe("1");
    expect(rulesFromForm(form, 50_000_000n, USDT).params?.interestFee).toBe(1_000_000n);
  });

  it("the CSV header names the asset", () => {
    expect(memberHistoryCsv([], SELF, String, String, "USDT")).toMatch(
      /^Type,Month,Installment \(USDT\),Late fees \(USDT\),Total \(USDT\)/,
    );
  });
});

describe("S-WEB-63 create form: asset choice and the 3..50 member cap (ADR 0045, 0046)", () => {
  it("defaults to AVAX and a cap of 12, and sends both in the config", () => {
    const v = validate({ ...DEFAULTS, name: "College Gang" }, SELF);
    expect(v.ok).toBe(true);
    expect(v.cfg?.asset).toBe(0);
    expect(v.cfg?.maxMembers).toBe(12);
    expect(v.bigCircle).toBe(false);
  });

  it("USDT parses amounts with 6 decimals and sends asset 1", () => {
    const v = validate(
      { ...DEFAULTS, name: "Dollar Gang", asset: "USDT", installment: "50", fee1: "1", fee2: "1" },
      SELF,
    );
    expect(v.ok).toBe(true);
    expect(v.cfg?.asset).toBe(1);
    expect(v.cfg?.installment).toBe(50_000_000n);
    expect(v.cfg?.fee1).toBe(1_000_000n);
    const tooFine = validate(
      { ...DEFAULTS, name: "Dollar Gang", asset: "USDT", installment: "1.0000001" },
      SELF,
    );
    expect(tooFine.errors.installment).toMatch(/6 decimals/);
  });

  it("refuses 2 and 51, accepts 3 and 50, and notes slower votes above 20", () => {
    expect(maxMembersProblem("2")).toMatch(/at least 3/);
    expect(maxMembersProblem("51")).toMatch(/at most 50/);
    expect(maxMembersProblem("")).toMatch(/whole number/);
    expect(maxMembersProblem("12.5")).toMatch(/whole number/);
    expect(maxMembersProblem("3")).toBeNull();
    expect(maxMembersProblem("50")).toBeNull();
    expect(validate({ ...DEFAULTS, name: "Gang", maxMembers: "51" }, SELF).ok).toBe(false);
    const big = validate({ ...DEFAULTS, name: "Gang", maxMembers: "50" }, SELF);
    expect(big.ok).toBe(true);
    expect(big.cfg?.maxMembers).toBe(50);
    expect(big.bigCircle).toBe(true);
    expect(validate({ ...DEFAULTS, name: "Gang", maxMembers: "20" }, SELF).bigCircle).toBe(false);
  });

  it("refuses more starting members than the cap", () => {
    const friends = [
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    ].join("\n");
    const v = validate({ ...DEFAULTS, name: "Gang", maxMembers: "3", founders: friends }, SELF);
    expect(v.errors.founders).toMatch(/more than the limit of 3/);
  });
});
