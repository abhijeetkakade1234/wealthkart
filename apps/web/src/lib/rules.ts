import { t, tn } from "@/i18n/runtime";
import { AVAX, type CircleAsset, fmt, parseAmount, toInputText } from "@/lib/asset";

/**
 * Mirror of `Rules.defaults`, `Rules.Params` and `Rules.validate`
 * (packages/contracts/src/modules/Rules.sol, ADR 0037, 0040): the loan, exit and governance
 * settings a member vote can change. Bounds are checked on-chain; `rulesProblem` explains them
 * in plain words before anything is sent.
 */
export interface RulesParams {
  interestBps: number;
  tenorMonths: number;
  tenor2Bps: number;
  tenor3Bps: number;
  reserveBps: number;
  maxLoanBps: number;
  kMultiplier: number;
  minInterestMonth: boolean;
  medicalCap: bigint;
  medicalFreeMonths: number;
  guarantorRequired: boolean;
  interestFee: bigint;
  defaultAfter: number;
  minMembersForLoans: number;
  passPct: number;
  dissolvePassPct: number;
  ruleChangeDelayDays: number;
  exitNoticeDays: number;
  exitFeeBps: number;
}

export type RuleKey = keyof RulesParams;

/** Same values as `Rules.defaults(installment)`. */
export function defaultRules(installment: bigint): RulesParams {
  return {
    interestBps: 100,
    tenorMonths: 6,
    tenor2Bps: 150,
    tenor3Bps: 200,
    reserveBps: 2000,
    maxLoanBps: 4000,
    kMultiplier: 2,
    minInterestMonth: true,
    medicalCap: 0n,
    medicalFreeMonths: 3,
    guarantorRequired: false,
    interestFee: installment / 50n,
    defaultAfter: 2,
    minMembersForLoans: 3,
    passPct: 50,
    dissolvePassPct: 66,
    ruleChangeDelayDays: 7,
    exitNoticeDays: 30,
    exitFeeBps: 0,
  };
}

/** Field order of the Solidity struct (and of the form). */
export const RULE_KEYS: readonly RuleKey[] = [
  "interestBps",
  "tenorMonths",
  "tenor2Bps",
  "tenor3Bps",
  "reserveBps",
  "maxLoanBps",
  "kMultiplier",
  "minInterestMonth",
  "medicalCap",
  "medicalFreeMonths",
  "guarantorRequired",
  "interestFee",
  "defaultAfter",
  "minMembersForLoans",
  "passPct",
  "dissolvePassPct",
  "ruleChangeDelayDays",
  "exitNoticeDays",
  "exitFeeBps",
];

/**
 * How a setting is shown and typed: basis points as %, whole %, days, months, an amount in the
 * circle's asset (`avax` = AVAX or USDT units, ADR 0046), yes/no.
 */
export type RuleUnit = "bps" | "pct" | "days" | "months" | "times" | "members" | "avax" | "bool";

export interface RuleMeta {
  label: string;
  unit: RuleUnit;
  group: "loans" | "voting" | "leaving";
  /** One plain sentence under the form field. */
  hint: string;
}

/** Label and hint are read in the active language each time (ADR 0057). */
function meta(key: RuleKey, unit: RuleUnit, group: RuleMeta["group"]): RuleMeta {
  return {
    unit,
    group,
    get label() {
      return t(`rules.label.${key}`);
    },
    get hint() {
      return t(`rules.hint.${key}`);
    },
  };
}

export const RULE_META: Record<RuleKey, RuleMeta> = {
  interestBps: meta("interestBps", "bps", "loans"),
  tenorMonths: meta("tenorMonths", "months", "loans"),
  tenor2Bps: meta("tenor2Bps", "bps", "loans"),
  tenor3Bps: meta("tenor3Bps", "bps", "loans"),
  reserveBps: meta("reserveBps", "bps", "loans"),
  maxLoanBps: meta("maxLoanBps", "bps", "loans"),
  kMultiplier: meta("kMultiplier", "times", "loans"),
  minInterestMonth: meta("minInterestMonth", "bool", "loans"),
  medicalCap: meta("medicalCap", "avax", "loans"),
  medicalFreeMonths: meta("medicalFreeMonths", "months", "loans"),
  guarantorRequired: meta("guarantorRequired", "bool", "loans"),
  interestFee: meta("interestFee", "avax", "loans"),
  defaultAfter: meta("defaultAfter", "months", "loans"),
  minMembersForLoans: meta("minMembersForLoans", "members", "loans"),
  passPct: meta("passPct", "pct", "voting"),
  dissolvePassPct: meta("dissolvePassPct", "pct", "voting"),
  ruleChangeDelayDays: meta("ruleChangeDelayDays", "days", "voting"),
  exitNoticeDays: meta("exitNoticeDays", "days", "leaving"),
  exitFeeBps: meta("exitFeeBps", "bps", "leaving"),
};

