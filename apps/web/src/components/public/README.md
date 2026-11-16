# components/public

**What's here:** pieces for the public (indexed) pages: `PublicArticle` renders a page from `src/content/pages.ts` (its `BlockView` also draws the warning box and link lists); `JsonLd` writes structured data. `StartGuide` lays out the `/start` onboarding guide (ADR 0054) with the line drawings in `start-art.tsx`; `start.css` and the tiny client `StartMotion` trace them once as they scroll in, never with reduced motion.
**Open this when:** changing how help pages look. The header and footer live in `src/app/(public)/layout.tsx`.

Server components only, except `StartMotion` (an IntersectionObserver, no wallet code); no wallet code loads on public pages (`docs/seo.md` §2 performance budget).
