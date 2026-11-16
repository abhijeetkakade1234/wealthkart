/**
 * Pure membership helpers that mirror CircleVault (ADR 0028) and DisplayName.sol (ADR 0029),
 * so the UI can explain a vote or a name before anything is sent.
 */

import { t, tn } from "@/i18n/runtime";
import "@/i18n/en/membership";

export const NAME_MIN = 3;
export const NAME_MAX = 24;
/** Same as CircleVault.NAME_COOLDOWN. */
export const NAME_COOLDOWN_SECONDS = 30 * 86_400;
/** Same as CircleVault.ADMISSION_PASS_PCT: join passes with at least 66% yes of votes cast. */
export const ADMISSION_PASS_PCT = 66;
/** Same as CircleVault.DORMANT_PASS_PCT: dormant passes with more than 50% yes (ADR 0032). */
export const DORMANT_PASS_PCT = 50;

/** Membership.Kind order: join, dormant, backup-wallet claim (ADR 0056). */
export type RequestKind = "join" | "dormant" | "claim";
export function requestKind(kind: number): RequestKind {
  return kind === 2 ? "claim" : kind === 1 ? "dormant" : "join";
}

/** Same rule as Membership._passes: join and claim need 66% yes, dormant more than 50%. */
function passes(kind: RequestKind, yes: number, total: number): boolean {
  return kind === "dormant"
    ? yes * 100 > DORMANT_PASS_PCT * total
    : yes * 100 >= ADMISSION_PASS_PCT * total;
}

const ALLOWED = /^[A-Za-z0-9 _.-]+$/;

/**
 * Plain-language problem with a display name, or null if the contract would accept it.
 * Mirrors DisplayName.isValid: 3–24 ASCII letters, digits, space, `_ . -`; no space at
 * either end; no double spaces.
 */
export function displayNameProblem(name: string): string | null {
  if (name.length === 0) return t("membership.nameEmpty");
  if (!ALLOWED.test(name)) return t("membership.nameChars");
  // ALLOWED is ASCII-only, so string length equals byte length here.
  if (name.length < NAME_MIN) return t("membership.nameMin", { min: NAME_MIN });
  if (name.length > NAME_MAX) return t("membership.nameMax", { max: NAME_MAX });
  if (name.startsWith(" ") || name.endsWith(" ")) return t("membership.nameEdgeSpace");
  if (name.includes("  ")) return t("membership.nameDoubleSpace");
  return null;
}

/** Uniqueness key: names are unique ignoring letter case. */
export function nameKey(name: string): string {
  return name.toLowerCase();
}

/** Shareable join link. The link carries only the circle address and, optionally, who invited. */
export function inviteLink(origin: string, circle: string, by?: string): string {
  const base = `${origin.replace(/\/$/, "")}/app/join/?id=${circle}`;
  return by ? `${base}&by=${by}` : base;
}

export type VoteOutcome = "open" | "approved" | "rejected" | "expired";

export interface Tally {
  /** Members who could vote when the request was made (quorum denominator). */
  eligible: number;
  yes: number;
  no: number;
  /** Circle's quorum, percent of `eligible` who must vote. */
  quorumPct: number;
  /** Join and claim (66% yes) or dormant (more than 50% yes). Defaults to join. */
  kind?: RequestKind;
}

/** Votes needed for quorum (rounded up, like the contract's `cast * 100 >= pct * e`). */
export function quorumVotes(eligible: number, quorumPct: number): number {
  return Math.ceil((quorumPct * eligible) / 100);
}

/**
 * Same decision as Membership._outcome. "open" means not decided yet. Before the window
 * ends a request is decided only when the remaining votes can't change the result.
 */
export function voteOutcome(t: Tally, ended: boolean): VoteOutcome {
  const { eligible: e, yes, no, quorumPct } = t;
  const kind = t.kind ?? "join";
  const cast = yes + no;
  const quorum = cast * 100 >= quorumPct * e;
  if (quorum && passes(kind, yes, e)) return "approved";
  if (!passes(kind, e - no, e)) return "rejected";
  if (!ended) return "open";
  if (!quorum) return "expired";
  return passes(kind, yes, cast) ? "approved" : "rejected";
}