/** 100 -> "1%", 150 -> "1.5%", 125 -> "1.25%". Basis points are never negative on-chain. */
export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = bps % 100;
  if (frac === 0) return `${whole}%`;
  const digits = String(frac).padStart(2, "0").replace(/0$/, "");
  return `${whole}.${digits}%`;
}

/** "1.5" -> 150. Up to two decimals; anything else is null. */
export function percentToBps(text: string): number | null {
  const v = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(v)) return null;
  const [w = "0", f = ""] = v.split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}

/** 150 -> "1.5" (for a form field). */
export function bpsToPercentText(bps: number): string {
  return formatBps(bps).replace(/%$/, "");
}

/** One setting in plain words, e.g. "1.5% a month", "30 days", "No medical loans". */
export function formatRule(
  key: RuleKey,
  value: RulesParams[RuleKey],
  asset: CircleAsset = AVAX,
): string {
  const meta = RULE_META[key];
  switch (meta.unit) {
    case "bool":
      return value ? t("rules.value.yes") : t("rules.value.no");
    case "avax":
      if (key === "medicalCap" && value === 0n) return t("rules.value.noMedicalLoans");
      return `${fmt(value as bigint, asset, asset.decimals === 6 ? 2 : 4)} ${asset.symbol}`;
    case "bps":
      return key === "interestBps" || key === "tenor2Bps" || key === "tenor3Bps"
        ? t("rules.value.perMonth", { rate: formatBps(value as number) })
        : formatBps(value as number);
    case "pct":
      return value === 50 ? t("rules.value.moreThanHalf") : `${String(value)}%`;
    case "days":
      return tn("rules.value.days", value as number);
    case "months":
      return tn("rules.value.months", value as number);
    case "times":
      return `${String(value)}x`;
    case "members":
      return tn("rules.value.members", value as number);
  }
}

export interface RuleChange {
  key: RuleKey;
  label: string;
  before: string;
  after: string;
}

/** The settings that differ, in struct order, each in plain words. */
export function ruleDiff(
  before: RulesParams,
  after: RulesParams,
  asset: CircleAsset = AVAX,
): RuleChange[] {
  return RULE_KEYS.filter((k) => before[k] !== after[k]).map((k) => ({
    key: k,
    label: RULE_META[k].label,
    before: formatRule(k, before[k], asset),
    after: formatRule(k, after[k], asset),
  }));
}

export interface RuleProblem {
  key: RuleKey;
  message: string;
}

/**
 * Plain-language problem with a set of rules, or null if `Rules.validate` would accept them.
 * Same checks, same order as the contract.
 */
export function rulesProblem(p: RulesParams, installment: bigint): RuleProblem | null {
  const bad = (key: RuleKey, message: string): RuleProblem => ({ key, message });
  if (p.interestBps < 0 || p.interestBps > 500) {
    return bad("interestBps", t("rules.problem.interestBps"));
  }
  if (p.tenorMonths < 1 || p.tenorMonths > 24) {
    return bad("tenorMonths", t("rules.problem.tenorMonths"));
  }
  if (p.tenor2Bps < p.interestBps) {
    return bad("tenor2Bps", t("rules.problem.tenor2Below"));
  }
  if (p.tenor3Bps < p.tenor2Bps) {
    return bad("tenor3Bps", t("rules.problem.tenor3Below"));
  }
  if (p.tenor3Bps > 1000) return bad("tenor3Bps", t("rules.problem.tenor3Max"));
  if (p.reserveBps < 0 || p.reserveBps > 8000) {
    return bad("reserveBps", t("rules.problem.reserveBps"));
  }
  if (p.maxLoanBps < 100 || p.maxLoanBps > 10_000) {
    return bad("maxLoanBps", t("rules.problem.maxLoanBps"));
  }
  if (p.kMultiplier < 1 || p.kMultiplier > 10) {
    return bad("kMultiplier", t("rules.problem.kMultiplier"));
  }
  if (p.medicalFreeMonths < 0 || p.medicalFreeMonths > 12) {
    return bad("medicalFreeMonths", t("rules.problem.medicalFreeMonths"));
  }
  if (p.interestFee * 2n > installment) {
    return bad("interestFee", t("rules.problem.interestFee"));
  }
  if (p.defaultAfter < 1 || p.defaultAfter > 6) {
    return bad("defaultAfter", t("rules.problem.defaultAfter"));
  }
  if (p.minMembersForLoans < 3) {
    return bad("minMembersForLoans", t("rules.problem.minMembersForLoans"));
  }
  if (p.passPct < 50 || p.passPct > 100) {
    return bad("passPct", t("rules.problem.passPct"));
  }
  if (p.dissolvePassPct < 50 || p.dissolvePassPct > 100) {
    return bad("dissolvePassPct", t("rules.problem.dissolvePassPct"));
  }
  if (p.ruleChangeDelayDays < 3 || p.ruleChangeDelayDays > 30) {
    return bad("ruleChangeDelayDays", t("rules.problem.ruleChangeDelayDays"));
  }
  if (p.exitNoticeDays < 0 || p.exitNoticeDays > 90) {
    return bad("exitNoticeDays", t("rules.problem.exitNoticeDays"));
  }
  if (p.exitFeeBps < 0 || p.exitFeeBps > 1000) {
    return bad("exitFeeBps", t("rules.problem.exitFeeBps"));
  }
  return null;
}

