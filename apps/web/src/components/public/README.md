# components/public

**What's here:** pieces for the public (indexed) pages: `PublicArticle` renders a page from `src/content/pages.ts` or `src/content/legal.ts` (with the draft note on legal pages, ADR 0055); `JsonLd` writes structured data.
**Open this when:** changing how help pages look. The header and footer live in `src/app/(public)/layout.tsx`.

Server components only; no wallet code loads on public pages (`docs/seo.md` §2 performance budget).
