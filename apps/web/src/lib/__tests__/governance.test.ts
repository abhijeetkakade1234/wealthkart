import { describe, expect, it } from "vitest";

import {
  exitPhase,
  isAhead,
  noticeText,
  passesMark,
  proposalKind,
  proposalOutcome,
  proposalSettledLine,
  proposalTallyLine,
  proposalTitle,
  reasonLabel,
  waiverMonths,
} from "@/lib/governance";

describe("proposal kinds and reasons (mirror Governance.Kind / Reason, ADR 0040)", () => {
  it("S-WEB-41 maps enum numbers to kinds and plain titles", () => {
    expect([0, 1, 2, 3].map(proposalKind)).toEqual([
      "rule-change",
      "fee-waiver",
      "dissolve",
      "guardian-off",
    ]);
    expect(proposalTitle("dissolve")).toBe("Close the circle");
    expect(proposalTitle("guardian-off")).toBe("Switch off the guardian");
  });

  it("S-WEB-41 waiver reasons are a fixed list with plain labels", () => {
    expect(reasonLabel(0)).toBe("Medical");
    expect(reasonLabel(2)).toBe("Bank problem");
    expect(reasonLabel(9)).toBe("Something else");
  });
});

describe("proposal outcome (mirror Governance._outcome and Rules.passes)", () => {
  const t = (yes: number, no: number, passPct = 50, eligible = 3, quorumPct = 50) => ({
    eligible,
    yes,
    no,
    passPct,
    quorumPct,
  });

  it("S-WEB-42 50% means strictly more than half; other marks are at least", () => {
    expect(passesMark(1, 2, 50)).toBe(false);
    expect(passesMark(2, 3, 50)).toBe(true);
    expect(passesMark(2, 3, 66)).toBe(true);
    expect(passesMark(2, 3, 67)).toBe(false);
    expect(passesMark(0, 0, 50)).toBe(false);
  });

  it("S-WEB-42 decides early once the remaining votes can't change it", () => {
    expect(proposalOutcome(t(1, 0), false)).toBe("open");
    expect(proposalOutcome(t(2, 0), false)).toBe("approved");
    expect(proposalOutcome(t(0, 2), false)).toBe("rejected");
    // Dissolve at 66%: 2 of 3 yes is enough (200 >= 198).
    expect(proposalOutcome(t(2, 0, 66), false)).toBe("approved");
  });

  it("S-WEB-42 after the window: no quorum expires, else the pass mark of votes cast", () => {
    expect(proposalOutcome(t(0, 0, 50, 4), true)).toBe("expired");
    expect(proposalOutcome(t(1, 1, 50, 4), true)).toBe("rejected");
    expect(proposalOutcome(t(2, 1, 50, 5), true)).toBe("approved");
  });

  it("S-WEB-42 waiver with two voters needs both (Alice's yes alone isn't more than half)", () => {
    expect(proposalOutcome(t(1, 0, 50, 2), false)).toBe("open");
    expect(proposalOutcome(t(2, 0, 50, 2), false)).toBe("approved");
  });

  it("S-WEB-42 tally line and settled line in plain words", () => {
    expect(proposalTallyLine(t(1, 0))).toBe(
      "1 of 2 votes needed · 1 yes, 0 no · needs more than half yes",
    );
    expect(proposalTallyLine(t(1, 0, 66))).toContain("needs 66% yes");
    expect(proposalSettledLine("approved")).toMatch(/Anyone can record/);
    expect(proposalSettledLine("open")).toBe("");
  });
});

describe("exits (mirror Exits, ADR 0039)", () => {
  const entry = (maturesAt: number, waiting = false) => ({
    requestedAt: 0,
    maturesAt,
    slot: 1,
    feeBps: 0,
    waiting,
  });

  it("S-WEB-43 phase: none, notice, ready, waiting", () => {
    expect(exitPhase(null, 100)).toBe("none");
    expect(exitPhase({ ...entry(0), slot: 0 }, 100)).toBe("none");
    expect(exitPhase(entry(200), 100)).toBe("notice");
    expect(exitPhase(entry(100), 100)).toBe("ready");
    expect(exitPhase(entry(50, true), 100, 1)).toBe("waiting");
    // Someone else is waiting first: this exit waits too.
    expect(exitPhase(entry(50), 100, 1)).toBe("waiting");
  });

  it("S-WEB-43 notice text and future checks", () => {
    expect(noticeText(0)).toBe("no notice");
    expect(noticeText(1)).toBe("1 day");
    expect(noticeText(30)).toBe("30 days");
    expect(isAhead(101, 100)).toBe(true);
    expect(isAhead(100, 100)).toBe(false);
  });

  it("S-WEB-44 waiver months: started and unpaid, newest first, at most 12", () => {
    expect(waiverMonths(100, 102)).toEqual([102, 101, 100]);
    expect(waiverMonths(103, 102)).toEqual([]);
    expect(waiverMonths(0, 50)).toHaveLength(12);
  });
});
