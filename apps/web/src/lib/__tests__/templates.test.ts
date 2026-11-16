import { describe, expect, it } from "vitest";

import { DEFAULTS, MAX_QUORUM_PCT, MIN_QUORUM_PCT, validate } from "@/lib/circle-form";
import { rulesProblem } from "@/lib/rules";
import {
  applyTemplate,
  changedFromTemplate,
  ordinal,
  switchAsset,
  templateById,
  templateSummary,
  TEMPLATES,
} from "@/lib/templates";

const SELF = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ASSETS = ["AVAX", "USDT"] as const;

describe("S-TPL-01 every template passes the create form's own validator (ADR 0022 bounds)", () => {
  for (const t of TEMPLATES) {
    for (const asset of ASSETS) {
      it(`${t.name} in ${asset}`, () => {
        const form = applyTemplate({ ...DEFAULTS, name: "Test Circle", asset }, t);
        const v = validate(form, SELF);
        expect(v.errors).toEqual({});
        expect(v.ok).toBe(true);
        const cfg = v.cfg!;
        // Same bounds as CircleVault._validate and Rules.validate.
        expect(cfg.dueDay).toBeGreaterThanOrEqual(1);
        expect(cfg.dueDay).toBeLessThanOrEqual(28);
        expect(cfg.secondFeeDay).toBeGreaterThan(cfg.dueDay);
        expect(cfg.secondFeeDay).toBeLessThanOrEqual(28);
        expect(cfg.fee1 * 2n).toBeLessThanOrEqual(cfg.installment);
        expect(cfg.fee2 * 2n).toBeLessThanOrEqual(cfg.installment);
        expect(cfg.quorumPct).toBeGreaterThanOrEqual(MIN_QUORUM_PCT);
        expect(cfg.quorumPct).toBeLessThanOrEqual(MAX_QUORUM_PCT);
        expect(cfg.maxMembers).toBeGreaterThanOrEqual(3);
        expect(cfg.maxMembers).toBeLessThanOrEqual(50);
        expect(rulesProblem(cfg.rules, cfg.installment)).toBeNull();
      });
    }
  }

  it("Friends and Custom start from today's defaults", () => {
    for (const id of ["friends", "custom"]) {
      const form = applyTemplate({ ...DEFAULTS }, templateById(id)!);
      expect(form).toEqual(DEFAULTS);
    }
  });

  it("Family is gentler and Office stricter than Friends", () => {
    const f = templateById("friends")!.values.AVAX;
    const fam = templateById("family")!.values.AVAX;
    const off = templateById("office")!.values.AVAX;
    expect(Number(fam.holidays)).toBeGreaterThan(Number(f.holidays));
    expect(Number(fam.exitNoticeDays)).toBeGreaterThan(Number(f.exitNoticeDays));
    expect(Number(fam.fee1) / Number(fam.installment)).toBeLessThan(
      Number(f.fee1) / Number(f.installment),
    );
    expect(Number(off.quorumPct)).toBeGreaterThan(Number(f.quorumPct));
    expect(off.guarantorRequired).toBe("true");
    expect(Number(off.kMultiplier)).toBeLessThan(Number(f.kMultiplier));
  });
});

describe("S-TPL-02 applying a template keeps the creator's own choices", () => {
  it("never touches name, founders or asset, and keeps a cap the creator typed", () => {
    const start = { ...DEFAULTS, name: "Kin", founders: "0xabc", asset: "USDT" as const };
    const fam = applyTemplate(start, templateById("family")!, templateById("friends"));
    expect(fam.name).toBe("Kin");
    expect(fam.founders).toBe("0xabc");
    expect(fam.asset).toBe("USDT");
    expect(fam.installment).toBe("25");
    expect(fam.maxMembers).toBe("10");

    const typed = applyTemplate(
      { ...fam, maxMembers: "7" },
      templateById("office")!,
      templateById("family"),
    );
    expect(typed.maxMembers).toBe("7");
    expect(typed.guarantorRequired).toBe("true");
  });

  it("switching asset swaps the template's amounts but keeps typed ones", () => {
    const fam = templateById("family")!;
    const avax = applyTemplate({ ...DEFAULTS }, fam);
    const usdt = switchAsset({ ...avax, fee1: "0.003" }, "USDT", fam);
    expect(usdt.installment).toBe("25");
    expect(usdt.fee2).toBe("0.25");
    expect(usdt.fee1).toBe("0.003");
  });

  it("counts edits away from the template", () => {
    const fam = templateById("family")!;
    const form = applyTemplate({ ...DEFAULTS }, fam);
    expect(changedFromTemplate(form, fam)).toBe(0);
    expect(changedFromTemplate({ ...form, holidays: "4" }, fam)).toBe(1);
  });
});

describe("S-TPL-03 template summaries are plain and exact", () => {
  it("says the fee as an amount and a share of the installment", () => {
    const lines = templateSummary(templateById("friends")!, "AVAX");
    expect(lines[1]).toBe(
      "Late fee after the due day: 0.01 AVAX (2% of the monthly amount), and the same again after day 20.",
    );
    expect(templateSummary(templateById("family")!, "USDT")[1]).toContain("0.25 USDT (1% of");
    expect(templateSummary(templateById("office")!, "AVAX").join(" ")).toContain(
      "Every loan needs a guarantor.",
    );
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 28].map(ordinal)).toEqual([
      "the 1st",
      "the 2nd",
      "the 3rd",
      "the 4th",
      "the 11th",
      "the 12th",
      "the 13th",
      "the 21st",
      "the 22nd",
      "the 28th",
    ]);
  });
});
