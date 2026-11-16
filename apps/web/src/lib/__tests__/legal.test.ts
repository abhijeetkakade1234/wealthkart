import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { DRAFT_NOTE, LEGAL_PAGES, PRIVACY } from "@/content/legal";
import { PUBLIC_PAGES } from "@/content/pages";
import { SITE_URL } from "@/content/site";
import { llmsFullTxt, llmsTxt, markdownPath, pageToMarkdown } from "@/lib/seo/markdown";

/** Same list as S-WEB-20 / S-LAND-07: banned even in a denial ("no returns"). */
const RETURN_WORDS = ["earn ", "returns", "profit", "guaranteed", "invest with us", "apy", "yield"];

const SRC = resolve(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("S-LEGAL-01 legal pages carry what a legal page needs (ADR 0055)", () => {
  it("has privacy, terms and risks, each with a title, description, date and the draft note", () => {
    expect(LEGAL_PAGES.map((p) => p.slug)).toEqual(["privacy", "terms", "risks"]);
    for (const p of LEGAL_PAGES) {
      expect(p.title.length, p.slug).toBeGreaterThan(0);
      expect(p.title.length, p.title).toBeLessThanOrEqual(60);
      expect(p.description.length, p.slug).toBeGreaterThan(50);
      expect(p.description.length, p.slug).toBeLessThanOrEqual(155);
      expect(p.updated, p.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(p.updated)), p.slug).toBe(false);
      expect(p.draftNote, p.slug).toBe(DRAFT_NOTE);
      expect(p.draftNote!.startsWith("Draft, pending legal review.")).toBe(true);
      expect(p.path).toBe(`/${p.slug}/`);
    }
  });

  it("uses question headings with unique, stable anchors and no page JSON-LD", () => {
    for (const p of LEGAL_PAGES) {
      const ids = p.sections.map((s) => s.id);
      expect(new Set(ids).size, p.slug).toBe(ids.length);
      for (const s of p.sections) expect(s.heading.endsWith("?"), s.heading).toBe(true);
      expect(p.schema, p.slug).toBeUndefined();
    }
  });

  it("doesn't clash with a help page slug", () => {
    const help = new Set(PUBLIC_PAGES.map((p) => p.slug));
    for (const p of LEGAL_PAGES) expect(help.has(p.slug), p.slug).toBe(false);
  });
});

describe("S-LEGAL-02 legal copy never advertises returns", () => {
  it("has none of the banned words, even in a denial", () => {
    for (const p of LEGAL_PAGES) {
      const text = pageToMarkdown(p).toLowerCase();
      for (const phrase of RETURN_WORDS) expect(text, `${p.slug}: ${phrase}`).not.toContain(phrase);
    }
  });

  it("says plainly that nothing is promised and that WealthKart holds no funds", () => {
    const terms = pageToMarkdown(LEGAL_PAGES.find((p) => p.slug === "terms")!);
    expect(terms).toContain("Nobody promises that you will get back more than you put in");
    expect(terms).toContain("never holds your keys or your funds");
    expect(terms).toContain("[city to be confirmed]");
  });
});

describe("S-LEGAL-03 legal pages reach the sitemap, llms.txt and Markdown twins", () => {
  it("lists every legal page in the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    for (const p of LEGAL_PAGES) expect(urls).toContain(`${SITE_URL}${p.path}`);
  });

  it("links every legal twin from llms.txt under its own heading, and puts them in llms-full.txt", () => {
    const txt = llmsTxt();
    expect(txt).toContain("## Legal");
    for (const p of LEGAL_PAGES) expect(txt).toContain(`${SITE_URL}${markdownPath(p)}`);
    const full = llmsFullTxt();
    for (const p of LEGAL_PAGES) expect(full).toContain(`# ${p.h1}`);
  });

  it("puts the draft note and links into each twin", () => {
    for (const p of LEGAL_PAGES) {
      const md = pageToMarkdown(p);
      expect(md).toContain(`**${DRAFT_NOTE}**`);
      expect(md).toContain(`Updated ${p.updated}`);
    }
    expect(pageToMarkdown(PRIVACY)).toContain(
      "[Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/)",
    );
  });
});

describe("S-LEGAL-04 the privacy policy matches what the code stores", () => {
  const files = sourceFiles(SRC);
  const privacy = pageToMarkdown(PRIVACY);

  it("names every browser storage item the app writes", () => {
    for (const key of [
      "wagmi.store",
      "wagmi.recentConnectorId",
      "wagmi.injected.connected",
      "wk:join:",
      "wk:first-run:",
      "wk:reminders",
      "wk.locale",
    ]) {
      expect(privacy, key).toContain(key);
    }
  });

  it("knows every file that touches browser storage or cookies", () => {
    // Adding a file here means adding its keys to PRIVACY ("browser" section) first.
    const known = new Set([
      "app/app/join/page.tsx",
      "lib/first-run.ts",
      "lib/push.ts",
      // The chosen language, wk.locale (ADR 0057).
      "i18n/config.ts",
      "i18n/react.tsx",
      "components/public/locale-effects.tsx",
    ]);
    const users = files
      .filter((f) =>
        /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(
          readFileSync(f, "utf8"),
        ),
      )
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    for (const f of users) expect(known.has(f), f).toBe(true);
  });

  it("loads no analytics, ads or trackers", () => {
    const trackers =
      /googletagmanager|google-analytics|gtag\(|posthog|plausible|mixpanel|segment\.com|amplitude|hotjar|clarity\.ms|@sentry|facebook\.net|fbq\(/i;
    for (const f of files) expect(trackers.test(readFileSync(f, "utf8")), f).toBe(false);
    const pkg = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    expect(trackers.test(pkg)).toBe(false);
  });

  it("self-hosts fonts through next/font instead of linking Google Fonts", () => {
    for (const f of files) {
      expect(readFileSync(f, "utf8").includes("fonts.googleapis.com"), f).toBe(false);
    }
    expect(privacy).toContain("Fonts are served from our own site, not from Google.");
  });
});
