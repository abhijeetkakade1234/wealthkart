import { formatAvax } from "@wealthkart/sdk";
import { formatEther, parseEther } from "viem";

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

/** How a setting is shown and typed: basis points as %, whole %, days, months, AVAX, yes/no. */
export type RuleUnit = "bps" | "pct" | "days" | "months" | "times" | "members" | "avax" | "bool";

export interface RuleMeta {
  label: string;
  unit: RuleUnit;
  group: "loans" | "voting" | "leaving";
  /** One plain sentence under the form field. */
  hint: string;
}

export const RULE_META: Record<RuleKey, RuleMeta> = {
  interestBps: {
    label: "Loan interest",
    unit: "bps",
    group: "loans",
    hint: "Per month, 0 to 5%.",
  },
  tenorMonths: {
    label: "Loan term",
    unit: "months",
    group: "loans",
    hint: "Months in each loan term, 1 to 24.",
  },
  tenor2Bps: {
    label: "Interest in the second term",
    unit: "bps",
    group: "loans",
    hint: "Per month. At least the first rate, at most 10%.",
  },
  tenor3Bps: {
    label: "Interest in the third term",
    unit: "bps",
    group: "loans",
    hint: "Per month. At least the second rate, at most 10%.",
  },
  reserveBps: {
    label: "Cash kept back",
    unit: "bps",
    group: "loans",
    hint: "Share of the circle that is never lent out, 0 to 80%.",
  },
  maxLoanBps: {
    label: "Biggest loan",
    unit: "bps",
    group: "loans",
    hint: "Share of the circle one member can borrow, 1 to 100%.",
  },
  kMultiplier: {
    label: "Loan limit vs savings",
    unit: "times",
    group: "loans",
    hint: "A loan can be this many times your savings plus your guarantor's, 1 to 10.",
  },
  minInterestMonth: {
    label: "Charge at least one month's interest",
    unit: "bool",
    group: "loans",
    hint: "Even if the loan is repaid early.",
  },
  medicalCap: {
    label: "Medical loan limit",
    unit: "avax",
    group: "loans",
    hint: "In AVAX. 0 means no medical loans.",
  },
  medicalFreeMonths: {
    label: "Interest-free months on medical loans",
    unit: "months",
    group: "loans",
    hint: "0 to 12.",
  },
  guarantorRequired: {
    label: "Loans need a guarantor",
    unit: "bool",
    group: "loans",
    hint: "Another member backs each loan.",
  },
  interestFee: {
    label: "Late fee on loan interest",
    unit: "avax",
    group: "loans",
    hint: "In AVAX, per month the interest is late. At most half the monthly amount.",
  },
  defaultAfter: {
    label: "Missed interest months before a default",
    unit: "months",
    group: "loans",
    hint: "1 to 6.",
  },
  minMembersForLoans: {
    label: "Members needed before loans",
    unit: "members",
    group: "loans",
    hint: "At least 3.",
  },
  passPct: {
    label: "Yes votes needed",
    unit: "pct",
    group: "voting",
    hint: "Percent, for loans, rule changes and fee waivers. 50 means more than half.",
  },
  dissolvePassPct: {
    label: "Yes votes needed to close the circle",
    unit: "pct",
    group: "voting",
    hint: "Percent, 50 to 100.",
  },
  ruleChangeDelayDays: {
    label: "Wait before new rules apply",
    unit: "days",
    group: "voting",
    hint: "3 to 30 days, then the change starts on the 1st of the next month.",
  },
  exitNoticeDays: {
    label: "Notice to leave",
    unit: "days",
    group: "leaving",
    hint: "0 to 90 days.",
  },
  exitFeeBps: {
    label: "Leaving fee",
    unit: "bps",
    group: "leaving",
    hint: "Percent kept by the circle, 0 to 10.",
  },
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
  const t = text.trim().replace(/%$/, "").trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  const [w = "0", f = ""] = t.split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}

