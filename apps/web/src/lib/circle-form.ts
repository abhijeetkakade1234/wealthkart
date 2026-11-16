import { type Address, isAddress } from "viem";

import { AVAX, ASSET_ENUM, type AssetSymbol, type CircleAsset, parseAmount } from "@/lib/asset";
import {
  defaultRules,
  percentToBps,
  type RuleKey,
  rulesProblem,
  type RulesParams,
} from "@/lib/rules";

/** Create-circle form: shape, defaults (G1 values) and validation mirroring the contract (ADR 0022). */

/** Creator plus invited founders (ADR 0045). */
export const MAX_FOUNDERS = 50;
/** Member cap bounds (ADR 0045): `Config.maxMembers` must be 3..50. */
export const MIN_MAX_MEMBERS = 3;
export const MAX_MAX_MEMBERS = 50;
/** Above this, votes slow down noticeably; the form says so. */
export const BIG_CIRCLE_NOTE_ABOVE = 20;
/** Voting window until the form exposes it (ADR 0022 default). */
export const DEFAULT_VOTING_WINDOW_SECONDS = 48 * 60 * 60;
export const DEFAULT_QUORUM_PCT = 50;
/** `CircleVault` bounds for `Config.quorumPct` (MIN_QUORUM_PCT..MAX_QUORUM_PCT). */
export const MIN_QUORUM_PCT = 20;
export const MAX_QUORUM_PCT = 100;
/** G1's size (ADR 0045). */
export const DEFAULT_MAX_MEMBERS = 12;

export interface FormState {
  name: string;
  /** Fixed forever once the circle exists (ADR 0046). */
  asset: AssetSymbol;
  /** Most members the circle can ever have, 3 to 50 (ADR 0045). */
  maxMembers: string;
  installment: string;
  dueDay: string;
  fee1: string;
  fee2: string;
  secondFeeDay: string;
  holidays: string;
  /** Missed installments before a dormant vote is allowed (ADR 0032). */
  dormantAfter: string;
  /** Installments a member admitted by vote pays before voting (ADR 0033). */
  minPaidToVote: string;
  /** Share of voters who must take part for a vote to count, 20 to 100 (`Config.quorumPct`). */
  quorumPct: string;
  /** Rules (ADR 0022, `Rules.Params`) the form exposes; the rest keep `Rules.defaults`. */
  passPct: string;
  /** Loan interest per month, in percent ("1", "1.5"). */
  interestPct: string;
  kMultiplier: string;
  /** "true" or "false". */
  guarantorRequired: string;
  exitNoticeDays: string;
  founders: string;
}

export const DEFAULTS: FormState = {
  name: "",
  asset: "AVAX",
  maxMembers: String(DEFAULT_MAX_MEMBERS),
  installment: "0.5",
  dueDay: "10",
  fee1: "0.01",
  fee2: "0.01",
  secondFeeDay: "20",
  holidays: "3",
  dormantAfter: "3",
  minPaidToVote: "2",
  quorumPct: String(DEFAULT_QUORUM_PCT),
  passPct: "50",
  interestPct: "1",
  kMultiplier: "2",
  guarantorRequired: "false",
  exitNoticeDays: "30",
  founders: "",
};

/** The asset the form will create, for parsing and labels (decimals come from the symbol). */
export function formAsset(symbol: AssetSymbol): CircleAsset {
  return symbol === "USDT" ? { token: null, symbol: "USDT", decimals: 6 } : AVAX;
}

/** Problem with the member cap, or null. */
export function maxMembersProblem(text: string): string | null {
  const n = Number(text.trim());
  if (text.trim() === "" || !Number.isInteger(n))
    return `Pick a whole number from ${MIN_MAX_MEMBERS} to ${MAX_MAX_MEMBERS}.`;
  if (n < MIN_MAX_MEMBERS) return `A circle needs room for at least ${MIN_MAX_MEMBERS} members.`;
  if (n > MAX_MAX_MEMBERS) return `A circle can have at most ${MAX_MAX_MEMBERS} members.`;
  return null;
}

