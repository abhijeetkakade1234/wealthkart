# components/public

**What's here:** pieces for the public (indexed) pages: `PublicArticle` renders a page from `src/content/pages.ts` or `src/content/legal.ts` (with the draft note on legal pages, ADR 0055; its `BlockView` also draws the warning box and link lists); `JsonLd` writes structured data. `StartGuide` lays out the `/start` onboarding guide (ADR 0054) with the line drawings in `start-art.tsx`; `start.css` and the tiny client `StartMotion` trace them once as they scroll in, never with reduced motion.

`PublicFrame` (`public-frame.tsx`) is the header and footer for every public page in English, Hindi or Marathi (ADR 0057), with the footer's language row (`language-links.tsx`, a tiny client component reading the path) and, in hi/mr, the note that the English legal text governs. `LocaleEffects` sets `<html lang>` and remembers the language on `/hi/` and `/mr/` pages; it imports no dictionary. `PublicArticle` and `StartGuide` take a `locale` for their labels and dates.

**Open this when:** changing how help pages look, or the public header and footer.

Server components only, except `StartMotion` (an IntersectionObserver, no wallet code), `LanguageLinks` and `LocaleEffects`; no wallet code loads on public pages (`docs/seo.md` §2 performance budget).
