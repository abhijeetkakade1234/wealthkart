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
});