const CIRCLE_NAME_CHARS = /^[A-Za-z0-9 _'&-]+$/;

/**
 * Plain-language problem with a circle name, or null. Mirrors CircleName.sol (ADR 0033,
 * RT-26): 3-48 letters, digits, spaces and _ - ' &, single spaces, no dots, colons or
 * slashes, so a name can never carry a link or a web address.
 */
export function circleNameProblem(name: string): string | null {
  if (name.length === 0) return "Give the circle a name.";
  if (/[.:/]/.test(name)) {
    return "Circle names can't contain web addresses or dots, so nobody can use one as a fake link.";
  }
  if (!CIRCLE_NAME_CHARS.test(name)) {
    return "Use only letters, numbers, spaces and _ - ' &.";
  }
  if (name.length < 3) return "Use at least 3 characters.";
  if (name.length > 48) return "Keep the name to 48 characters or fewer.";
  if (name.includes("  ")) return "Use single spaces between words.";
  return null;
}

/** Client-side checks that mirror the contract (ADR 0022), in plain words. */
export function validate(f: FormState, self: Address | undefined) {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const nameProblem = circleNameProblem(f.name.trim());
  if (nameProblem) errors.name = nameProblem;

  const asset = formAsset(f.asset);
  const installment = parseAmount(f.installment, asset);
  if (installment === null || installment === 0n)
    errors.installment =
      asset.symbol === "USDT"
        ? "Enter an amount above 0, like 50. USDT has at most 6 decimals."
        : "Enter an amount above 0, like 0.5.";
  const fee1 = parseAmount(f.fee1, asset);
  if (fee1 === null) errors.fee1 = "Enter a fee, or 0 for none.";
  const fee2 = parseAmount(f.fee2, asset);
  if (fee2 === null) errors.fee2 = "Enter a fee, or 0 for none.";
  // ADR 0030: each late fee is at most half the installment.
  if (installment !== null && installment > 0n) {
    if (fee1 !== null && fee1 * 2n > installment)
      errors.fee1 = "Keep each late fee at or below half the monthly amount.";
    if (fee2 !== null && fee2 * 2n > installment)
      errors.fee2 = "Keep each late fee at or below half the monthly amount.";
  }

  const dueDay = Number(f.dueDay);
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)
    errors.dueDay = "Pick a day from 1 to 28.";
  const secondFeeDay = Number(f.secondFeeDay);
  if (!Number.isInteger(secondFeeDay) || secondFeeDay <= dueDay || secondFeeDay > 28)
    errors.secondFeeDay = "Must be after the due day and no later than the 28th.";
  const holidays = Number(f.holidays);
  if (!Number.isInteger(holidays) || holidays < 0 || holidays > 12)
    errors.holidays = "Pick 0 to 12.";
  const dormantAfter = Number(f.dormantAfter);
  if (!Number.isInteger(dormantAfter) || dormantAfter < 1 || dormantAfter > 12)
    errors.dormantAfter = "Pick 1 to 12.";
  const minPaidToVote = Number(f.minPaidToVote);
  if (!Number.isInteger(minPaidToVote) || minPaidToVote < 0 || minPaidToVote > 6)
    errors.minPaidToVote = "Pick 0 to 6.";

  const quorumPct = Number(f.quorumPct);
  if (!Number.isInteger(quorumPct) || quorumPct < MIN_QUORUM_PCT || quorumPct > MAX_QUORUM_PCT)
    errors.quorumPct = `Pick ${MIN_QUORUM_PCT} to ${MAX_QUORUM_PCT}.`;
  const rules = formRules(f, installment);
  Object.assign(errors, rules.errors);

  const capProblem = maxMembersProblem(f.maxMembers);
  if (capProblem) errors.maxMembers = capProblem;
  const maxMembers = capProblem ? MAX_MAX_MEMBERS : Number(f.maxMembers.trim());

  const lines = f.founders
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = lines.find((l) => !isAddress(l));
  const set = new Map<string, Address>();
  if (self) set.set(self.toLowerCase(), self);
  for (const l of lines) if (isAddress(l)) set.set(l.toLowerCase(), l as Address);
  if (bad) errors.founders = `"${bad.slice(0, 16)}…" isn't a wallet address.`;
  else if (set.size > MAX_FOUNDERS)
    errors.founders = `A circle can start with at most ${MAX_FOUNDERS} members.`;
  else if (!capProblem && set.size > maxMembers)
    errors.founders = `That's ${set.size} members with you, more than the limit of ${maxMembers}. Raise the limit or invite fewer friends.`;

  return {
    errors,
    ok: Object.keys(errors).length === 0,
    founders: [...set.values()],
    asset,
    /** Big circles work, but every vote needs more people (shown as a note, not an error). */
    bigCircle: !capProblem && maxMembers > BIG_CIRCLE_NOTE_ABOVE,
    /** Everyone except the creator: they get an invite and must accept (ADR 0028). */
    invitees: [...set.values()].filter((a) => a.toLowerCase() !== self?.toLowerCase()),
    cfg:
      installment !== null && fee1 !== null && fee2 !== null && rules.params
        ? {
            name: f.name.trim(),
            asset: ASSET_ENUM[f.asset],
            installment,
            fee1,
            fee2,
            dueDay,
            secondFeeDay,
            holidaysPerYear: holidays,
            votingWindow: DEFAULT_VOTING_WINDOW_SECONDS,
            quorumPct,
            maxMembers,
            dormantAfter,
            minPaidToVote,
            rules: rules.params,
          }
        : null,
  };
}

