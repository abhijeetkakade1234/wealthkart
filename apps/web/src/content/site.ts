/**
 * Site-wide facts for SEO, the sitemap, robots, llms.txt and JSON-LD (ADR 0024, docs/seo.md).
 * The production domain is not final yet: set NEXT_PUBLIC_SITE_URL at build time to override.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://wealthkart.pages.dev"
).replace(/\/+$/, "");

export const SITE_NAME = "WealthKart";

export const SITE_TAGLINE = "Savings circles for friends, on Avalanche";

/** One-sentence summary used in metadata, llms.txt and JSON-LD. No return promises (ADR 0005). */
export const SITE_SUMMARY =
  "WealthKart lets private circles of friends pool AVAX monthly in a smart-contract vault on Avalanche and lend to members by vote. No personal data is stored; login is a Core Wallet.";

/** Absolute URL for a site path ("/faq/" → "https://…/faq/"). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Private areas: never indexed, never in the sitemap. */
export const PRIVATE_PATHS = ["/app/", "/kit/", "/login/", "/record/"] as const;

/** Crawlers for AI answer engines; allowed on public pages (ADR 0024). */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
] as const;
