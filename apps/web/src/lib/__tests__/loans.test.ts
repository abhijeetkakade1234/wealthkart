import { describe, expect, it } from "vitest";

import type { DecodedLog } from "@/lib/events";
import {
  askBlocker,
  avax,
  ceilBps,
  cureText,
  filterLoans,
  isDefaultable,
  loanFromChain,
  loanLimits,
  loanPreview,
  loanSettledLine,
  loanTies,
  loansFromLogs,
  type LoanState,
  moneySplit,
  outstandingByMember,
  parseAvaxInput,
  pickParam,
  LOAN_FILTERS,
  rateIn,
  repayProblem,
  requestKindOf,
  requestStatus,
  shareText,
  sortLoans,
  tenorTimeline,
} from "@/lib/loans";
import { defaultRules } from "@/lib/rules";

const AVAX = 10n ** 18n;
const ALICE = "0xAaaa000000000000000000000000000000000001";
const BOB = "0xBbbb000000000000000000000000000000000002";
const CAROL = "0xCccc000000000000000000000000000000000003";
const ZERO = "0x0000000000000000000000000000000000000000";
const P = 24323; // December 2026

const rules = defaultRules(AVAX / 2n);

const loan = (over: Partial<LoanState> = {}): LoanState => ({
  guarantor: ZERO,
  disbursedPeriod: P,
  paidThrough: P,
  principal: AVAX / 2n,
  amount: AVAX / 2n,
  carried: 0n,
  rate1: 100,
  rate2: 150,
  rate3: 200,
  tenorMonths: 6,
  freeMonths: 3,
  medical: false,
  defaulted: false,
  charged: false,
  defaultAfter: 2,
  defaultPeriod: 0,
  interestFee: AVAX / 100n,
  ...over,
});

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

describe("loan limits (LoanBook._limit)", () => {
  it("S-WEB-50 takes the lowest of the fund cap, k x stakes and lendable cash, and explains each", () => {
    // Circle of three paying 0.5 each: 1.5 AVAX, reserve 20% -> 1.2 lendable.
    const base = {
      totalAssets: (3n * AVAX) / 2n,
      myStake: AVAX / 2n,
      guarantorStake: 0n,
      lendable: (6n * AVAX) / 5n,
      rules,
      medical: false,
    };
    const l = loanLimits(base);
    expect(l.lines.map((x) => x.key)).toEqual(["fund", "stake", "cash"]);
    expect(l.lines[0]!.cap).toBe((6n * AVAX) / 10n); // 40% of 1.5
    expect(l.lines[1]!.cap).toBe(AVAX); // 2 x 0.5
    expect(l.limit).toBe((6n * AVAX) / 10n);
    expect(l.binding).toBe("fund");
    expect(l.lines[0]!.explain).toContain("40%");
    expect(l.lines[2]!.explain).toContain("20%");

    // A guarantor's stake raises the k cap; cash becomes the bottleneck when it's low.
    const g = loanLimits({ ...base, guarantorStake: AVAX / 2n, lendable: AVAX / 10n });
    expect(g.lines[1]!.cap).toBe(2n * AVAX);
    expect(g.lines[1]!.explain).toContain("guarantor");
    expect(g.limit).toBe(AVAX / 10n);
    expect(g.binding).toBe("cash");
  });

  it("S-WEB-50 adds the medical cap only for medical loans", () => {
    const l = loanLimits({
      totalAssets: 10n * AVAX,
      myStake: 5n * AVAX,
      guarantorStake: 0n,
      lendable: 8n * AVAX,
      rules: { ...rules, medicalCap: AVAX / 4n },
      medical: true,
    });
    expect(l.lines.map((x) => x.key)).toContain("medical");
    expect(l.limit).toBe(AVAX / 4n);
    expect(l.binding).toBe("medical");
  });

  it("S-WEB-51 parses typed AVAX amounts exactly and refuses anything else", () => {
    expect(parseAvaxInput("0.5")).toBe(AVAX / 2n);
    expect(parseAvaxInput(" 1 ")).toBe(AVAX);
    expect(parseAvaxInput("0.000000000000000001")).toBe(1n);
    for (const bad of ["", "0", "0.0", "-1", "1,5", "abc", "1e3", "0.0000000000000000001"]) {
      expect(parseAvaxInput(bad)).toBeNull();
    }
  });
});

