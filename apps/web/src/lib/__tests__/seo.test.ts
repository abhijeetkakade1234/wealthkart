import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { PUBLIC_PAGES } from "@/content/pages";
import { SITE_URL } from "@/content/site";
import { pageLd, serializeLd } from "@/lib/seo/json-ld";
import { llmsFullTxt, llmsTxt, markdownPath, pageToMarkdown } from "@/lib/seo/markdown";

describe("S-WEB-18 sitemap and robots expose public pages only", () => {
  it("sitemap lists home + every public page and nothing private", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/`);
    for (const p of ["/how-it-works/", "/rules/", "/security/", "/faq/"]) {
      expect(urls).toContain(`${SITE_URL}${p}`);
    }
    expect(urls.some((u) => u.includes("/app") || u.includes("/kit"))).toBe(false);
  });

  it("robots blocks /app/ and /kit/ for everyone, allows AI crawlers on public pages", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    for (const rule of rules) {
      expect(rule.allow).toBe("/");
      expect(rule.disallow).toEqual(expect.arrayContaining(["/app/", "/kit/"]));
    }
    const agents = rules.flatMap((rule) => [rule.userAgent].flat());
    expect(agents).toEqual(expect.arrayContaining(["*", "GPTBot", "ClaudeBot", "PerplexityBot"]));
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});

describe("S-WEB-19 llms.txt and Markdown twins come from the page content", () => {
  it("llms.txt links every page's .md twin and the full file", () => {
    const txt = llmsTxt();
    expect(txt.startsWith("# WealthKart\n\n> ")).toBe(true);
    for (const p of PUBLIC_PAGES) expect(txt).toContain(`${SITE_URL}${markdownPath(p)}`);
    expect(txt).toContain(`${SITE_URL}/llms-full.txt`);
  });

  it("each .md twin carries every question and direct answer", () => {
    for (const p of PUBLIC_PAGES) {
      const md = pageToMarkdown(p);
      expect(md).toContain(`# ${p.h1}`);
      for (const s of p.sections) {
        expect(md).toContain(`## ${s.heading}`);
        expect(md).toContain(s.answer);
      }
    }
    expect(llmsFullTxt()).toContain("## What happens if a member stops paying?");
  });

  it("renders rule tables as Markdown tables", () => {
    const md = pageToMarkdown(PUBLIC_PAGES.find((p) => p.slug === "rules")!);
    expect(md).toContain("| Setting | Default | Limits |");
    expect(md).toContain("| Due day (23:59:59 UTC) | 10 | 1 to 28 |");
  });
});

describe("S-WEB-20 public copy follows ADR 0005 and docs/seo.md", () => {
  const all = llmsFullTxt().toLowerCase();

  it("never advertises returns", () => {
    for (const phrase of ["earn ", "returns", "profit", "guaranteed", "invest with us", "apy"]) {
      expect(all, phrase).not.toContain(phrase);
    }
  });

  it("keeps titles and descriptions within search limits and anchors unique", () => {
    for (const p of PUBLIC_PAGES) {
      expect(p.title.length, p.title).toBeLessThanOrEqual(60);
      expect(p.description.length, p.slug).toBeLessThanOrEqual(155);
      const ids = p.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("FAQ JSON-LD lists every question, and serialised JSON-LD can't close its script tag", () => {
    const faq = PUBLIC_PAGES.find((p) => p.schema === "FAQPage")!;
    const ld = pageLd(faq) as { mainEntity: unknown[] };
    expect(ld.mainEntity).toHaveLength(faq.sections.length);
    expect(serializeLd({ x: "</script><script>" })).not.toContain("</script>");
  });
});

describe("S-WEB-21 PWA manifest and service worker", () => {
  it("manifest opens the app standalone with installable PNG icons", () => {
    const m = manifest();
    expect(m.start_url).toBe("/app/");
    expect(m.display).toBe("standalone");
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });

  const src = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  const strategyFor = new Function("self", "caches", `${src}; return strategyFor;`)(
    { addEventListener: () => {} },
    {},
  ) as (url: string, method: string, origin: string) => string;
  const O = "https://wealthkart.pages.dev";

  it("never caches RPC, cross-origin or non-GET requests", () => {
    expect(strategyFor("https://api.avax-test.network/ext/bc/C/rpc", "POST", O)).toBe("bypass");
    expect(strategyFor("https://api.avax-test.network/ext/bc/C/rpc", "GET", O)).toBe("bypass");
    expect(strategyFor(`${O}/app/`, "POST", O)).toBe("bypass");
    expect(strategyFor(`${O}/sw.js`, "GET", O)).toBe("bypass");
  });

  it("serves pages network-first and hashed assets cache-first", () => {
    expect(strategyFor(`${O}/app/circle/?id=0xabc`, "GET", O)).toBe("network-first");
    expect(strategyFor(`${O}/_next/static/chunks/main-abc.js`, "GET", O)).toBe("cache-first");
    expect(strategyFor(`${O}/icon-192.png`, "GET", O)).toBe("cache-first");
  });
});
