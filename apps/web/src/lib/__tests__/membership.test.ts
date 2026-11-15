import { describe, expect, it } from "vitest";

import {
  displayNameProblem,
  inviteLink,
  joinStatusName,
  nameChangeAllowedAt,
  nameKey,
  NAME_COOLDOWN_SECONDS,
  quorumVotes,
  tallyLine,
  voteOutcome,
  invitedTooMany,
  inviterStats,
  memberStatus,
  requestKind,
  votingRightsNote,
  settledLine,
} from "@/lib/membership";

const CIRCLE = "0x2222222222222222222222222222222222222222";
const ME = "0x1111111111111111111111111111111111111111";

describe("display names (mirror DisplayName.sol, ADR 0029)", () => {
  it("S-MEM-18 accepts game-tag style names", () => {
    for (const ok of ["NightOwl", "Comet_K", "Mango.eth", "Rahul S", "a-b", "x".repeat(24)]) {
      expect(displayNameProblem(ok), ok).toBeNull();
    }
  });

  it("S-MEM-06 rejects what the contract rejects, with a plain reason", () => {
    expect(displayNameProblem("ab")).toMatch(/at least 3/);
    expect(displayNameProblem("x".repeat(25))).toMatch(/at most 24/);
    expect(displayNameProblem(" Owl")).toMatch(/start or end/);
    expect(displayNameProblem("Owl ")).toMatch(/start or end/);
    expect(displayNameProblem("Night  Owl")).toMatch(/single spaces/);
    expect(displayNameProblem("Owl!")).toMatch(/letters, numbers/);
    expect(displayNameProblem("Owl​")).toMatch(/letters, numbers/); // zero-width space
    expect(displayNameProblem("Ünal")).toMatch(/letters, numbers/); // ASCII only
    expect(displayNameProblem("")).toBe("Pick a name.");
  });

  it("S-MEM-04 uniqueness ignores letter case", () => {
    expect(nameKey("NightOwl")).toBe(nameKey("nightowl"));
  });

  it("S-MEM-05 name changes wait out the 30-day cooldown", () => {
    expect(nameChangeAllowedAt(0, 1_000)).toBeNull(); // never set: free
    const set = 1_000_000;
    expect(nameChangeAllowedAt(set, set + 10)).toBe(set + NAME_COOLDOWN_SECONDS);
    expect(nameChangeAllowedAt(set, set + NAME_COOLDOWN_SECONDS)).toBeNull();
  });
});

describe("invite link (RT-04: no secret codes)", () => {
  it("S-WEB-35 carries only the circle and the inviter", () => {
    expect(inviteLink("https://wealthkart.pages.dev/", CIRCLE, ME)).toBe(
      `https://wealthkart.pages.dev/app/join/?id=${CIRCLE}&by=${ME}`,
    );
    expect(inviteLink("http://127.0.0.1:4310", CIRCLE)).toBe(
      `http://127.0.0.1:4310/app/join/?id=${CIRCLE}`,
    );
  });
});

describe("join vote outcome (mirrors CircleVault._outcome)", () => {
  const t = (eligible: number, yes: number, no: number, quorumPct = 50) => ({
    eligible,
    yes,
    no,
    quorumPct,
  });

  it("S-MEM-01 quorum rounds up", () => {
    expect(quorumVotes(3, 50)).toBe(2);
    expect(quorumVotes(4, 50)).toBe(2);
    expect(quorumVotes(1, 20)).toBe(1);
  });

  it("S-MEM-13 one-member circle: the creator's yes decides at once", () => {
    expect(voteOutcome(t(1, 1, 0), false)).toBe("approved");
    expect(voteOutcome(t(1, 0, 1), false)).toBe("rejected");
  });

  it("S-MEM-13 decided early only when remaining votes can't change it", () => {
    expect(voteOutcome(t(3, 1, 0), false)).toBe("open"); // 33% so far
    expect(voteOutcome(t(3, 2, 0), false)).toBe("approved"); // 66.7% of everyone
    expect(voteOutcome(t(3, 0, 2), false)).toBe("rejected");
    expect(voteOutcome(t(3, 1, 1), false)).toBe("open"); // a last yes still makes 2 of 3 (66.7%)
  });

  it("S-MEM-13 after the window: no quorum expires, otherwise 66% of votes cast", () => {
    expect(voteOutcome(t(4, 1, 0), true)).toBe("expired");
    expect(voteOutcome(t(10, 4, 1), true)).toBe("approved"); // 80% of 5 cast, quorum 5/10
    expect(voteOutcome(t(10, 3, 2), true)).toBe("rejected"); // 60%
  });

  it("S-MEM-01 tally line reads plainly", () => {
    expect(tallyLine(t(3, 1, 0))).toBe("1 of 2 votes needed · 1 yes, 0 no · needs 66% yes");
  });

  it("maps JoinStatus numbers from the contract", () => {
    expect(joinStatusName(2)).toBe("approved");
    expect(joinStatusName(4)).toBe("expired");
    expect(joinStatusName(99)).toBe("none");
  });

  describe("dormant votes (ADR 0032)", () => {
    const d = (eligible: number, yes: number, no: number) => ({
      eligible,
      yes,
      no,
      quorumPct: 50,
      kind: "dormant" as const,
    });

    it("S-RT-18 needs more than half: settles early once a majority is certain", () => {
      expect(voteOutcome(d(11, 6, 0), false)).toBe("approved"); // 6 of 11 > 50%
      expect(voteOutcome(d(11, 5, 0), false)).toBe("open");
      expect(voteOutcome(d(11, 1, 6), false)).toBe("rejected"); // at most 5 yes left
      expect(voteOutcome(d(10, 1, 5), false)).toBe("rejected"); // 5 of 10 is not more than half
    });

    it("S-RT-18 after the window: ties fail, majorities pass", () => {
      expect(voteOutcome(d(10, 3, 3), true)).toBe("rejected");
      expect(voteOutcome(d(10, 4, 2), true)).toBe("approved");
      expect(voteOutcome(d(10, 2, 0), true)).toBe("expired");
    });

    it("S-RT-18 reads plainly", () => {
      expect(tallyLine(d(11, 1, 0))).toBe(
        "1 of 6 votes needed · 1 yes, 0 no · needs more than 50% yes",
      );
      expect(settledLine("approved", "dormant")).toMatch(/payments pause/);
      expect(requestKind(1)).toBe("dormant");
      expect(requestKind(0)).toBe("join");
      expect(memberStatus({ dormant: true, overdue: 0 })).toBe("dormant");
      expect(memberStatus({ dormant: false, overdue: 2 })).toBe("late");
    });
  });

  it("S-RT-06 inviter stats and the third-of-the-circle warning", () => {
    expect(inviterStats(1, 0)).toBe("1 open invite (max 3) · hasn't brought anyone in yet");
    expect(inviterStats(2, 3)).toBe("2 open invites (max 3) · brought in 3 members so far");
    expect(invitedTooMany(4, 12)).toBe(false);
    expect(invitedTooMany(5, 12)).toBe(true);
  });

  it("S-RT-05 says how many payments a newcomer has left before voting", () => {
    expect(votingRightsNote(0, 2)).toBe("New member · can vote after 2 more payments");
    expect(votingRightsNote(1, 2)).toBe("New member · can vote after 1 more payment");
  });
});
