# src/lib/seo

**What's here:** build-time SEO helpers for the public pages (ADR 0024, 0027).
**Open this when:** changing metadata, JSON-LD, llms.txt output, OG cards or app icons.

| File            | Purpose                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `metadata.ts`   | `pageMetadata()`: title, description, canonical, Open Graph, Twitter, OG image path         |
| `json-ld.ts`    | Organization, WebSite, SoftwareApplication, FAQPage, HowTo, TechArticle; safe `serializeLd` |
| `markdown.ts`   | Page → Markdown twin, `/llms.txt`, `/llms-full.txt`                                         |
| `og.tsx`        | 1200×630 OG card renderer (used by `app/og/[file]/route.ts`)                                |
| `icon.tsx`      | App icon renderer (ring + three dots) for the PNG icon routes                               |
| `text-route.ts` | Plain-text `Response` helper for the text routes                                            |

Tests: `src/lib/__tests__/seo.test.ts` (S-WEB-18 to S-WEB-21).
