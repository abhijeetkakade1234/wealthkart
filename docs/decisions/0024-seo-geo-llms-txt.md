# 0024. SEO, GEO and llms.txt on public pages only

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Circles are private and invite-only (ADR 0005), so growth comes from people searching or asking an AI assistant things like "how do friends pool money and lend to each other" or "savings circle app on Avalanche". Search engines and AI answer engines (ChatGPT, Claude, Perplexity, Google AI Overviews) need crawlable, clearly structured public content. The app itself is wallet-gated and has nothing to index.

## Decision

- **Indexable:** only public marketing and help pages (`/`, `/how-it-works`, `/faq`, `/security`, `/rules`, later `/blog`). Everything under `/app` is `noindex` and disallowed in `robots.txt`.
- **SEO:** Next.js Metadata API per page (title, description, canonical, Open Graph, Twitter card); static OG images generated at build; `sitemap.xml` and `robots.txt` generated at build; semantic HTML; Core Web Vitals budgets in CI (Lighthouse).
- **GEO (generative engine optimisation):** pages written as clear question-and-answer content with concrete facts (how a circle works, rules and defaults, what's on-chain, contract addresses, audit status); JSON-LD (`Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `HowTo`); stable headings so answer engines can quote sections.
- **llms.txt:** `/llms.txt` (short index in the llms.txt format) and `/llms-full.txt` (full Markdown of the public docs), generated at build from the same content source as the pages.
- **AI crawlers allowed** on public pages (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.).
- **Compliance in copy (ADR 0005):** never promise or advertise returns; describe the product as a tool for private friend circles.

## Alternatives considered

- Index app pages: nothing useful and it would expose circle addresses; rejected.
- Block AI crawlers: loses the main discovery channel for this kind of question; rejected.

## Consequences

A small content source (MDX) feeds the pages, the sitemap and llms.txt. Spec: `docs/seo.md`. Public pages get added to the page map.
