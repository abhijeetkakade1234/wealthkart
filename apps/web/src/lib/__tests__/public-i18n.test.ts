import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import type { LandingCopy } from "@/content/landing";
import {
  HOW_IT_WORKS_BY_LOCALE,
  LANDING_BY_LOCALE,
  languageAlternates,
  LOCALIZED_PATHS,
  linkFor,
  localizedPath,
  PAGE_LOCALES,
  START_BY_LOCALE,
} from "@/content/localized";
import type { Block, PublicPage } from "@/content/pages";
import { SITE_URL } from "@/content/site";
import { pageMetadata } from "@/lib/seo/metadata";

/**
 * Localized public pages (ADR 0057): `/hi/` and `/mr/` copies of the landing page, `/start`
 * and `/how-it-works`. Scenario IDs in docs/testing.md (S-I18N).
 */

/** Words that advertise returns, per language (ADR 0024). Public copy must never use them. */
const BANNED: Record<"en" | "hi" | "mr", string[]> = {
  en: ["earn ", "returns", "profit", "guaranteed", "invest with us", "apy", "yield"],
  hi: [
    "रिटर्न",
    "मुनाफ़ा",
    "मुनाफा",
    "कमाई",
    "कमाएँ",
    "कमाएं",
    "गारंटीड",
    "गारंटी",
    "पक्का फ़ायदा",
    "पक्का फायदा",
    "निवेश करें",
    "यील्ड",
  ],
  mr: ["परतावा", "नफा", "कमाई", "कमवा", "हमखास", "खात्रीशीर", "गॅरंटी", "गुंतवणूक करा", "यील्ड"],
};

const EMOJI = /\p{Extended_Pictographic}/u;

/** Every string inside a value, for word checks. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

/** A page's structure without its words: ids, block kinds, item counts, link targets. */
function shape(page: PublicPage) {
  const block = (b: Block) => {
    switch (b.kind) {
      case "list":
      case "steps":
        return `${b.kind}:${b.items.length}`;
      case "links":
        return `links:${b.items.map((l) => l.href.replace(/^\/(hi|mr)\//, "/")).join(",")}`;
      case "table":
        return `table:${b.rows.length}`;
      default:
        return b.kind;
    }
  };
  return {
    slug: page.slug,
    schema: page.schema,
    updated: page.updated,
    sections: page.sections.map((s) => ({ id: s.id, blocks: (s.blocks ?? []).map(block) })),
  };
}

function landingShape(c: LandingCopy) {
  return {
    steps: c.steps.steps.length,
    month: c.month.steps.length,
    friends: c.month.friends,
    borrower: c.month.borrower,
    features: c.features.items.map((f) => f.id),
    safety: c.safety.items.map((s) => s.id),
    body: c.audience.body.length,
    facts: c.audience.facts.length,
    faq: c.faq.items.map((q) => q.id),
  };
}

describe("S-I18N-10 Hindi and Marathi public pages match the English structure", () => {
  for (const locale of PAGE_LOCALES) {
    it(`${locale}: /start and /how-it-works keep slugs, section ids and block shapes`, () => {
      for (const byLocale of [START_BY_LOCALE, HOW_IT_WORKS_BY_LOCALE]) {
        const page = byLocale[locale];
        expect(shape(page)).toEqual(shape(byLocale.en));
        expect(page.path).toBe(`/${locale}${byLocale.en.path}`);
        // Translated, not copied.
        expect(page.h1).not.toBe(byLocale.en.h1);
        page.sections.forEach((s, i) => expect(s.answer).not.toBe(byLocale.en.sections[i]!.answer));
      }
    });

    it(`${locale}: the landing copy has the same sections, ids and counts`, () => {
      const copy = LANDING_BY_LOCALE[locale];
      expect(landingShape(copy)).toEqual(landingShape(LANDING_BY_LOCALE.en));
      expect(copy.hero.h1).toContain(copy.hero.h1Em);
      expect(copy.hero.h1).not.toBe(LANDING_BY_LOCALE.en.hero.h1);
    });

    it(`${locale}: titles and descriptions fit search limits, nothing is empty`, () => {
      for (const page of [START_BY_LOCALE[locale], HOW_IT_WORKS_BY_LOCALE[locale]]) {
        expect(page.title.length, page.title).toBeLessThanOrEqual(60);
        expect(page.description.length, page.description).toBeLessThanOrEqual(155);
      }
      expect(LANDING_BY_LOCALE[locale].description.length).toBeLessThanOrEqual(155);
      const all = [
        ...strings(LANDING_BY_LOCALE[locale]),
        ...strings(START_BY_LOCALE[locale]),
        ...strings(HOW_IT_WORKS_BY_LOCALE[locale]),
      ];
      for (const s of all) {
        expect(s.trim().length, "empty string").toBeGreaterThan(0);
        expect(EMOJI.test(s), s).toBe(false);
      }
    });
  }
});

describe("S-I18N-11 public copy never advertises returns, in any language", () => {
  for (const locale of ["en", "hi", "mr"] as const) {
    it(`${locale}: no banned words on the landing page, /start or /how-it-works`, () => {
      const text = [
        ...strings(LANDING_BY_LOCALE[locale]),
        ...strings(START_BY_LOCALE[locale]),
        ...strings(HOW_IT_WORKS_BY_LOCALE[locale]),
      ]
        .join("\n")
        .toLowerCase();
      for (const word of BANNED[locale]) expect(text, word).not.toContain(word);
    });
  }
});

describe("S-I18N-12 localized routes, hreflang and the sitemap", () => {
  it("maps paths to their localized twin, and English-only pages to themselves", () => {
    expect(localizedPath("hi", "/")).toBe("/hi/");
    expect(localizedPath("mr", "/start/")).toBe("/mr/start/");
    expect(localizedPath("en", "/how-it-works/")).toBe("/how-it-works/");
    expect(linkFor("hi", "/faq/")).toBe("/faq/");
    expect(linkFor("mr", "/how-it-works/")).toBe("/mr/how-it-works/");
  });

  it("hreflang alternates list en, hi, mr and an English x-default", () => {
    expect(languageAlternates("/start/")).toEqual({
      en: "/start/",
      hi: "/hi/start/",
      mr: "/mr/start/",
      "x-default": "/start/",
    });
    const meta = pageMetadata(START_BY_LOCALE.hi, {
      languages: languageAlternates("/start/"),
      ogLocale: "hi_IN",
    });
    expect(meta.alternates?.canonical).toBe("/hi/start/");
    expect(meta.alternates?.languages).toMatchObject({ hi: "/hi/start/", "x-default": "/start/" });
  });

  it("the sitemap lists all six localized URLs, each with its language alternates", () => {
    const entries = sitemap();
    for (const locale of PAGE_LOCALES) {
      for (const path of LOCALIZED_PATHS) {
        const url = `${SITE_URL}/${locale}${path}`;
        const entry = entries.find((e) => e.url === url);
        expect(entry, url).toBeDefined();
        expect(entry?.alternates?.languages).toMatchObject({
          en: `${SITE_URL}${path}`,
          hi: `${SITE_URL}/hi${path}`,
          mr: `${SITE_URL}/mr${path}`,
        });
      }
    }
    // English twins carry the same alternates; English-only pages carry none.
    expect(entries.find((e) => e.url === `${SITE_URL}/start/`)?.alternates).toBeDefined();
    expect(entries.find((e) => e.url === `${SITE_URL}/faq/`)?.alternates).toBeUndefined();
    expect(entries.some((e) => /\/(hi|mr)\/(faq|rules|security|privacy)/.test(e.url))).toBe(false);
  });
});