describe("interest preview and tenors (rule 15, 17, 18)", () => {
  it("S-WEB-52 previews each tenor's monthly interest with the rules engine, rounded up", () => {
    const p = loanPreview(AVAX / 2n, rules, false, P);
    expect(p.firstCharged).toBe(P + 1);
    expect(p.tenors.map((t) => [t.from, t.to, t.rateBps])).toEqual([
      [P + 1, P + 6, 100],
      [P + 7, P + 12, 150],
      [P + 13, P + 18, 200],
    ]);
    expect(p.tenors.map((t) => t.monthly)).toEqual([
      ceilBps(AVAX / 2n, 100),
      ceilBps(AVAX / 2n, 150),
      ceilBps(AVAX / 2n, 200),
    ]);
    expect(p.repayBy).toBe(P + 18);
    expect(p.minimum).toBe(ceilBps(AVAX / 2n, 100));
    expect(ceilBps(3n, 100)).toBe(1n); // rounds up like the contract
  });

  it("S-WEB-52 medical loans start later and owe no rule-17 minimum", () => {
    const p = loanPreview(AVAX, { ...rules, medicalFreeMonths: 3 }, true, P);
    expect(p.firstCharged).toBe(P + 3);
    expect(p.freeMonths).toBe(3);
    expect(p.minimum).toBe(0n);
  });

  it("S-WEB-53 tenor timeline marks the current term and the due month", () => {
    const l = loan();
    expect(tenorTimeline(l, P).steps.map((s) => s.state)).toEqual(["now", "next", "next"]);
    expect(tenorTimeline(l, P + 7).steps.map((s) => s.state)).toEqual(["past", "now", "next"]);
    const late = tenorTimeline(l, P + 19);
    expect(late.overdue).toBe(true);
    expect(late.lastMonth).toBe(P + 18);
    expect(late.steps.every((s) => s.state === "past")).toBe(true);
  });

  it("S-WEB-53 rate charged mirrors LoanBook._span (payout month free, medical free months)", () => {
    const l = loan();
    expect(rateIn(l, P)).toBe(0);
    expect(rateIn(l, P + 1)).toBe(100);
    expect(rateIn(l, P + 6)).toBe(100);
    expect(rateIn(l, P + 7)).toBe(150);
    expect(rateIn(l, P + 30)).toBe(200);
    const m = loan({ medical: true, freeMonths: 3 });
    expect(rateIn(m, P + 2)).toBe(0);
    expect(rateIn(m, P + 3)).toBe(100);
  });
});