/** 150 -> "1.5" (for a form field). */
export function bpsToPercentText(bps: number): string {
  return formatBps(bps).replace(/%$/, "");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One setting in plain words, e.g. "1.5% a month", "30 days", "No medical loans". */
export function formatRule(key: RuleKey, value: RulesParams[RuleKey]): string {
  const meta = RULE_META[key];
  switch (meta.unit) {
    case "bool":
      return value ? "Yes" : "No";
    case "avax":
      if (key === "medicalCap" && value === 0n) return "No medical loans";
      return `${formatAvax(value as bigint, 4)} AVAX`;
    case "bps":
      return key === "interestBps" || key === "tenor2Bps" || key === "tenor3Bps"
        ? `${formatBps(value as number)} a month`
        : formatBps(value as number);
    case "pct":
      return value === 50 ? "More than half" : `${String(value)}%`;
    case "days":
      return plural(value as number, "day", "days");
    case "months":
      return plural(value as number, "month", "months");
    case "times":
      return `${String(value)}x`;
    case "members":
      return plural(value as number, "member", "members");
  }
}

export interface RuleChange {
  key: RuleKey;
  label: string;
  before: string;
  after: string;
}

/** The settings that differ, in struct order, each in plain words. */
export function ruleDiff(before: RulesParams, after: RulesParams): RuleChange[] {
  return RULE_KEYS.filter((k) => before[k] !== after[k]).map((k) => ({
    key: k,
    label: RULE_META[k].label,
    before: formatRule(k, before[k]),
    after: formatRule(k, after[k]),
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
    return bad("interestBps", "Loan interest must be 0 to 5% a month.");
  }
  if (p.tenorMonths < 1 || p.tenorMonths > 24) {
    return bad("tenorMonths", "A loan term must be 1 to 24 months.");
  }
  if (p.tenor2Bps < p.interestBps) {
    return bad("tenor2Bps", "The second-term rate can't be lower than the first.");
  }
  if (p.tenor3Bps < p.tenor2Bps) {
    return bad("tenor3Bps", "The third-term rate can't be lower than the second.");
  }
  if (p.tenor3Bps > 1000) return bad("tenor3Bps", "Term rates must stay at or below 10% a month.");
  if (p.reserveBps < 0 || p.reserveBps > 8000) {
    return bad("reserveBps", "Cash kept back must be 0 to 80%.");
  }
  if (p.maxLoanBps < 100 || p.maxLoanBps > 10_000) {
    return bad("maxLoanBps", "The biggest loan must be 1 to 100% of the circle.");
  }
  if (p.kMultiplier < 1 || p.kMultiplier > 10) {
    return bad("kMultiplier", "The loan limit must be 1 to 10 times savings.");
  }
  if (p.medicalFreeMonths < 0 || p.medicalFreeMonths > 12) {
    return bad("medicalFreeMonths", "Interest-free months must be 0 to 12.");
  }
  if (p.interestFee * 2n > installment) {
    return bad("interestFee", "The late fee on interest can be at most half the monthly amount.");
  }
  if (p.defaultAfter < 1 || p.defaultAfter > 6) {
    return bad("defaultAfter", "A default can come after 1 to 6 missed months.");
  }
  if (p.minMembersForLoans < 3) {
    return bad("minMembersForLoans", "Loans need at least 3 members.");
  }
  if (p.passPct < 50 || p.passPct > 100) {
    return bad("passPct", "Yes votes needed must be 50 to 100%.");
  }
  if (p.dissolvePassPct < 50 || p.dissolvePassPct > 100) {
    return bad("dissolvePassPct", "Yes votes needed to close must be 50 to 100%.");
  }
  if (p.ruleChangeDelayDays < 3 || p.ruleChangeDelayDays > 30) {
    return bad("ruleChangeDelayDays", "The wait before new rules apply must be 3 to 30 days.");
  }
  if (p.exitNoticeDays < 0 || p.exitNoticeDays > 90) {
    return bad("exitNoticeDays", "Notice to leave must be 0 to 90 days.");
  }
  if (p.exitFeeBps < 0 || p.exitFeeBps > 1000) {
    return bad("exitFeeBps", "The leaving fee must be 0 to 10%.");
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

/** Form text for each setting (percent, days, AVAX, "true"/"false"). */
export type RulesForm = Record<RuleKey, string>;

export function rulesToForm(p: RulesParams): RulesForm {
  const out = {} as RulesForm;
  for (const k of RULE_KEYS) {
    const unit = RULE_META[k].unit;
    const v = p[k];
    out[k] =
      unit === "bps"
        ? bpsToPercentText(v as number)
        : unit === "avax"
          ? formatEther(v as bigint)
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
): { params: RulesParams | null; errors: Partial<Record<RuleKey, string>> } {
  const errors: Partial<Record<RuleKey, string>> = {};
  const out: Record<string, unknown> = {};
  for (const k of RULE_KEYS) {
    const unit = RULE_META[k].unit;
    const t = (f[k] ?? "").trim();
    if (unit === "bool") {
      out[k] = t === "true";
    } else if (unit === "bps") {
      const v = percentToBps(t);
      if (v === null) errors[k] = "Enter a percentage like 1 or 1.5.";
      else out[k] = v;
    } else if (unit === "avax") {
      if (!/^\d+(\.\d{1,18})?$/.test(t)) errors[k] = "Enter an amount like 0.01, or 0.";
      else out[k] = parseEther(t);
    } else if (!/^\d{1,5}$/.test(t)) {
      errors[k] = "Enter a whole number.";
    } else {
      out[k] = Number(t);
    }
  }
  if (Object.keys(errors).length > 0) return { params: null, errors };
  const params = out as unknown as RulesParams;
  const problem = rulesProblem(params, installment);
  if (problem) return { params: null, errors: { [problem.key]: problem.message } };
  return { params, errors };
}
