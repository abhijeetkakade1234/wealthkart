import { afterEach, describe, expect, it } from "vitest";

import { INTL_LOCALE, localeFromBrowser, LOCALES } from "../config";
import { en } from "../en";
import { hi } from "../hi";
import { mr } from "../mr";
import { formatDate, formatNumber, interpolate, setLocale, t, tn } from "../runtime";
import type { Dict } from "../types";

const EMOJI = /\p{Extended_Pictographic}/u;
const PARAMS = /\{(\w+)\}/g;
const TAGS = /<\/?(\w+)>/g;

/** Every leaf as [dotted key, text]. */
function leaves(node: unknown, prefix = ""): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  );
}

const sorted = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => m[0]).sort();

const EN = new Map(leaves(en));
const OTHERS: Array<[string, Dict]> = [
  ["hi", hi],
  ["mr", mr],
];

/**
 * Words that promise or advertise returns (ADR 0024), in each language. English matches
 * `seo.test.ts`; Hindi and Marathi are their everyday equivalents.
 */
const BANNED_RETURNS_WORDS = {
  en: ["earn ", "returns", "profit", "guaranteed", "invest with us", "apy", "yield"],
  hi: [
    "रिटर्न",
    "मुनाफ़ा",
    "मुनाफा",
    "कमाई",
    "कमाएँ",
    "कमाएं",
    "गारंटीड",
    "पक्का फ़ायदा",
    "पक्का फायदा",
    "निवेश करें",
    "यील्ड",
  ],
  mr: ["परतावा", "नफा", "कमाई", "कमवा", "हमखास", "खात्रीशीर", "गुंतवणूक करा", "यील्ड"],
} as const;

/**
 * App areas a newcomer reads before or while joining: these must not sound like an offer of
 * returns. Analytics shows a member their own figures (rate, history) and is checked by hand.
 */
const NO_RETURNS_NAMESPACES = [
  "common",
  "nav",
  "msg",
  "login",
  "home",
  "checklist",
  "wallet",
  "create",
  "join",
  "site",
];

afterEach(async () => {
  await setLocale("en");
});

describe("S-I18N-02 every language has exactly the English keys and params", () => {
  it.each(OTHERS)("%s has the same keys as en", (_, dict) => {
    expect(leaves(dict).map(([k]) => k)).toEqual([...EN.keys()]);
  });

  it.each(OTHERS)("%s keeps every {param} and <tag> of en", (_, dict) => {
    for (const [key, text] of leaves(dict)) {
      const source = EN.get(key) ?? "";
      expect(sorted(PARAMS, text), key).toEqual(sorted(PARAMS, source));
      expect(sorted(TAGS, text), key).toEqual(sorted(TAGS, source));
    }
  });

  it.each([["en", en] as [string, Dict], ...OTHERS])(
    "%s has no empty value, no key as value and no emoji",
    (_, dict) => {
      for (const [key, text] of leaves(dict)) {
        expect(text.trim(), key).not.toBe("");
        expect(text, key).not.toBe(key);
        expect(EMOJI.test(text), key).toBe(false);
      }
    },
  );

  it.each(OTHERS)("%s is really translated (mostly Devanagari, not English copies)", (_, dict) => {
    const all = leaves(dict);
    const copies = all.filter(([k, v]) => v === EN.get(k) && /[a-z]{4,}/i.test(v));
    // Brand names, units and examples can match English ("WealthKart", "UTC", "NightOwl").
    expect(copies.length / all.length).toBeLessThan(0.03);
  });

  it("plural pairs exist in both forms", () => {
    for (const key of EN.keys()) {
      if (key.endsWith("_one")) expect(EN.has(key.replace(/_one$/, "_other")), key).toBe(true);
      if (key.endsWith("_other")) expect(EN.has(key.replace(/_other$/, "_one")), key).toBe(true);
    }
  });
});

describe("S-I18N-03 no language advertises returns", () => {
  it.each(LOCALES)("%s onboarding and app copy has no banned words", (locale) => {
    const dict = { en, hi, mr }[locale] as Dict;
    const words = BANNED_RETURNS_WORDS[locale];
    for (const ns of NO_RETURNS_NAMESPACES) {
      for (const [key, text] of leaves((dict as Record<string, unknown>)[ns], ns)) {
        for (const w of words) {
          // English as whole words ("learn more" is fine); Devanagari as written.
          const hit =
            locale === "en"
              ? new RegExp(`\\b${w.trim()}\\b`).test(text.toLowerCase())
              : text.includes(w);
          expect(hit, `${key}: ${w}`).toBe(false);
        }
      }
    }
  });
});

describe("S-I18N-04 runtime", () => {
  it("picks the browser language we speak, else English", () => {
    expect(localeFromBrowser(["hi-IN", "en"])).toBe("hi");
    expect(localeFromBrowser(["mr"])).toBe("mr");
    expect(localeFromBrowser(["fr-FR", "mr-IN"])).toBe("mr");
    expect(localeFromBrowser(["en-US", "hi"])).toBe("en");
    expect(localeFromBrowser(["de"])).toBe("en");
    expect(localeFromBrowser(undefined)).toBe("en");
  });

  it("switches language, interpolates params and pluralises", async () => {
    expect(t("nav.home")).toBe("Home");
    expect(tn("time.hoursAgo", 1)).toBe("1 hour ago");
    expect(tn("time.hoursAgo", 3)).toBe("3 hours ago");
    expect(await setLocale("hi")).toBe(true);
    expect(t("nav.home")).toBe(hi.nav.home);
    expect(tn("time.hoursAgo", 1)).toBe("1 घंटा पहले");
    expect(tn("time.hoursAgo", 3)).toBe("3 घंटे पहले");
    await setLocale("mr");
    expect(t("nav.loans")).toBe("कर्ज");
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it("formats numbers in lakh and crore with Latin digits for hi and mr only", async () => {
    expect(formatNumber(12345678)).toBe("12,345,678");
    await setLocale("hi");
    expect(formatNumber(12345678)).toBe("1,23,45,678");
    await setLocale("mr");
    expect(formatNumber(12345678)).toBe("1,23,45,678");
    const d = Date.UTC(2026, 11, 3);
    expect(
      formatDate(d, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    ).toMatch(/^3 .+ 2026$/);
    expect(INTL_LOCALE.en).toBe("en-GB");
  });
});