/** One line voters can read: "2 of 3 votes needed · 2 yes, 0 no · needs 66% yes". */
export function tallyLine(tally: Tally): string {
  const need = quorumVotes(tally.eligible, tally.quorumPct);
  const cast = tally.yes + tally.no;
  const mark =
    tally.kind === "dormant"
      ? t("membership.tallyMarkDormant", { pct: DORMANT_PASS_PCT })
      : t("membership.tallyMarkJoin", { pct: ADMISSION_PASS_PCT });
  return tn("membership.tally", need, { cast, yes: tally.yes, no: tally.no, mark });
}

/** Membership.Status enum order. */
export const JOIN_STATUS = [
  "none",
  "open",
  "approved",
  "rejected",
  "expired",
  "cancelled",
  "full",
] as const;
export type JoinStatusName = (typeof JOIN_STATUS)[number];

export function joinStatusName(status: number): JoinStatusName {
  return JOIN_STATUS[status] ?? "none";
}

/** What the applicant reads once their request is closed. */
export function joinResultMessage(status: JoinStatusName): string {
  switch (status) {
    case "approved":
      return t("membership.resultApproved");
    case "rejected":
      return t("membership.resultRejected");
    case "expired":
      return t("membership.resultExpired");
    case "cancelled":
      return t("membership.resultCancelled");
    case "full":
      return t("membership.resultFull");
    default:
      return t("membership.resultWaiting");
  }
}

/** When a display name can next change (seconds), or null if it can change now. */
export function nameChangeAllowedAt(nameChangedAt: number, nowSec: number): number | null {
  if (nameChangedAt === 0) return null;
  const at = nameChangedAt + NAME_COOLDOWN_SECONDS;
  return nowSec < at ? at : null;
}

/** What voters read once a request's result is certain but not yet recorded. */
export function settledLine(outcome: VoteOutcome, kind: RequestKind = "join"): string {
  if (kind === "claim") {
    switch (outcome) {
      case "approved":
        return t("membership.settledClaimApproved");
      case "rejected":
        return t("membership.settledClaimRejected");
      case "expired":
        return t("membership.settledExpired");
      default:
        return "";
    }
  }
  if (kind === "dormant") {
    switch (outcome) {
      case "approved":
        return t("membership.settledDormantApproved");
      case "rejected":
        return t("membership.settledDormantRejected");
      case "expired":
        return t("membership.settledExpired");
      default:
        return "";
    }
  }
  switch (outcome) {
    case "approved":
      return t("membership.settledJoinApproved");
    case "rejected":
      return t("membership.settledJoinRejected");
    case "expired":
      return t("membership.settledExpired");
    default:
      return "";
  }
}

/** Member status shown in the members table. */
export type MemberStatus = "active" | "late" | "dormant" | "invited";
export function memberStatus(m: { dormant: boolean; overdue: number }): MemberStatus {
  if (m.dormant) return "dormant";
  return m.overdue > 0 ? "late" : "active";
}

/** What the members table says about someone the circle may vote dormant. */
export function dormantHint(overdue: number, dormantAfter: number): string {
  if (overdue >= dormantAfter) {
    return tn("membership.dormantHint", overdue);
  }
  return "";
}

/** Same as CircleVault.MAX_OPEN_PER_MEMBER (ADR 0033). */
export const MAX_OPEN_PER_MEMBER = 3;

/** Inviter line on a join card: open invites and members already brought in (RT-03). */
export function inviterStats(open: number, admitted: number): string {
  const o = tn("membership.inviterOpen", open, { max: MAX_OPEN_PER_MEMBER });
  const a =
    admitted === 0 ? t("membership.inviterNone") : tn("membership.inviterAdmitted", admitted);
  return `${o} · ${a}`;
}

/** Warn when one member has brought in more than a third of the circle (RT-03). */
export function invitedTooMany(admitted: number, memberCount: number): boolean {
  return memberCount > 0 && admitted * 3 > memberCount;
}

/** Members-table note for someone voted in who can't vote yet (ADR 0033). */
export function votingRightsNote(paid: number, minPaidToVote: number): string {
  const left = Math.max(minPaidToVote - paid, 0);
  return tn("membership.votingRights", left);
}
