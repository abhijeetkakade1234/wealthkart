/**
 * Pure helpers that mirror the Governance (ADR 0040) and Exits (ADR 0039) libraries, so the
 * UI can explain a proposal, a vote or a pending exit before anything is sent.
 */

/** Governance.Kind order. */
export const PROPOSAL_KINDS = ["rule-change", "fee-waiver", "dissolve", "guardian-off"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export function proposalKind(kind: number): ProposalKind {
  return PROPOSAL_KINDS[kind] ?? "rule-change";
}

/** Short title shown on a proposal card. */
export function proposalTitle(kind: ProposalKind): string {
  switch (kind) {
    case "rule-change":
      return "Change the rules";
    case "fee-waiver":
      return "Waive late fees";
    case "dissolve":
      return "Close the circle";
    case "guardian-off":
      return "Switch off the guardian";
  }
}

/** Governance.Reason order. A fixed list, never free text (PLAN.md D5). */
export const WAIVER_REASONS = [
  { value: 0, label: "Medical" },
  { value: 1, label: "Bereavement" },
  { value: 2, label: "Bank problem" },
  { value: 3, label: "Something else" },
] as const;

export function reasonLabel(reason: number): string {
  return WAIVER_REASONS.find((r) => r.value === reason)?.label ?? "Something else";
}

export type ProposalOutcome = "open" | "approved" | "rejected" | "expired";

export interface ProposalTally {
  /** Voters possible when the proposal opened (quorum base). */
  eligible: number;
  yes: number;
  no: number;
  /** Pass mark copied into the proposal, percent of votes cast. */
  passPct: number;
  /** Circle quorum, percent of `eligible`. */
  quorumPct: number;
}

/** Same as Rules.passes: strictly more than half at 50, otherwise at least `pct`. */
export function passesMark(yes: number, total: number, pct: number): boolean {
  if (total === 0) return false;
  return pct === 50 ? yes * 100 > 50 * total : yes * 100 >= pct * total;
}

/** Same decision as Governance._outcome. */
export function proposalOutcome(t: ProposalTally, ended: boolean): ProposalOutcome {
  const { eligible: e, yes, no, passPct: pct, quorumPct } = t;
  const quorum = (yes + no) * 100 >= quorumPct * e;
  if (quorum && passesMark(yes, e, pct)) return "approved";
  if (!passesMark(e - no, e, pct)) return "rejected";
  if (!ended) return "open";
  if (!quorum) return "expired";
  return passesMark(yes, yes + no, pct) ? "approved" : "rejected";
}

/** "1 of 2 votes needed · 1 yes, 0 no · needs more than half yes" */
export function proposalTallyLine(t: ProposalTally): string {
  const need = Math.ceil((t.quorumPct * t.eligible) / 100);
  const cast = t.yes + t.no;
  const mark = t.passPct === 50 ? "needs more than half yes" : `needs ${t.passPct}% yes`;
  return `${cast} of ${need} ${need === 1 ? "vote" : "votes"} needed · ${t.yes} yes, ${t.no} no · ${mark}`;
}

/** What voters read once a proposal's result is certain but not yet recorded. */
export function proposalSettledLine(outcome: ProposalOutcome): string {
  switch (outcome) {
    case "approved":
      return "Enough members voted yes. Anyone can record the result.";
    case "rejected":
      return "There aren't enough yes votes for this to pass. Anyone can record the result.";
    case "expired":
      return "Voting time ran out before enough members voted. Anyone can record the result.";
    default:
      return "";
  }
}

// ------------------------------------------------------------------ exits

export interface ExitEntry {
  requestedAt: number;
  maturesAt: number;
  /** Queue index + 1; 0 = no exit pending. */
  slot: number;
  feeBps: number;
  waiting: boolean;
}

export type ExitPhase = "none" | "notice" | "ready" | "waiting";

/**
 * Where a member's exit stands: none, still in its notice, ready to collect, or waiting for
 * cash (marked by the contract, or ready while other exits wait first).
 */
export function exitPhase(e: ExitEntry | null, now: number, exitsWaiting = 0): ExitPhase {
  if (!e || e.slot === 0) return "none";
  if (now < e.maturesAt) return "notice";
  if (e.waiting || exitsWaiting > (e.waiting ? 1 : 0)) return "waiting";
  return "ready";
}

/** True while a timestamp (seconds) is still ahead of chain time. */
export function isAhead(until: number, now: number): boolean {
  return until > now;
}

/** Notice in plain words: "30 days", "no notice". */
export function noticeText(days: number): string {
  if (days === 0) return "no notice";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Guardian pause limits (Exits.PAUSE_LENGTH, Exits.PAUSE_COOLDOWN). */
export const PAUSE_DAYS = 14;
export const PAUSE_COOLDOWN_DAYS = 90;

/**
 * Months a fee waiver can name for a member: started and unpaid, so from their first unpaid
 * period up to the current one (Governance._waiverVoters). Newest first, at most 12.
 */
export function waiverMonths(nextPeriod: number, currentPeriod: number): number[] {
  const out: number[] = [];
  for (let p = currentPeriod; p >= nextPeriod && out.length < 12; p--) out.push(p);
  return out;
}
