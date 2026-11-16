# src/content

**What's here:** the words on the public pages, as typed data (ADR 0027). One source feeds the HTML pages, their `.md` twins, `/llms.txt`, `/llms-full.txt`, the sitemap and JSON-LD.
**Open this when:** editing copy on `/` (landing), `/how-it-works`, `/rules`, `/security`, `/faq`, `/start` (network-aware onboarding, ADR 0054) or the legal pages (`/privacy`, `/terms`, `/risks`), or changing the site URL or crawler list.

| File           | Purpose                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages.ts`     | Public pages: question heading + direct answer + optional blocks (paragraph, list, steps, table)                                                                                       |
| `legal.ts`     | Legal pages (ADR 0055): privacy, terms, risks, same shape as `pages.ts`, each with a draft note until the lawyer review. The privacy page must match what the code stores (S-LEGAL-04) |
| `landing.ts`   | Landing page copy (ADR 0049); FAQ teaser reads from `pages.ts`; also feeds `/llms-full.txt`                                                                                            |
| `localized.ts` | Hindi and Marathi public pages (ADR 0057): copy by language, `localizedPath`, `linkFor`, hreflang `languageAlternates`, OG locales                                                     |
| `hi/`, `mr/`   | `landing.ts` (same `LandingCopy` type as English) and `pages.ts` (`START`, `HOW_IT_WORKS` with the same section ids), in everyday Hindi and Marathi; glossary in `docs/i18n.md`        |
| `site.ts`      | `SITE_URL` (override with `NEXT_PUBLIC_SITE_URL`), summary, private paths, AI crawler list                                                                                             |

**Rules:** question-style headings with a 1–3 sentence answer first (`docs/seo.md` §3). Never promise returns (ADR 0005); `seo.test.ts` (S-WEB-20) fails on words like "returns" or "profit". Keep section `id`s stable: answer engines deep-link to them. Bump `updated` when a page changes.