/** Form field for each rule the create form shows (the others keep `Rules.defaults`). */
const RULE_FIELD: Partial<Record<RuleKey, keyof FormState>> = {
  interestBps: "interestPct",
  tenor2Bps: "interestPct",
  tenor3Bps: "interestPct",
  kMultiplier: "kMultiplier",
  guarantorRequired: "guarantorRequired",
  passPct: "passPct",
  exitNoticeDays: "exitNoticeDays",
};

/**
 * The circle's starting rules: `Rules.defaults(installment)` with the form's loan, vote and
 * notice fields on top, checked with the same `rulesProblem` the rule-change form uses.
 * The later-term rates rise with the first rate so a higher rate never breaks their order.
 */
export function formRules(
  f: FormState,
  installment: bigint | null,
): { params: RulesParams | null; errors: Partial<Record<keyof FormState, string>> } {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const interestBps = percentToBps(f.interestPct);
  if (interestBps === null) errors.interestPct = "Enter a percentage like 1 or 1.5.";
  const whole = (k: keyof FormState) => {
    const t = f[k].trim();
    if (!/^\d{1,3}$/.test(t)) {
      errors[k] = "Enter a whole number.";
      return 0;
    }
    return Number(t);
  };
  const kMultiplier = whole("kMultiplier");
  const passPct = whole("passPct");
  const exitNoticeDays = whole("exitNoticeDays");
  if (Object.keys(errors).length > 0 || installment === null || installment === 0n) {
    return { params: null, errors };
  }
  const base = defaultRules(installment);
  const bps = interestBps ?? 0;
  const tenor2Bps = Math.max(base.tenor2Bps, bps);
  const params: RulesParams = {
    ...base,
    interestBps: bps,
    tenor2Bps,
    tenor3Bps: Math.max(base.tenor3Bps, tenor2Bps),
    kMultiplier,
    guarantorRequired: f.guarantorRequired === "true",
    passPct,
    exitNoticeDays,
  };
  const problem = rulesProblem(params, installment);
  if (problem) {
    const field = RULE_FIELD[problem.key] ?? "installment";
    return { params: null, errors: { [field]: problem.message } };
  }
  return { params, errors };
}
