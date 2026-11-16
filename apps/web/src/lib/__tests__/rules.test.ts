import { parseEther } from "viem";
import { describe, expect, it } from "vitest";

import {
  bpsToPercentText,
  defaultRules,
  formatBps,
  formatRule,
  percentToBps,
  ruleDiff,
  rulesFromChain,
  rulesFromForm,
  rulesProblem,
  rulesToForm,
} from "@/lib/rules";

const INSTALLMENT = parseEther("0.5");
const base = defaultRules(INSTALLMENT);

describe("percent and basis points", () => {
  it("S-WEB-45 formats bps as a percentage without trailing zeros", () => {
    expect(formatBps(0)).toBe("0%");
    expect(formatBps(100)).toBe("1%");
    expect(formatBps(150)).toBe("1.5%");
    expect(formatBps(125)).toBe("1.25%");
    expect(formatBps(5)).toBe("0.05%");
    expect(formatBps(2000)).toBe("20%");
  });

  it("S-WEB-45 parses typed percentages back, two decimals at most", () => {
    expect(percentToBps("1.5")).toBe(150);
    expect(percentToBps("20%")).toBe(2000);
    expect(percentToBps("0.05")).toBe(5);
    expect(percentToBps(" 3 ")).toBe(300);
    expect(percentToBps("1.234")).toBeNull();
    expect(percentToBps("-1")).toBeNull();
    expect(percentToBps("abc")).toBeNull();
    expect(bpsToPercentText(150)).toBe("1.5");
  });
});

describe("rules in plain words", () => {
  it("S-WEB-46 each unit reads naturally", () => {
    expect(formatRule("interestBps", 150)).toBe("1.5% a month");
    expect(formatRule("reserveBps", 2000)).toBe("20%");
    expect(formatRule("exitNoticeDays", 1)).toBe("1 day");
    expect(formatRule("exitNoticeDays", 30)).toBe("30 days");
    expect(formatRule("passPct", 50)).toBe("More than half");
    expect(formatRule("dissolvePassPct", 66)).toBe("66%");
    expect(formatRule("medicalCap", 0n)).toBe("No medical loans");
    expect(formatRule("interestFee", parseEther("0.01"))).toBe("0.0100 AVAX");
    expect(formatRule("guarantorRequired", true)).toBe("Yes");
    expect(formatRule("kMultiplier", 2)).toBe("2x");
  });

  it("S-WEB-46 rule diff lists only what changed, before and after", () => {
    expect(ruleDiff(base, base)).toEqual([]);
    const next = { ...base, exitNoticeDays: 14, interestBps: 150 };
    expect(ruleDiff(base, next)).toEqual([
      { key: "interestBps", label: "Loan interest", before: "1% a month", after: "1.5% a month" },
      { key: "exitNoticeDays", label: "Notice to leave", before: "30 days", after: "14 days" },
    ]);
  });
});

describe("rulesProblem mirrors Rules.validate", () => {
  it("S-WEB-47 the defaults are valid", () => {
    expect(rulesProblem(base, INSTALLMENT)).toBeNull();
  });

  const cases: Array<[string, Partial<typeof base>, string]> = [
    ["interest above 5%", { interestBps: 501 }, "interestBps"],
    ["tenor 0", { tenorMonths: 0 }, "tenorMonths"],
    ["tenor 25", { tenorMonths: 25 }, "tenorMonths"],
    ["step-down second rate", { tenor2Bps: 50 }, "tenor2Bps"],
    ["step-down third rate", { tenor3Bps: 140 }, "tenor3Bps"],
    ["third rate above 10%", { tenor3Bps: 1001 }, "tenor3Bps"],
    ["reserve above 80%", { reserveBps: 8001 }, "reserveBps"],
    ["max loan below 1%", { maxLoanBps: 99 }, "maxLoanBps"],
    ["max loan above 100%", { maxLoanBps: 10_001 }, "maxLoanBps"],
    ["k of 0", { kMultiplier: 0 }, "kMultiplier"],
    ["k of 11", { kMultiplier: 11 }, "kMultiplier"],
    ["13 medical free months", { medicalFreeMonths: 13 }, "medicalFreeMonths"],
    ["fee above half", { interestFee: parseEther("0.26") }, "interestFee"],
    ["default after 0", { defaultAfter: 0 }, "defaultAfter"],
    ["default after 7", { defaultAfter: 7 }, "defaultAfter"],
    ["2 members for loans", { minMembersForLoans: 2 }, "minMembersForLoans"],
    ["pass 49", { passPct: 49 }, "passPct"],
    ["pass 101", { passPct: 101 }, "passPct"],
    ["dissolve 49", { dissolvePassPct: 49 }, "dissolvePassPct"],
    ["delay 2", { ruleChangeDelayDays: 2 }, "ruleChangeDelayDays"],
    ["delay 31", { ruleChangeDelayDays: 31 }, "ruleChangeDelayDays"],
    ["notice 91", { exitNoticeDays: 91 }, "exitNoticeDays"],
    ["fee 10.01%", { exitFeeBps: 1001 }, "exitFeeBps"],
  ];
  for (const [name, change, key] of cases) {
    it(`S-WEB-47 refuses ${name}`, () => {
      const p = rulesProblem({ ...base, ...change }, INSTALLMENT);
      expect(p?.key).toBe(key);
      expect(p?.message).toMatch(/\w/);
    });
  }

  it("S-WEB-47 edges are accepted", () => {
    const edges = {
      ...base,
      interestBps: 500,
      tenor2Bps: 500,
      tenor3Bps: 1000,
      reserveBps: 8000,
      maxLoanBps: 100,
      kMultiplier: 10,
      interestFee: INSTALLMENT / 2n,
      passPct: 100,
      ruleChangeDelayDays: 3,
      exitNoticeDays: 0,
      exitFeeBps: 1000,
    };
    expect(rulesProblem(edges, INSTALLMENT)).toBeNull();
  });
});

describe("rule form and chain shapes", () => {
  it("S-WEB-48 form round-trips the rules", () => {
    const f = rulesToForm(base);
    expect(f.interestBps).toBe("1");
    expect(f.minInterestMonth).toBe("true");
    expect(f.interestFee).toBe("0.01");
    const back = rulesFromForm(f, INSTALLMENT);
    expect(back.errors).toEqual({});
    expect(back.params).toEqual(base);
  });

  it("S-WEB-48 form reports typing and bounds problems on the right field", () => {
    const f = rulesToForm(base);
    expect(rulesFromForm({ ...f, exitNoticeDays: "two" }, INSTALLMENT).errors.exitNoticeDays).toBe(
      "Enter a whole number.",
    );
    expect(rulesFromForm({ ...f, reserveBps: "x" }, INSTALLMENT).errors.reserveBps).toMatch(
      /percentage/,
    );
    const bounds = rulesFromForm({ ...f, exitNoticeDays: "120" }, INSTALLMENT);
    expect(bounds.params).toBeNull();
    expect(bounds.errors.exitNoticeDays).toBe("Notice to leave must be 0 to 90 days.");
  });

  it("S-WEB-48 reads viem's struct output (numbers and bigints)", () => {
    const raw = { ...base, interestBps: 100, medicalCap: 0n, interestFee: 10n ** 16n };
    expect(rulesFromChain(raw)).toEqual(base);
  });
});
