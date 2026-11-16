import { afterAll, describe, expect, it } from "vitest";

import { LOCALES } from "@/i18n/config";
import { getLocale, setLocale } from "@/i18n/runtime";

import { messages, toFriendlyError } from "../messages";

const EMOJI = /\p{Extended_Pictographic}/u;
const LEFTOVER_PARAM = /\{\w+\}/;

/** Sample arguments for messages that take some; the rest are called with none. */
const SAMPLE_ARGS: Partial<Record<keyof typeof messages, unknown[]>> = {
  insufficientAvax: [{ needed: "0.52", amount: "0.50", fee: "0.02" }],
  alreadyPaid: ["December"],
  loanAboveCap: ["6.2"],
  nameChangeTooSoon: ["12 Dec 2026"],
  needGasAvax: ["0.01"],
  notEnoughToken: [{ needed: "25.00", have: "10.00", symbol: "USDT" }],
  testUsdtNote: ["100 USDT"],
  testUsdtAdded: ["100"],
  paid: ["December", "0.50", "AVAX"],
  voted: [8, 12],
  copied: ["Invite link"],
  remindersOtherWallet: ["0x1234…abcd"],
  staleNote: [5],
  widgetErrorTitle: ["Chart"],
};

function callAll(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, fn] of Object.entries(messages)) {
    const args = SAMPLE_ARGS[name as keyof typeof messages] ?? [];
    out[name] = (fn as (...a: unknown[]) => string)(...args);
  }
  // Variants without the optional argument, and every staleNote branch.
  out["insufficientAvax()"] = messages.insufficientAvax();
  out["alreadyPaid()"] = messages.alreadyPaid();
  out["loanAboveCap()"] = messages.loanAboveCap();
  out["nameChangeTooSoon()"] = messages.nameChangeTooSoon();
  out["copied()"] = messages.copied();
  out["widgetErrorTitle()"] = messages.widgetErrorTitle();
  out["staleNote(0)"] = messages.staleNote(0.5);
  out["staleNote(1)"] = messages.staleNote(1);
  out["staleNote(60)"] = messages.staleNote(60);
  out["staleNote(180)"] = messages.staleNote(180);
  return out;
}

const english = callAll();

afterAll(async () => {
  await setLocale("en");
});

describe("S-I18N-01 the message catalogue in every language", () => {
  for (const locale of LOCALES) {
    it(`${locale}: every message is non-empty, emoji-free and fully filled in`, async () => {
      expect(await setLocale(locale)).toBe(true);
      expect(getLocale()).toBe(locale);
      const all = callAll();
      for (const [name, text] of Object.entries(all)) {
        expect(text.trim().length, name).toBeGreaterThan(0);
        expect(EMOJI.test(text), name).toBe(false);
        expect(LEFTOVER_PARAM.test(text), `${name}: ${text}`).toBe(false);
        expect(text, name).not.toMatch(/^msg\./);
      }
      if (locale !== "en") {
        // Every message is actually translated (none falls back to English).
        for (const [name, text] of Object.entries(all)) {
          expect(text, name).not.toBe(english[name]);
        }
      }
      // Values passed in come through untouched.
      expect(all.insufficientAvax).toContain("0.52");
      expect(all.paid).toContain("0.50");
      expect(all.paid).toContain("December");
      expect(all.voted).toContain("8");
      expect(all.voted).toContain("12");
      expect(all.loanAboveCap).toContain("6.2");
    });

    it(`${locale}: toFriendlyError keeps its codes and uses the active language`, async () => {
      await setLocale(locale);
      const rejected = toFriendlyError({ code: 4001, message: "User rejected the request." });
      expect(rejected.code).toBe("user-rejected");
      expect(rejected.message).toBe(messages.userRejected());

      const paid = toFriendlyError(
        { name: "ContractFunctionRevertedError", data: { errorName: "AlreadyPaid" } },
        { month: "December" },
      );
      expect(paid.code).toBe("already-paid");
      expect(paid.message).toBe(messages.alreadyPaid("December"));
      expect(paid.message).toContain("December");

      const cap = toFriendlyError({ data: { errorName: "LoanAboveCap" } }, { maxLoanAvax: "6.2" });
      expect(cap.code).toBe("loan-above-cap");
      expect(cap.message).toBe(messages.loanAboveCap("6.2"));

      const loan = toFriendlyError({ data: { errorName: "GuarantorRequired" } });
      expect(loan.code).toBe("loan-guarantor-required");
      expect(loan.message).toBe(messages.guarantorRequired());

      const unknown = toFriendlyError(new RangeError("index 7 out of bounds"));
      expect(unknown.code).toBe("unknown");
      expect(unknown.message).toBe(messages.unknown());
      // Technical details stay as the wallet or node sent them.
      expect(unknown.details).toContain("index 7 out of bounds");
    });
  }

  it("English stays exactly as before after switching back", async () => {
    await setLocale("hi");
    await setLocale("en");
    expect(messages.userRejected()).toBe("You cancelled this in Core. Nothing was sent.");
    expect(messages.copied()).toBe("Address copied.");
    expect(messages.staleNote(1)).toBe("Showing saved data from 1 min ago");
    expect(messages.staleNote(60)).toBe("Showing saved data from 1 hour ago");
    expect(messages.staleNote(180)).toBe("Showing saved data from 3 hours ago");
    expect(callAll()).toEqual(english);
  });
});
