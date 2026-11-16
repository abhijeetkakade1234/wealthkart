# SEO, GEO and llms.txt

Decision: [ADR 0024](decisions/0024-seo-geo-llms-txt.md). The app is a static export, so everything below is generated at build time.

## 1. What's public vs private

| Route           | Indexed | Notes                                                                   |
| --------------- | ------- | ----------------------------------------------------------------------- |
| `/`             | yes     | Landing (ADR 0049); copy in `content/landing.ts`, also in llms-full.txt |
| `/how-it-works` | yes     | Create circle → contribute AVAX → borrow by vote → exit; `HowTo` schema |
| `/faq`          | yes     | Real questions people ask; `FAQPage` schema                             |
| `/rules`        | yes     | Every circle setting with defaults and bounds (from ADR 0022)           |
| `/security`     | yes     | Immutable contracts, audits, addresses, bug bounty, what we never store |
| `/privacy`      | yes     | Privacy policy (ADR 0055); footer only, no page JSON-LD                 |
| `/terms`        | yes     | Terms of use (ADR 0055); footer only, no page JSON-LD                   |
| `/risks`        | yes     | Risk disclosure (ADR 0055); footer only, no page JSON-LD                |
| `/blog/*`       | yes     | Later (Phase 4)                                                         |
| `/app/*`        | **no**  | `noindex`, disallowed in robots, excluded from sitemap                  |

## 2. SEO checklist (per public page)

- `metadata`: unique `title` (≤ 60 chars), `description` (≤ 155), `alternates.canonical`, `openGraph`, `twitter` (`summary_large_image`)
- Static OG image per page (`/og/<slug>.png`, generated at build; ADR 0027)
- One `h1`, logical `h2`/`h3`, descriptive link text, `alt` on images
- `sitemap.ts` → `/sitemap.xml` (public routes only); `robots.ts` → `/robots.txt`
- `manifest.webmanifest` (PWA) with name, icons, theme colour
- Performance budget in CI (Lighthouse on public pages): LCP < 2.5 s, CLS < 0.1, INP < 200 ms, JS on public pages kept small (wallet code loads only under `/app`)

## 3. GEO (answer engines)

- Write each section as a **question heading plus a direct 1–3 sentence answer**, then detail. Answer engines quote these blocks.
- Include **concrete, checkable facts**: default rules (1%/month, 20% reserve, 30-day notice), chain (Avalanche C-Chain), contract addresses with Snowtrace links, audit report link, "we store no personal data".
- **JSON-LD:** `Organization` + `WebSite` (site-wide), `SoftwareApplication` (home), `HowTo` (how-it-works), `FAQPage` (faq), `TechArticle` (rules, security). Legal pages (privacy, terms, risks) carry no page-level JSON-LD (ADR 0055).
- Keep headings and URLs stable; update dates shown on pages.
- Target questions, e.g.: "How do friends pool money and lend to each other safely?", "What is a savings circle on Avalanche?", "How does WealthKart decide loans?", "What happens if a member stops paying?", "Can WealthKart access our funds?", "What if I lose my wallet?"

## 4. llms.txt

Generated at build from the same content as the pages (`apps/web/src/content/pages.ts` and `legal.ts`, ADR 0027, 0055).

`/llms.txt`:

```md
# WealthKart

> WealthKart lets private circles of friends pool AVAX monthly in a smart-contract vault on Avalanche and lend to members by vote. No personal data is stored; login is a Core Wallet.

## Docs

- [How it works](https://<domain>/how-it-works.md): creating a circle, monthly contributions, loans by vote, exits
- [Rules and defaults](https://<domain>/rules.md): every circle setting with default values and limits
- [Security](https://<domain>/security.md): immutable contracts, audits, contract addresses
- [FAQ](https://<domain>/faq.md): common questions

## Legal

- [Privacy policy](https://<domain>/privacy.md): what WealthKart stores (almost nothing), what is public on-chain, browser storage
- [Terms of use](https://<domain>/terms.md): open-source, non-custodial, private circles, no promises about money
- [Risks of saving in a WealthKart circle](https://<domain>/risks.md): contract bugs, lost wallets, price moves, USDT freezes, unpaid loans, notice periods

## Optional

- [Full docs](https://<domain>/llms-full.txt)
```

Also publish a `.md` version of each public page (e.g. `/how-it-works.md`) and `/llms-full.txt` with all of them concatenated.

## 5. robots.txt

```
User-agent: *
Allow: /
Disallow: /app/

# AI crawlers: allowed on public pages
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: PerplexityBot
User-agent: Google-Extended
Allow: /
Disallow: /app/

Sitemap: https://<domain>/sitemap.xml
```

## 6. Copy rules

- Never promise returns or show "earn X%" as marketing (ADR 0005). Showing a circle's own historical numbers inside the app is fine.
- Legal pages follow the same rule, even in a denial: write "nobody promises that you will get back more than you put in", not "no returns" (S-LEGAL-02).
- Say "private circles of friends", never "invest with us".
- Plain language; write for someone who has never used crypto.
