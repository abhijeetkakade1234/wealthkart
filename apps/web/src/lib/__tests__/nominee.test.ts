import { describe, expect, it } from "vitest";

import { requestKind, settledLine, tallyLine, voteOutcome } from "@/lib/membership";
import {
  claimNoticeDays,
  claimPhase,
  exitsToProcess,
  isSet,
  MIN_CLAIM_NOTICE_DAYS,
  nomineeProblem,
} from "@/lib/nominee";

const ME = "0x1111111111111111111111111111111111111111";
const CIRCLE = "0x2222222222222222222222222222222222222222";
const HEIR = "0x3333333333333333333333333333333333333333";
const ZERO = "0x0000000000000000000000000000000000000000";

describe("backup wallet address (mirrors Exits.setNominee, ADR 0056)", () => {
  it("S-NOM-01 accepts another wallet, in any letter case", () => {
    expect(nomineeProblem(HEIR, ME, CIRCLE)).toBeNull();
    expect(nomineeProblem(`  ${HEIR}  `, ME, CIRCLE)).toBeNull();
    expect(nomineeProblem("0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", ME, CIRCLE)).toBeNull();
  });

  it("S-NOM-01 refuses blanks, junk, zero, your own wallet and the circle", () => {
    expect(nomineeProblem("", ME, CIRCLE)).toMatch(/Paste/);
    expect(nomineeProblem("0x123", ME, CIRCLE)).toMatch(/isn't a wallet address/);
    expect(nomineeProblem("vitalik.eth", ME, CIRCLE)).toMatch(/isn't a wallet address/);
    expect(nomineeProblem(ZERO, ME, CIRCLE)).toMatch(/can't receive/);
    expect(nomineeProblem(ME.toUpperCase().replace("0X", "0x"), ME, CIRCLE)).toMatch(/your own/);
    expect(nomineeProblem(CIRCLE, ME, CIRCLE)).toMatch(/circle's own/);
  });
});

describe("claim timing and phases", () => {
  it("S-NOM-08 claim notice is the exit notice, never under 30 days", () => {
    expect(MIN_CLAIM_NOTICE_DAYS).toBe(30);
    expect(claimNoticeDays(0)).toBe(30);
    expect(claimNoticeDays(14)).toBe(30);
    expect(claimNoticeDays(60)).toBe(60);
  });

  it("S-NOM-08 phases follow the chain state", () => {
    const now = 1_800_000_000;
    expect(claimPhase({ requestId: 0n, payTo: ZERO, maturesAt: 0 }, now)).toBe("none");
    expect(claimPhase({ requestId: 4n, payTo: ZERO, maturesAt: 0 }, now)).toBe("voting");
    expect(claimPhase({ requestId: 0n, payTo: HEIR, maturesAt: now + 1 }, now)).toBe("notice");
    expect(claimPhase({ requestId: 0n, payTo: HEIR, maturesAt: now }, now)).toBe("ready");
    expect(isSet(HEIR)).toBe(true);
    expect(isSet(ZERO)).toBe(false);
    expect(isSet(undefined)).toBe(false);
  });

  it("S-NOM-11 processes the queue up to the member's place", () => {
    expect(exitsToProcess([HEIR, ME, CIRCLE], ME.toUpperCase().replace("0X", "0x"))).toBe(2);
    expect(exitsToProcess([HEIR], ME)).toBe(1);
  });
});

describe("claim votes (mirror Membership._passes for Kind.Claim)", () => {
  const c = (eligible: number, yes: number, no: number) => ({
    eligible,
    yes,
    no,
    quorumPct: 50,
    kind: "claim" as const,
  });

  it("S-NOM-07 needs 66% of votes cast, like a join", () => {
    expect(requestKind(2)).toBe("claim");
    expect(voteOutcome(c(11, 8, 0), false)).toBe("approved");
    expect(voteOutcome(c(11, 7, 0), false)).toBe("open");
    expect(voteOutcome(c(11, 5, 3), true)).toBe("rejected"); // 62.5%: would pass a dormant vote
    expect(voteOutcome(c(11, 6, 3), true)).toBe("approved");
    expect(voteOutcome(c(11, 2, 0), true)).toBe("expired");
    expect(tallyLine(c(11, 1, 0))).toBe("1 of 6 votes needed · 1 yes, 0 no · needs 66% yes");
    expect(settledLine("approved", "claim")).toMatch(/backup wallet/);
    expect(settledLine("rejected", "claim")).toMatch(/nothing is paid/);
  });
});