describe("defaults", () => {
  it("S-WEB-54 a loan is defaultable after defaultAfter late months or past the third tenor", () => {
    const l = loan();
    expect(isDefaultable(l, 1, 2, P + 2)).toBe(false);
    expect(isDefaultable(l, 2, 2, P + 2)).toBe(true);
    expect(isDefaultable(l, 0, 2, P + 19)).toBe(true);
    expect(isDefaultable({ ...l, defaulted: true }, 5, 2, P + 3)).toBe(false);
    expect(isDefaultable({ ...l, principal: 0n }, 5, 2, P + 3)).toBe(false);
    // The loan's own defaultAfter (fixed at payout, ADR 0043) wins over today's rule.
    expect(isDefaultable({ ...l, defaultAfter: 3 }, 2, 2, P + 3)).toBe(false);
    expect(isDefaultable({ ...l, defaultAfter: 1 }, 1, 2, P + 3)).toBe(true);
    expect(isDefaultable({ ...l, defaultAfter: 0 }, 2, 2, P + 3)).toBe(true);
  });

  it("S-WEB-54 the cure text says what to pay in plain words", () => {
    expect(cureText(loan(), AVAX / 100n, P + 3)).toMatch(/Pay the 0\.01 AVAX .* freeze lifts/);
    expect(cureText(loan(), 0n, P + 20)).toMatch(/whole loan is due\. Repay it in full/);
  });

  it("S-WEB-55 repay form refuses what the contract refuses", () => {
    const pr = AVAX / 2n;
    expect(repayProblem("part", AVAX / 4n, pr, 0n, 1)).toMatch(/overdue interest first/);
    expect(repayProblem("full", null, pr, 5n, 0)).toMatch(/interest .* first/);
    expect(repayProblem("full", null, pr, 0n, 0)).toBeNull();
    expect(repayProblem("part", null, pr, 0n, 0)).toMatch(/Type an amount/);
    expect(repayProblem("part", pr, pr, 0n, 0)).toMatch(/Repay in full instead/);
    expect(repayProblem("part", AVAX / 4n, pr, 5n, 0)).toBeNull();
  });

  it("S-WEB-56 asking is refused with the first reason that applies", () => {
    const ok = {
      voter: true,
      frozen: false,
      dormant: false,
      hasLoan: false,
      hasRequest: false,
      memberCount: 3,
      minMembersForLoans: 3,
      paused: false,
      dissolved: false,
    };
    expect(askBlocker(ok)).toBeNull();
    expect(askBlocker({ ...ok, frozen: true })).toMatch(/frozen/);
    expect(askBlocker({ ...ok, hasLoan: true })).toMatch(/already have a loan/);
    expect(askBlocker({ ...ok, hasRequest: true })).toMatch(/already asked/);
    expect(askBlocker({ ...ok, memberCount: 2 })).toMatch(/3 members\. It has 2/);
    expect(askBlocker({ ...ok, paused: true })).toMatch(/paused/);
    expect(askBlocker({ ...ok, dissolved: true, frozen: true })).toMatch(/voted to close/);
    expect(askBlocker({ ...ok, voter: false })).toMatch(/once you can vote/);
    expect(askBlocker({ ...ok, exiting: true })).toMatch(/asked to leave/);
    expect(askBlocker({ ...ok, guaranteeing: true })).toMatch(/backing someone else's loan/);
  });
});

describe("chain values", () => {
  it("S-WEB-57 reads viem's loanOf struct and the request enums", () => {
    expect(loanFromChain({ principal: 0n })).toBeNull();
    expect(loanFromChain(undefined)).toBeNull();
    const l = loanFromChain({
      guarantor: BOB,
      disbursedPeriod: P,
      paidThrough: P,
      bookedThrough: P,
      principal: 5n,
      amount: 7n,
      carried: 0n,
      rate1: 100,
      rate2: 150,
      rate3: 200,
      tenorMonths: 6,
      freeMonths: 3,
      medical: false,
      defaulted: true,
      charged: false,
    })!;
    expect(l.principal).toBe(5n);
    expect(l.amount).toBe(7n);
    expect(l.defaulted).toBe(true);
    expect(l.defaultAfter).toBe(0);
    expect(
      loanFromChain({ principal: 1n, defaultAfter: 3, defaultPeriod: P + 2, interestFee: 9n })!,
    ).toMatchObject({ defaultAfter: 3, defaultPeriod: P + 2, interestFee: 9n });
    expect(requestStatus(2)).toBe("approved");
    expect(requestStatus(6)).toBe("failed");
    expect(requestStatus(99)).toBe("none");
    expect(requestKindOf(1)).toBe("settle");
    expect(requestKindOf(0)).toBe("loan");
    expect(avax(AVAX / 200n)).toBe("0.0050");
    expect(avax(AVAX / 2n)).toBe("0.50");
  });

  it("S-WEB-57 settled lines say what happens next", () => {
    expect(loanSettledLine("approved", "loan", true)).toMatch(/guarantor agrees/);
    expect(loanSettledLine("approved", "loan", false)).toMatch(/send the money/);
    expect(loanSettledLine("approved", "settle", false)).toMatch(/settle it now/);
    expect(loanSettledLine("expired", "loan", false)).toMatch(/ran out/);
    expect(loanSettledLine("rejected", "loan", false)).toMatch(/aren't enough yes/);
  });
});

describe("loans from events", () => {
  const logs = [
    log("LoanRequested", {
      requestId: 1n,
      borrower: ALICE,
      guarantor: ZERO,
      amount: AVAX / 2n,
      medical: false,
      deadline: 0n,
      eligible: 2n,
    }),
    log("LoanDisbursed", { requestId: 1n, borrower: ALICE, amount: AVAX / 2n, period: BigInt(P) }),
    log("LoanRepaid", {
      borrower: ALICE,
      principal: AVAX / 4n,
      minInterest: 0n,
      remaining: AVAX / 4n,
    }),
    log("LoanRequested", {
      requestId: 2n,
      borrower: BOB,
      guarantor: CAROL,
      amount: AVAX / 5n,
      medical: true,
      deadline: 0n,
      eligible: 2n,
    }),
    log("LoanRequestClosed", { requestId: 2n, kind: 0, status: 3 }),
    log("LoanRequested", {
      requestId: 3n,
      borrower: CAROL,
      guarantor: ZERO,
      amount: AVAX,
      medical: false,
      deadline: 0n,
      eligible: 2n,
    }),
    log("LoanDisbursed", { requestId: 3n, borrower: CAROL, amount: AVAX, period: BigInt(P) }),
    log("LoanDefaulted", { borrower: CAROL, guarantor: ZERO, overdueMonths: 2n }),
    log("LoanRequested", {
      requestId: 4n,
      borrower: BOB,
      guarantor: ZERO,
      amount: AVAX / 10n,
      medical: false,
      deadline: 0n,
      eligible: 2n,
    }),
    log("SettleProposed", {
      requestId: 5n,
      borrower: CAROL,
      proposer: ALICE,
      deadline: 0n,
      eligible: 1n,
    }),
    log("LoanRequestClosed", { requestId: 5n, kind: 1, status: 3 }),
  ];

  it("S-WEB-58 builds each request's status, outstanding and type", () => {
    const rows = loansFromLogs(logs);
    const by = new Map(rows.map((r) => [r.requestId, r]));
    expect(rows).toHaveLength(4);
    expect(by.get(1)!.status).toBe("active");
    expect(by.get(1)!.outstanding).toBe(AVAX / 4n);
    expect(by.get(1)!.disbursedPeriod).toBe(P);
    expect(by.get(2)!.status).toBe("declined");
    expect(by.get(2)!.closedAs).toBe("rejected");
    expect(by.get(2)!.medical).toBe(true);
    expect(by.get(3)!.status).toBe("default"); // a failed settle vote changes nothing
    expect(by.get(4)!.status).toBe("voting");

    const after = loansFromLogs([
      ...logs,
      log("LoanCured", { borrower: CAROL }),
      log("LoanRepaid", { borrower: ALICE, principal: AVAX / 4n, minInterest: 0n, remaining: 0n }),
    ]);
    const a = new Map(after.map((r) => [r.requestId, r]));
    expect(a.get(3)!.status).toBe("active");
    expect(a.get(1)!.status).toBe("repaid");
    expect(a.get(1)!.outstanding).toBe(0n);

    const settled = loansFromLogs([
      ...logs,
      log("LoanSettled", {
        borrower: CAROL,
        guarantor: ZERO,
        fromBorrower: AVAX,
        fromGuarantor: 0n,
        writtenOff: 0n,
      }),
    ]);
    expect(settled.find((r) => r.requestId === 3)!.status).toBe("settled");
  });

  it("S-WEB-58 filters by status, type and borrower name or address, and sorts", () => {
    const rows = loansFromLogs(logs);
    const name = (a: string) => (a === ALICE ? "Alice_A" : a === BOB ? "Bobby" : "Carol_C");
    expect(filterLoans(rows, "active", "all", "", name).map((r) => r.requestId)).toEqual([1]);
    expect(filterLoans(rows, "default", "all", "", name).map((r) => r.requestId)).toEqual([3]);
    expect(filterLoans(rows, "all", "medical", "", name).map((r) => r.requestId)).toEqual([2]);
    expect(filterLoans(rows, "all", "regular", "bob", name).map((r) => r.requestId)).toEqual([4]);
    expect(filterLoans(rows, "all", "all", "0xcccc", name).map((r) => r.requestId)).toEqual([3]);
    expect(filterLoans(rows, "declined", "all", "", name).map((r) => r.requestId)).toEqual([2]);

    expect(sortLoans(rows, "newest").map((r) => r.requestId)).toEqual([4, 3, 2, 1]);
    expect(sortLoans(rows, "oldest").map((r) => r.requestId)).toEqual([1, 2, 3, 4]);
    expect(sortLoans(rows, "amount").map((r) => r.requestId)).toEqual([3, 1, 2, 4]);
    const rate = (r: { requestId: number }) =>
      r.requestId === 1 ? 150 : r.requestId === 3 ? 200 : null;
    expect(sortLoans(rows, "rate", rate).map((r) => r.requestId)).toEqual([3, 1, 4, 2]);

    expect(pickParam("active", LOAN_FILTERS)).toBe("active");
    expect(pickParam("<script>", LOAN_FILTERS)).toBe("all");
    expect(pickParam(null, LOAN_FILTERS)).toBe("all");
  });
});

describe("one stake, one loan (ADR 0043)", () => {
  it("S-WEB-61 borrowers and accepted guarantors of live loans are tied; closed loans free them", () => {
    const req = (id: bigint, borrower: string, guarantor: string) =>
      log("LoanRequested", { requestId: id, borrower, guarantor, amount: AVAX, medical: false });
    const rows = loansFromLogs([
      req(1n, ALICE, BOB),
      req(2n, CAROL, BOB),
      log("GuaranteeAccepted", { requestId: 2n, borrower: CAROL, guarantor: BOB }),
      req(3n, BOB, ZERO),
      log("LoanRequestClosed", { requestId: 3n, kind: 0, status: 5 }),
    ]);
    const t = loanTies(rows);
    expect([...t.borrowers].sort()).toEqual([ALICE, CAROL].map((a) => a.toLowerCase()).sort());
    // Bob is named on request 1 (not accepted: not tied) and accepted request 2 (tied).
    expect([...t.guarantors]).toEqual([BOB.toLowerCase()]);
    expect(t.borrowers.has(BOB.toLowerCase())).toBe(false);

    const none = loanTies(loansFromLogs([req(1n, ALICE, BOB)]));
    expect(none.guarantors.size).toBe(0);
  });
});

describe("loan charts", () => {
  it("S-WEB-59 outstanding per member counts running and defaulted loans, biggest first", () => {
    const rows = loansFromLogs([
      log("LoanRequested", {
        requestId: 1n,
        borrower: ALICE,
        guarantor: ZERO,
        amount: AVAX,
        medical: false,
      }),
      log("LoanDisbursed", { requestId: 1n, borrower: ALICE, amount: AVAX, period: BigInt(P) }),
      log("LoanRequested", {
        requestId: 2n,
        borrower: BOB,
        guarantor: ZERO,
        amount: 2n * AVAX,
        medical: false,
      }),
      log("LoanDisbursed", { requestId: 2n, borrower: BOB, amount: 2n * AVAX, period: BigInt(P) }),
      log("LoanDefaulted", { borrower: BOB, guarantor: ZERO, overdueMonths: 2n }),
      log("LoanRequested", {
        requestId: 3n,
        borrower: CAROL,
        guarantor: ZERO,
        amount: AVAX,
        medical: false,
      }),
    ]);
    expect(outstandingByMember(rows)).toEqual([
      { borrower: BOB, outstanding: 2n * AVAX },
      { borrower: ALICE, outstanding: AVAX },
    ]);
  });

  it("S-WEB-59 where the money is: lent out, reserve (rounded up, capped at cash) and free cash", () => {
    const s = moneySplit(10n * AVAX, 4n * AVAX, 2000);
    expect(s).toEqual({ lent: 4n * AVAX, reserve: 2n * AVAX, free: 4n * AVAX, total: 10n * AVAX });
    expect(s.lent + s.reserve + s.free).toBe(s.total);
    const tight = moneySplit(10n * AVAX, 9n * AVAX, 2000);
    expect(tight.reserve).toBe(AVAX);
    expect(tight.free).toBe(0n);
    expect(moneySplit(3n, 0n, 2000).reserve).toBe(1n);
    expect(shareText(1n, 3n)).toBe("33.3%");
    expect(shareText(1n, 2n)).toBe("50%");
    expect(shareText(0n, 0n)).toBe("0%");
  });
});
