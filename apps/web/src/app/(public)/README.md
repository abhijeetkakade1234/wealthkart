# app/(public)

**What's here:** the indexed pages (ADR 0024): `/` (landing placeholder), `/how-it-works`, `/rules`, `/security`, `/faq`, sharing one header/footer layout (`layout.tsx`). The route group doesn't change URLs.
**Open this when:** adding a public page. Add its content to `src/content/pages.ts` and it gets a sitemap entry, a `.md` twin, an llms.txt link, JSON-LD and an OG card (`/og/<slug>.png`). Also add a `<slug>.md/route.ts` next to the other twins in `src/app/`.

Build-time text and image routes in `src/app/`: `robots.ts`, `sitemap.ts`, `manifest.ts`, `llms.txt/`, `llms-full.txt/`, `<slug>.md/`, `og/[file]/`, `icon-*.png/`, `apple-touch-icon.png/`, `icon.svg`.
