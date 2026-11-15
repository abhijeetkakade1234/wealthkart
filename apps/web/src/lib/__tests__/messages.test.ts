import { circleFactoryAbi, circleVaultAbi } from "@wealthkart/sdk";
import { describe, expect, it } from "vitest";

import { messages, toFriendlyError } from "../messages";

const EMOJI = /\p{Extended_Pictographic}/u;

describe("toFriendlyError", () => {
  it("S-UX-07 EIP-1193 4001 maps to user rejected", () => {
    const e = toFriendlyError({ code: 4001, message: "User rejected the request." });
    expect(e.code).toBe("user-rejected");
    expect(e.message).toBe("You cancelled this in Core. Nothing was sent.");
    expect(e.details).toContain("4001");
  });

  it("S-UX-07 viem-style nested UserRejectedRequestError maps to user rejected", () => {
    const err = Object.assign(new Error("Request failed"), {
      cause: { name: "UserRejectedRequestError", code: 4001 },
    });
    expect(toFriendlyError(err).code).toBe("user-rejected");
  });

  it("S-UX-07 insufficient funds (wrapped in -32603) maps to the AVAX message with amounts", () => {
    const err = {
      code: -32603,
      message: "Internal JSON-RPC error.",
      data: { message: "insufficient funds for gas * price + value" },
    };
    const e = toFriendlyError(err, {
      insufficient: { needed: "0.52", amount: "0.50", fee: "0.02" },
    });
    expect(e.code).toBe("insufficient-funds");
    expect(e.message).toBe(
      "Not enough AVAX in your wallet. You need 0.52 AVAX (0.50 + about 0.02 network fee).",
    );
  });

  it("S-UX-07 bare -32603 maps to the network message", () => {
    const e = toFriendlyError({ code: -32603, message: "Internal JSON-RPC error." });
    expect(e.code).toBe("network");
    expect(e.message).toBe(messages.networkUnreachable());
  });

  it("S-UX-07 timeouts map to the timeout message", () => {
    const timeoutError = Object.assign(new Error("The request took too long to respond."), {
      name: "TimeoutError",
    });
    expect(toFriendlyError(timeoutError).message).toBe(messages.timeout());
    expect(toFriendlyError(new Error("request timed out")).code).toBe("timeout");
  });

  it("S-UX-07 unknown errors map to the unknown message and keep details for support", () => {
    const e = toFriendlyError(new RangeError("index 7 out of bounds"));
    expect(e.code).toBe("unknown");
    expect(e.message).toBe(messages.unknown());
    expect(e.message).not.toContain("index 7");
    expect(e.details).toContain("index 7 out of bounds");
    expect(toFriendlyError(undefined).code).toBe("unknown");
    expect(toFriendlyError(null).code).toBe("unknown");
  });

  it("S-UX-07 wrong network and known contract errors map to catalogue entries", () => {
    expect(toFriendlyError({ code: 4902 }).message).toBe(messages.wrongNetwork());
    expect(
      toFriendlyError(
        { name: "ContractFunctionRevertedError", data: { errorName: "AlreadyPaid" } },
        { month: "December" },
      ).message,
    ).toBe("You've already paid for December.");
    expect(toFriendlyError({ data: { errorName: "VoteClosed" } }).message).toBe(
      "This vote has already ended.",
    );
    expect(
      toFriendlyError({ data: { errorName: "LoanAboveCap" } }, { maxLoanAvax: "6.2" }).message,
    ).toBe(
      "This loan is bigger than the circle allows for you right now. The most you can ask for is 6.2 AVAX.",
    );
  });

  it("S-UX-07 every CircleVault custom error has a plain-language message", () => {
    const cases: Array<[string, string]> = [
      ["AdvancePaymentNotAllowed", messages.alreadyPaid()],
      ["WrongAmount", messages.amountChanged()],
      ["NotAMember", messages.notMember()],
      ["HolidayTooLate", messages.holidayTooLate()],
      ["HolidayAlreadyDeclared", messages.holidayAlreadyTaken()],
      ["HolidayLimitReached", messages.holidayLimitReached()],
      ["PeriodAlreadyPaid", messages.monthAlreadyPaid()],
      ["MainnetNotSupported", messages.notAvailableYet()],
    ];
    for (const [errorName, expected] of cases) {
      const fe = toFriendlyError({ name: "ContractFunctionRevertedError", data: { errorName } });
      expect(fe.message).toBe(expected);
      expect(fe.code).not.toBe("unknown");
    }
  });

  it("S-MEM-19 every membership error has its own plain-language message", () => {
    const cases: Array<[string, string]> = [
      ["NotACircle", messages.notACircle()],
      ["NoFounderInvite", messages.noFounderInvite()],
      ["FounderInviteExpired", messages.founderInviteExpired()],
      ["AlreadyMember", messages.alreadyMember()],
      ["RequestAlreadyOpen", messages.requestAlreadyOpen()],
      ["TooManyOpenRequests", messages.tooManyOpenRequests()],
      ["CircleFull", messages.circleFull()],
      ["InvitedByNotAMember", messages.inviterNotMember()],
      ["InvalidDisplayName", messages.invalidDisplayName()],
      ["NameTaken", messages.nameTaken()],
      ["NameChangeTooSoon", messages.nameChangeTooSoon()],
      ["RequestNotOpen", messages.requestNotOpen()],
      ["VotingClosed", messages.voteClosed()],
      ["NotEligibleToVote", messages.notEligibleToVote()],
      ["AlreadyVoted", messages.alreadyVoted()],
      ["NotDecidedYet", messages.notDecidedYet()],
      ["NoOpenRequest", messages.noOpenRequest()],
    ];
    for (const [errorName, expected] of cases) {
      const fe = toFriendlyError({ name: "ContractFunctionRevertedError", data: { errorName } });
      expect(fe.message, errorName).toBe(expected);
    }
    expect(
      toFriendlyError({ data: { errorName: "NameChangeTooSoon" } }, { nameChangeAt: "14 Dec" })
        .message,
    ).toContain("14 Dec");
  });

  it("S-MEM-19 no user-reachable contract error falls through to the generic message", () => {
    // Errors only the create form can hit (it validates first) or that no button can trigger.
    const creationOnly = new Set([
      "InvalidConfig",
      "InvalidDueDay",
      "TooManyFounders",
      "DuplicateMember",
      "ZeroAddressMember",
      "DirectTransferNotAllowed",
      "SafeCastOverflowedUintDowncast",
      "ReentrancyGuardReentrantCall",
    ]);
    const names = [...circleVaultAbi, ...circleFactoryAbi]
      .filter((item) => item.type === "error")
      .map((item) => item.name)
      .filter((n) => !creationOnly.has(n));
    expect(names.length).toBeGreaterThan(15);
    for (const errorName of names) {
      expect(toFriendlyError({ data: { errorName } }).code, errorName).not.toBe("unknown");
    }
  });

  it("S-UX-07 never throws on hostile input", () => {
    const hostile = {
      get message(): string {
        throw new Error("getter exploded");
      },
    };
    expect(() => toFriendlyError(hostile)).not.toThrow();
    const circular: Record<string, unknown> = { message: "loop" };
    circular.cause = circular;
    expect(toFriendlyError(circular).code).toBe("unknown");
  });
});