/** Rules as read from the chain (viem gives numbers for small ints, bigints for uint128). */
export function rulesFromChain(raw: object): RulesParams {
  const r = raw as Record<string, unknown>;
  const n = (k: RuleKey) => Number(r[k] ?? 0);
  const b = (k: RuleKey) => BigInt((r[k] as bigint | number | undefined) ?? 0);
  return {
    interestBps: n("interestBps"),
    tenorMonths: n("tenorMonths"),
    tenor2Bps: n("tenor2Bps"),
    tenor3Bps: n("tenor3Bps"),
    reserveBps: n("reserveBps"),
    maxLoanBps: n("maxLoanBps"),
    kMultiplier: n("kMultiplier"),
    minInterestMonth: Boolean(r.minInterestMonth),
    medicalCap: b("medicalCap"),
    medicalFreeMonths: n("medicalFreeMonths"),
    guarantorRequired: Boolean(r.guarantorRequired),
    interestFee: b("interestFee"),
    defaultAfter: n("defaultAfter"),
    minMembersForLoans: n("minMembersForLoans"),
    passPct: n("passPct"),
    dissolvePassPct: n("dissolvePassPct"),
    ruleChangeDelayDays: n("ruleChangeDelayDays"),
    exitNoticeDays: n("exitNoticeDays"),
    exitFeeBps: n("exitFeeBps"),
  };
}

/** Form text for each setting (percent, days, an amount, "true"/"false"). */
export type RulesForm = Record<RuleKey, string>;

export function rulesToForm(p: RulesParams, asset: CircleAsset = AVAX): RulesForm {
  const out = {} as RulesForm;
  for (const k of RULE_KEYS) {
    const unit = RULE_META[k].unit;
    const v = p[k];
    out[k] =
      unit === "bps"
        ? bpsToPercentText(v as number)
        : unit === "avax"
          ? toInputText(v as bigint, asset)
          : String(v);
  }
  return out;
}

/**
 * Parses the form back into rules. Fields that aren't numbers get their own message; the
 * bounds are then checked by `rulesProblem` (first problem only, like the contract).
 */
export function rulesFromForm(
  f: RulesForm,
  installment: bigint,
  asset: CircleAsset = AVAX,
): { params: RulesParams | null; errors: Partial<Record<RuleKey, string>> } {
  const errors: Partial<Record<RuleKey, string>> = {};
  const out: Record<string, unknown> = {};
  for (const k of RULE_KEYS) {
    const unit = RULE_META[k].unit;
    const text = (f[k] ?? "").trim();
    if (unit === "bool") {
      out[k] = text === "true";
    } else if (unit === "bps") {
      const v = percentToBps(text);
      if (v === null) errors[k] = t("rules.form.percent");
      else out[k] = v;
    } else if (unit === "avax") {
      const v = parseAmount(text, asset);
      if (v === null)
        errors[k] =
          asset.symbol === "USDT" ? t("rules.form.amountUsdt") : t("rules.form.amountAvax");
      else out[k] = v;
    } else if (!/^\d{1,5}$/.test(text)) {
      errors[k] = t("rules.form.whole");
    } else {
      out[k] = Number(text);
    }
  }
  if (Object.keys(errors).length > 0) return { params: null, errors };
  const params = out as unknown as RulesParams;
  const problem = rulesProblem(params, installment);
  if (problem) return { params: null, errors: { [problem.key]: problem.message } };
  return { params, errors };
}
