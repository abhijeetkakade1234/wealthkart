# apps/web

**What's here:** the WealthKart PWA: Next.js 15 (App Router) built as a static export for Cloudflare Pages (ADR 0011).
**Open this when:** working on any screen, the landing page, wallet connection or the UI kit.

**Key files**

| Path                         | Purpose                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `src/app/globals.css`        | "Gallery" theme tokens for Tailwind v4 + shadcn (ADR 0025), z-index scale       |
| `src/app/layout.tsx`         | Fonts, metadata, app error boundary, Toaster, global error handlers             |
| `src/app/page.tsx`           | Landing placeholder (real landing designed later)                               |
| `src/app/kit/`               | `/kit` dev showcase: every interaction-kit component in every state (noindex)   |
| `src/components/kit/`        | Interaction kit (ADR 0026): Button, StateView, TxTracker, ErrorBoundary, alerts |
| `src/components/ui/`         | shadcn primitives restyled to Gallery (button, dialog, tooltip, skeleton)       |
| `src/lib/messages.ts`        | Plain-language message catalogue + `toFriendlyError`                            |
| `src/lib/safe-call.ts`       | `safeCall`: timeout, one retry, fallback, typed `FriendlyError`; never throws   |
| `src/lib/toast.ts`           | `notify` toast helpers on sonner (errors stay until dismissed)                  |
| `src/lib/utils.ts`           | shadcn `cn()` helper                                                            |
| `scripts/check-no-emoji.mjs` | Fails lint if any `src/**/*.{ts,tsx}` contains an emoji (S-UX-08)               |
| `vitest.config.ts`           | Vitest + jsdom + Testing Library setup (`vitest.setup.ts`)                      |
| `components.json`            | shadcn config (components go to `src/components/ui`)                            |
| `next.config.ts`             | `output: "export"`, trailing slashes, unoptimised images                        |

**Rules:** follow `docs/ui.md` (one layout, pagination in URL, 300 ms search, eight UI states, plain-language messages, no emojis, generous whitespace). Money is `bigint` wei; previews use `@wealthkart/rules`.

**Depends on / used by:** `@wealthkart/rules` (later `@wealthkart/sdk`) / end users.

Commands: `pnpm dev`, `pnpm build` (outputs `out/`), `pnpm lint` (ESLint + no-emoji check), `pnpm typecheck`, `pnpm test` (Vitest).

**Deploy (Cloudflare Pages, project `wealthkart`):** one-time `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN`), then `pnpm --filter @wealthkart/web deploy:preview` for a preview URL or `deploy:prod` for production. `public/_headers` sets security headers; `wrangler.toml` points Pages at `out/`.