describe("message catalogue", () => {
  it("S-UX-07 matches the docs/ui.md §12 examples", () => {
    expect(messages.userRejected()).toBe("You cancelled this in Core. Nothing was sent.");
    expect(messages.wrongNetwork()).toBe(
      "Your wallet is on the wrong network. Switch to Avalanche to continue.",
    );
    expect(messages.networkUnreachable()).toBe(
      "We can't reach the Avalanche network right now. Your money is safe. Try again in a minute.",
    );
    expect(messages.alreadyPaid("December")).toBe("You've already paid for December.");
    expect(messages.voteClosed()).toBe("This vote has already ended.");
    expect(messages.timeout()).toBe(
      "This is taking longer than usual. It may still go through; we'll update this page when it does.",
    );
    expect(messages.unknown()).toBe(
      "Something went wrong on our side. Your money is safe. Try again, or share the details with your circle admin.",
    );
    expect(messages.paid("December", "0.50")).toBe(
      "Paid. Your December installment of 0.50 AVAX is in.",
    );
    expect(messages.voted(8, 12)).toBe("Vote counted. 8 of 12 have voted.");
    expect(messages.copied()).toBe("Address copied.");
  });

  it("S-UX-08 no catalogue message contains an emoji or an error code", () => {
    const samples = Object.values(messages).map((fn) =>
      (fn as (...args: unknown[]) => string)("x", "y"),
    );
    for (const text of samples) {
      expect(text).not.toMatch(EMOJI);
      expect(text).not.toMatch(/-?32\d{3}|4001|0x[0-9a-f]+/i);
    }
  });
});
