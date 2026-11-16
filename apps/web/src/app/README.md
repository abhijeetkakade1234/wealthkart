# apps/web/src/app

**What's here:** Next.js App Router routes for the static export.
**Open this when:** adding a page or a build-time file (robots, sitemap, llms, icons).

**Key files**

- `(public)/`: indexed pages (landing, how-it-works, rules, security, faq, privacy, terms, risks), own README
- `[lang]/`: `/hi/` and `/mr/` (ADR 0057): landing, `start/` and `how-it-works/` in Hindi and Marathi, statically generated for `hi` and `mr` only (`dynamicParams = false`); `layout.tsx` renders the public frame in that language. `<html lang>` is fixed after the build by `scripts/localize-html.mjs`
- `app/`: the wallet app under `/app/*` (noindex), own README
- `login/`: `/login` sign-in screen (noindex, blocked in robots.txt); own layout with wallet providers, no app shell
- `record/`: `/record/?address=` public repayment record (ADR 0042); noindex, works without a wallet
- `kit/`: `/kit` showcase of the interaction kit and art (noindex)
- `layout.tsx`, `globals.css`: root layout, fonts, Gallery tokens
- `robots.ts`, `sitemap.ts`, `manifest.ts`: build-time SEO and PWA files
- `*.md/`, `llms*.txt/`, `og/`, `icon-*.png/`, `apple-touch-icon.png/`: build-time route handlers for Markdown twins, llms files, OG images and icons

Route folders that hold a single `page.tsx` or `route.ts` are described here or in their parent README (docs/engineering.md §1).
