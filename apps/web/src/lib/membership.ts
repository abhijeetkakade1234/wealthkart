/**
 * Pure membership helpers that mirror CircleVault (ADR 0028) and DisplayName.sol (ADR 0029),
 * so the UI can explain a vote or a name before anything is sent.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 24;
/** Same as CircleVault.NAME_COOLDOWN. */
export const NAME_COOLDOWN_SECONDS = 30 * 86_400;
/** Same as CircleVault.ADMISSION_PASS_PCT: join passes with at least 66% yes of votes cast. */
export const ADMISSION_PASS_PCT = 66;
/** Same as CircleVault.DORMANT_PASS_PCT: dormant passes with more than 50% yes (ADR 0032). */
export const DORMANT_PASS_PCT = 50;

/** Membership.Kind order. */
export type RequestKind = "join" | "dormant";
export function requestKind(kind: number): RequestKind {
  return kind === 1 ? "dormant" : "join";
}

/** Same rule as Membership._passes. */
function passes(kind: RequestKind, yes: number, total: number): boolean {
  return kind === "join"
    ? yes * 100 >= ADMISSION_PASS_PCT * total
    : yes * 100 > DORMANT_PASS_PCT * total;
}

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
  /** Join (66% yes) or dormant (more than 50% yes). Defaults to join. */
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
export function tallyLine(t: Tally): string {
  const need = quorumVotes(t.eligible, t.quorumPct);
  const cast = t.yes + t.no;
  const mark =
    (t.kind ?? "join") === "join"
      ? `needs ${ADMISSION_PASS_PCT}% yes`
      : `needs more than ${DORMANT_PASS_PCT}% yes`;
  return `${cast} of ${need} ${need === 1 ? "vote" : "votes"} needed · ${t.yes} yes, ${t.no} no · ${mark}`;
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
export function settledLine(outcome: VoteOutcome, kind: RequestKind = "join"): string {
  if (kind === "dormant") {
    switch (outcome) {
      case "approved":
        return "Enough members voted yes, so their payments pause. Anyone can record the result.";
      case "rejected":
        return "There aren't enough yes votes to pause their payments. Anyone can record the result.";
      case "expired":
        return "Voting time ran out before enough members voted. Anyone can record the result.";
      default:
        return "";
    }
  }
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

/** Member status shown in the members table. */
export type MemberStatus = "active" | "late" | "dormant" | "invited";
export function memberStatus(m: { dormant: boolean; overdue: number }): MemberStatus {
  if (m.dormant) return "dormant";
  return m.overdue > 0 ? "late" : "active";
}

/** What the members table says about someone the circle may vote dormant. */
export function dormantHint(overdue: number, dormantAfter: number): string {
  if (overdue >= dormantAfter) {
    return `Missed ${overdue} ${overdue === 1 ? "month" : "months"}. The circle can vote to pause their payments.`;
  }
  return "";
}

/** Same as CircleVault.MAX_OPEN_PER_MEMBER (ADR 0033). */
export const MAX_OPEN_PER_MEMBER = 3;

/** Inviter line on a join card: open invites and members already brought in (RT-03). */
export function inviterStats(open: number, admitted: number): string {
  const o = `${open} open ${open === 1 ? "invite" : "invites"} (max ${MAX_OPEN_PER_MEMBER})`;
  const a =
    admitted === 0
      ? "hasn't brought anyone in yet"
      : `brought in ${admitted} ${admitted === 1 ? "member" : "members"} so far`;
  return `${o} · ${a}`;
}

/** Warn when one member has brought in more than a third of the circle (RT-03). */
export function invitedTooMany(admitted: number, memberCount: number): boolean {
  return memberCount > 0 && admitted * 3 > memberCount;
}

/** Members-table note for someone voted in who can't vote yet (ADR 0033). */
export function votingRightsNote(paid: number, minPaidToVote: number): string {
  const left = Math.max(minPaidToVote - paid, 0);
  return `New member · can vote after ${left} more ${left === 1 ? "payment" : "payments"}`;
}
