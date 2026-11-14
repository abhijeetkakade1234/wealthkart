# 0027. Public page content lives in typed TypeScript, not MDX

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

ADR 0024 and `docs/seo.md` said a small MDX source would feed the public pages, `/llms.txt`, `/llms-full.txt` and the `.md` twins, and that OG images would use `opengraph-image.tsx`. While building it on the static export (ADR 0011) two things came up:

- MDX needs extra build plugins and still has to be parsed a second time to produce Markdown for llms.txt and FAQ/HowTo JSON-LD.
- Next's `opengraph-image` and `apple-icon` conventions export files with no extension (`/faq/opengraph-image-15ulhu`), which Cloudflare Pages serves with the wrong content type.

## Decision

- Public content is typed data in `apps/web/src/content/pages.ts`: each page is a list of sections, each a question heading, a 1–3 sentence direct answer and optional blocks (paragraph, list, steps, table).
- One renderer turns it into HTML (`components/public/public-article.tsx`); another turns it into Markdown (`lib/seo/markdown.ts`) for the `.md` twins and llms files; JSON-LD is built from the same data (`lib/seo/json-ld.ts`).
- OG cards and icons are build-time route handlers with real file names (`/og/<slug>.png`, `/icon-192.png`, `/apple-touch-icon.png`), wired in metadata explicitly.
- Contract addresses on `/security` come from `@wealthkart/sdk` deployments, so they update with each deploy.

## Alternatives considered

- MDX with a remark pipeline: more dependencies, and Markdown output and schema extraction would need a second parse. Rejected for now; revisit if non-developers start editing copy or the blog lands (Phase 4).
- Keep `opengraph-image.tsx` and patch content types in `_headers`: relies on splat rules for hashed names. Rejected.

## Consequences

- Copy edits are TypeScript edits; the type checker catches missing answers or broken tables.
- The GEO shape (question + direct answer) is enforced by the data type, and tests check copy rules (no advertised returns, title and description lengths).
- The blog (Phase 4) will likely need MDX; that will get its own ADR.
