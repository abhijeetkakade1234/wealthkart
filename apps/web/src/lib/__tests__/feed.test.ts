import { describe, expect, it } from "vitest";

import type { DecodedLog } from "@/lib/events";
import { filterFeed, toFeed } from "@/lib/feed";

const ALICE = "0xAaaa000000000000000000000000000000000001";
const CAROL = "0xCccc000000000000000000000000000000000003";
const ZERO = "0x0000000000000000000000000000000000000000";
const AVAX = 10n ** 18n;
const DEC_2026 = 24323n;

let n = 0;
const log = (eventName: string, args: Record<string, unknown>): DecodedLog => {
  n += 1;
  return {
    eventName,
    args,
    blockNumber: BigInt(n),
    logIndex: 0,
    transactionHash: `0xtx${n}` as `0x${string}`,
  };
};

const logs: DecodedLog[] = [
  log("MemberAdded", { member: ALICE, joinPeriod: DEC_2026 }),
  log("Contributed", {
    member: ALICE,
    period: DEC_2026,
    installment: AVAX / 2n,
    lateFees: 0n,
    sharesMinted: 1n,
  }),
  log("JoinRequested", {
    requestId: 1n,
    applicant: CAROL,
    invitedBy: ALICE,
    displayName: "Carol_C",
    deadline: 0n,
    eligible: 1n,
  }),
  log("Voted", { requestId: 1n, voter: ALICE, support: true }),
  log("RequestClosed", { requestId: 1n, kind: 0, status: 2 }),
  log("Contributed", {
    member: CAROL,
    period: DEC_2026 + 1n,
    installment: AVAX / 2n,
    lateFees: AVAX / 100n,
    sharesMinted: 1n,
  }),
  log("SomethingElse", {}),
];
const names = (a: string) => (a.toLowerCase() === ALICE.toLowerCase() ? "Alice" : "0xCccc…0003");

describe("activity feed (D7)", () => {
  const feed = toFeed(logs);

  it("S-ACT-05 turns every known event into a plain sentence, newest first", () => {
    expect(feed.map((f) => f.text(names))).toEqual([
      "0xCccc…0003 paid January 2027: 0.50 AVAX plus 0.01 AVAX in late fees.",
      "Vote closed: Carol_C is in.",
      "Alice voted yes on letting Carol_C join.",
      "Carol_C asked to join, invited by Alice.",
      "Alice paid December 2026: 0.50 AVAX, on time.",
      "Alice joined the circle.",
    ]);
    expect(feed[0]!.tx).toBe("0xtx6");
  });

  it("S-ACT-05 filters by type and searches names, addresses and transactions", () => {
    expect(filterFeed(feed, "payment", "", names)).toHaveLength(2);
    expect(filterFeed(feed, "vote", "", names)).toHaveLength(3);
    expect(filterFeed(feed, "all", "alice", names)).toHaveLength(4);
    expect(filterFeed(feed, "all", "0xtx4", names)).toHaveLength(1);
    expect(filterFeed(feed, "member", "nobody", names)).toHaveLength(0);
  });

  it("S-ACT-05 a join with no inviter and a dormant vote read plainly", () => {
    const f = toFeed([
      log("JoinRequested", {
        requestId: 2n,
        applicant: CAROL,
        invitedBy: ZERO,
        displayName: "",
        deadline: 0n,
        eligible: 1n,
      }),
      log("DormantProposed", {
        requestId: 3n,
        member: CAROL,
        proposer: ALICE,
        periodsOverdue: 3n,
        deadline: 0n,
        eligible: 1n,
      }),
      log("RequestClosed", { requestId: 3n, kind: 1, status: 2 }),
    ]);
    expect(f.map((x) => x.text(names))).toEqual([
      "Vote closed: 0xCccc…0003's payments are paused.",
      "Alice asked the circle to pause 0xCccc…0003's payments (marked dormant).",
      "0xCccc…0003 asked to join.",
    ]);
  });
});
