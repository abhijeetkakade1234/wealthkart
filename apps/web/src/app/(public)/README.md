# app/(public)

**What's here:** the indexed pages (ADR 0024): `/` (landing, ADR 0049; sections in `src/components/landing/`, copy in `src/content/landing.ts`), `/how-it-works`, `/rules`, `/security`, `/faq`, `/start` (onboarding guide, ADR 0054; rendered by `components/public/start-guide.tsx`), and the legal pages `/privacy`, `/terms`, `/risks` (ADR 0055, content in `src/content/legal.ts`, linked from the footer's Legal row only), sharing one header/footer layout (`layout.tsx`). The route group doesn't change URLs.
**Open this when:** adding a public page. Add its content to `src/content/pages.ts` and it gets a sitemap entry, a `.md` twin, an llms.txt link, JSON-LD and an OG card (`/og/<slug>.png`). Also add a `<slug>.md/route.ts` next to the other twins in `src/app/`.

Build-time text and image routes in `src/app/`: `robots.ts`, `sitemap.ts`, `manifest.ts`, `llms.txt/`, `llms-full.txt/`, `<slug>.md/`, `og/[file]/`, `icon-*.png/`, `apple-touch-icon.png/`, `icon.svg`.
