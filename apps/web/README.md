# apps/web

**What's here:** the WealthKart PWA: Next.js 15 (App Router) built as a static export for Cloudflare Pages (ADR 0011).
**Open this when:** working on any screen, the landing page, wallet connection or the UI kit.

**Key files**

| Path                  | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `src/app/globals.css` | "Gallery" theme tokens for Tailwind v4 + shadcn (ADR 0025)     |
| `src/app/layout.tsx`  | Fonts (Instrument Serif, Hanken Grotesk, Geist Mono), metadata |
| `src/app/page.tsx`    | Landing placeholder (real landing designed later)              |
| `src/lib/utils.ts`    | shadcn `cn()` helper                                           |
| `components.json`     | shadcn config (components go to `src/components/ui`)           |
| `next.config.ts`      | `output: "export"`, trailing slashes, unoptimised images       |

**Rules:** follow `docs/ui.md` (one layout, pagination in URL, 300 ms search, eight UI states, plain-language messages, no emojis, generous whitespace). Money is `bigint` wei; previews use `@wealthkart/rules`.

**Depends on / used by:** `@wealthkart/rules` (later `@wealthkart/sdk`) / end users.

Commands: `pnpm dev`, `pnpm build` (outputs `out/`), `pnpm lint`, `pnpm typecheck`.
