/**
 * Pure membership helpers that mirror CircleVault (ADR 0028) and DisplayName.sol (ADR 0029),
 * so the UI can explain a vote or a name before anything is sent.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 24;
/** Same as CircleVault.NAME_COOLDOWN. */
export const NAME_COOLDOWN_SECONDS = 30 * 86_400;
/** Same as CircleVault.ADMISSION_PASS_PCT. */
export const ADMISSION_PASS_PCT = 66;

const ALLOWED = /^[A-Za-z0-9 _.-]+$/;

/**
 * Plain-language problem with a display name, or null if the contract would accept it.
 * Mirrors DisplayName.isValid: 3–24 ASCII letters, digits, space, `_ . -`; no space at
 * either end; no double spaces.
 */
export function displayNameProblem(name: string): string | null {
  if (name.length === 0) return "Pick a name.";
  if (!ALLOWED.test(name)) {
    return "Use only letters, numbers, spaces, dots, dashes and underscores.";
  }
  // ALLOWED is ASCII-only, so string length equals byte length here.
  if (name.length < NAME_MIN) return `Use at least ${NAME_MIN} characters.`;
  if (name.length > NAME_MAX) return `Use at most ${NAME_MAX} characters.`;
  if (name.startsWith(" ") || name.endsWith(" ")) return "Remove the space at the start or end.";
  if (name.includes("  ")) return "Use single spaces between words.";
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
}

/** Votes needed for quorum (rounded up, like the contract's `cast * 100 >= pct * e`). */
export function quorumVotes(eligible: number, quorumPct: number): number {
  return Math.ceil((quorumPct * eligible) / 100);
}

/**
 * Same decision as CircleVault._outcome. "open" means not decided yet. Before the window
 * ends a request is decided only when the remaining votes can't change the result.
 */
export function voteOutcome(t: Tally, ended: boolean): VoteOutcome {
  const { eligible: e, yes, no, quorumPct } = t;
  const cast = yes + no;
  const quorum = cast * 100 >= quorumPct * e;
  if (quorum && yes * 100 >= ADMISSION_PASS_PCT * e) return "approved";
  if ((e - no) * 100 < ADMISSION_PASS_PCT * e) return "rejected";
  if (!ended) return "open";
  if (!quorum) return "expired";
  return yes * 100 >= ADMISSION_PASS_PCT * cast ? "approved" : "rejected";
}

/** One line voters can read: "2 of 3 votes needed · 2 yes, 0 no · needs 66% yes". */
export function tallyLine(t: Tally): string {
  const need = quorumVotes(t.eligible, t.quorumPct);
  const cast = t.yes + t.no;
  return `${cast} of ${need} ${need === 1 ? "vote" : "votes"} needed · ${t.yes} yes, ${t.no} no · needs ${ADMISSION_PASS_PCT}% yes`;
}

/** JoinStatus enum order in CircleVault. */
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
      return "You're in. The members voted you into the circle.";
    case "rejected":
      return "The members didn't vote you in this time.";
    case "expired":
      return "Voting time ran out before enough members voted. You can ask again.";
    case "cancelled":
      return "You cancelled your request.";
    case "full":
      return "The vote passed, but the circle filled up first.";
    default:
      return "Your request is waiting for votes.";
  }
}

/** When a display name can next change (seconds), or null if it can change now. */
export function nameChangeAllowedAt(nameChangedAt: number, nowSec: number): number | null {
  if (nameChangedAt === 0) return null;
  const at = nameChangedAt + NAME_COOLDOWN_SECONDS;
  return nowSec < at ? at : null;
}

/** What voters read once a request's result is certain but not yet recorded. */
export function settledLine(outcome: VoteOutcome): string {
  switch (outcome) {
    case "approved":
      return "Enough members voted yes, so they get in. Anyone can record the result.";
    case "rejected":
      return "There aren't enough yes votes for them to get in. Anyone can record the result.";
    case "expired":
      return "Voting time ran out before enough members voted. Anyone can record the result.";
    default:
      return "";
  }
}
