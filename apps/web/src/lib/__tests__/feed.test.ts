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

  it("S-WEB-60 loan events read as plain sentences and filter as Loans", () => {
    const f = toFeed([
      log("LoanRequested", {
        requestId: 1n,
        borrower: ALICE,
        guarantor: CAROL,
        amount: AVAX / 2n,
        medical: false,
        deadline: 0n,
        eligible: 2n,
      }),
      log("GuaranteeAccepted", { requestId: 1n, borrower: ALICE, guarantor: CAROL }),
      log("LoanVoted", { requestId: 1n, voter: CAROL, support: true }),
      log("LoanDisbursed", { requestId: 1n, borrower: ALICE, amount: AVAX / 2n, period: DEC_2026 }),
      log("InterestPaid", {
        borrower: ALICE,
        interest: AVAX / 200n,
        fees: AVAX / 100n,
        throughPeriod: DEC_2026,
      }),
      log("LoanRepaid", {
        borrower: ALICE,
        principal: AVAX / 4n,
        minInterest: 0n,
        remaining: AVAX / 4n,
      }),
      log("LoanDefaulted", { borrower: ALICE, guarantor: CAROL, overdueMonths: 2n }),
      log("LoanCured", { borrower: ALICE }),
      log("LoanRepaid", {
        borrower: ALICE,
        principal: AVAX / 4n,
        minInterest: AVAX / 200n,
        remaining: 0n,
      }),
      log("LoanRequested", {
        requestId: 2n,
        borrower: CAROL,
        guarantor: ZERO,
        amount: AVAX / 10n,
        medical: true,
        deadline: 0n,
        eligible: 2n,
      }),
      log("LoanRequestClosed", { requestId: 2n, kind: 0, status: 5 }),
      log("SettleProposed", {
        requestId: 3n,
        borrower: CAROL,
        proposer: ALICE,
        deadline: 0n,
        eligible: 1n,
      }),
      log("LoanVoted", { requestId: 3n, voter: ALICE, support: true }),
      log("LoanRequestClosed", { requestId: 3n, kind: 1, status: 2 }),
      log("LoanSettled", {
        borrower: CAROL,
        guarantor: ALICE,
        fromBorrower: AVAX / 10n,
        fromGuarantor: AVAX / 20n,
        writtenOff: AVAX / 100n,
      }),
    ]);
    expect(f.map((x) => x.text(names)).reverse()).toEqual([
      "Alice asked for a loan of 0.50 AVAX, with 0xCccc…0003 as guarantor.",
      "0xCccc…0003 agreed to back Alice's loan.",
      "0xCccc…0003 voted yes on Alice's loan.",
      "Alice received a loan of 0.50 AVAX.",
      "Alice paid 0.0050 AVAX of loan interest plus 0.01 AVAX in late fees.",
      "Alice repaid 0.25 AVAX of their loan. 0.25 AVAX left.",
      "Alice's loan was marked as defaulted. Alice and guarantor 0xCccc…0003 are frozen until it's paid.",
      "Alice caught up on their loan, so the default is lifted.",
      "Alice repaid their loan in full: 0.25 AVAX plus 0.0050 AVAX for the minimum month of interest.",
      "0xCccc…0003 asked for a medical loan of 0.10 AVAX.",
      "0xCccc…0003's loan request was withdrawn.",
      "Alice asked the circle to settle 0xCccc…0003's defaulted loan from their savings.",
      "Alice voted yes on settling 0xCccc…0003's loan.",
      "0xCccc…0003's defaulted loan was settled: 0.10 AVAX from their savings and 0.05 AVAX from Alice's. 0.01 AVAX couldn't be covered and is shared by everyone.",
    ]);
    expect(f.every((x) => x.kind === "loan")).toBe(true);
    expect(filterFeed(f, "loan", "", names)).toHaveLength(f.length);
    expect(filterFeed(f, "payment", "", names)).toHaveLength(0);
  });

  it("S-WEB-60 a loan that didn't go ahead says why", () => {
    const req = (id: bigint) =>
      log("LoanRequested", {
        requestId: id,
        borrower: ALICE,
        guarantor: ZERO,
        amount: AVAX,
        medical: false,
        deadline: 0n,
        eligible: 2n,
      });
    const f = toFeed([
      req(1n),
      log("LoanRequestClosed", { requestId: 1n, kind: 0, status: 3 }),
      req(2n),
      log("LoanRequestClosed", { requestId: 2n, kind: 0, status: 4 }),
      req(3n),
      log("LoanRequestClosed", { requestId: 3n, kind: 0, status: 6 }),
      log("LoanRequestClosed", { requestId: 9n, kind: 0, status: 2 }),
    ]);
    const lines = f.map((x) => x.text(names));
    expect(lines).toContain("Alice's loan request didn't pass.");
    expect(lines).toContain("Alice's loan request ran out of time before enough members voted.");
    expect(lines.some((l) => /passed but couldn't be paid out/.test(l))).toBe(true);
    // An approved close is told by LoanDisbursed instead.
    expect(f).toHaveLength(6);
  });
});
