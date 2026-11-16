# apps/web

**What's here:** the WealthKart PWA: Next.js 15 (App Router) built as a static export for Cloudflare Pages (ADR 0011).
**Open this when:** working on any screen, the landing page, wallet connection or the UI kit.

**Key files**

| Path                           | Purpose                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/app/globals.css`          | "Gallery" theme tokens for Tailwind v4 + shadcn (ADR 0025), z-index scale                       |
| `src/app/layout.tsx`           | Fonts, metadata, app error boundary, Toaster, global error handlers                             |
| `src/app/(public)/`            | Indexed pages: landing (ADR 0049), how-it-works, rules, security, faq, start (ADR 0054)         |
| `src/app/robots.ts` etc.       | Build-time `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, llms, OG, icons                 |
| `src/content/`                 | Public page copy as typed data (ADR 0027); feeds pages, llms.txt, JSON-LD                       |
| `src/lib/seo/`                 | Metadata, JSON-LD, Markdown/llms output, OG and icon renderers                                  |
| `public/sw.js`                 | Service worker: app-shell cache, never caches RPC; shows reminders and opens their app page     |
| `src/lib/push.ts`              | Reminders (ADR 0052): browser support, SIWE message, push API client; hook `use-reminders.ts`   |
| `src/app/kit/`                 | `/kit` dev showcase: every interaction-kit component in every state (noindex)                   |
| `src/components/landing/`      | Landing sections, hero art, line diagrams, GSAP scroll motion (loaded only on `/`)              |
| `src/components/art/`          | Cut-paper placeholder art + address-seeded Avatar, CircleCover, EmptyArt (ADR 0025)             |
| `src/components/kit/`          | Interaction kit (ADR 0026): Button, StateView, TxTracker, ErrorBoundary, alerts                 |
| `src/components/ui/`           | shadcn primitives restyled to Gallery (button, dialog, tooltip, skeleton)                       |
| `src/lib/messages.ts`          | Plain-language message catalogue + `toFriendlyError`; text in the `msg` namespace               |
| `src/i18n/`                    | English, Hindi, Marathi dictionaries, `useT`/`t`, language switching (ADR 0057, `docs/i18n.md`) |
| `src/lib/safe-call.ts`         | `safeCall`: timeout, one retry, fallback, typed `FriendlyError`; never throws                   |
| `src/lib/toast.ts`             | `notify` toast helpers on sonner (errors stay until dismissed)                                  |
| `src/lib/utils.ts`             | shadcn `cn()` helper                                                                            |
| `scripts/check-no-emoji.mjs`   | Fails lint if any `src/**/*.{ts,tsx}` contains an emoji (S-UX-08)                               |
| `scripts/dev-local.mjs`        | `pnpm dev:local`: anvil + contracts + test USDT + `next dev` on a PC (ADR 0053)                 |
| `vitest.config.ts`             | Vitest + jsdom + Testing Library setup (`vitest.setup.ts`)                                      |
| `lighthouserc.json`            | Lighthouse budget run in CI on the static export: public pages ≥ 0.9 perf, ≥ 0.95 a11y and SEO  |
| `e2e/`, `playwright.config.ts` | Playwright E2E against a local anvil chain with a fake Core wallet (see `e2e/README.md`)        |
| `components.json`              | shadcn config (components go to `src/components/ui`)                                            |
| `next.config.ts`               | `output: "export"`, trailing slashes, unoptimised images                                        |

**Rules:** follow `docs/ui.md` (one layout, pagination in URL, 300 ms search, eight UI states, plain-language messages, no emojis, generous whitespace). Money is `bigint` in the circle asset's smallest unit (AVAX wei or USDT 1e-6, ADR 0046): format and parse only through `src/lib/asset.ts`, pay only through `useAssetPayment`; previews use `@wealthkart/rules`.

**Depends on / used by:** `@wealthkart/rules` (later `@wealthkart/sdk`) / end users.

**Run it on your PC (`pnpm dev:local`, ADR 0053).** From the repo root (Windows PowerShell, Git Bash, macOS or Linux): `pnpm dev:local`. It runs `forge build` (Foundry from `FOUNDRY_DIR` or `~/.foundry`), builds the rules and sdk packages, starts anvil on `127.0.0.1:8545` with chain id 43113 (the app treats it as Fuji), deploys the factory, its libraries and the faucet test USDT with the same code as the E2E setup (`e2e/support/local-chain.cjs`), gives anvil test wallets #1 to #5 1,000 test USDT each (they already hold 10,000 AVAX), writes `.env.local` (`NEXT_PUBLIC_NETWORK=fuji`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_FACTORY_OVERRIDE`, `NEXT_PUBLIC_INDEXER_URL`) and starts `next dev` on port 3000. Options: `--indexer` also runs the indexer Worker (`wrangler dev --env e2e` with its own D1 folder `workers/indexer/.wrangler-local`); `--fund 0xYourWallet` (repeatable, or `DEV_FUND=a,b`) gives that wallet 1,000 AVAX and 1,000 test USDT; `--no-fund` skips the test USDT. Ports: `DEV_ANVIL_PORT`, `DEV_WEB_PORT`, `DEV_INDEXER_PORT`; a busy port is swapped for a free one and printed. **Ctrl+C** (or `q` and Enter) stops every process it started and deletes the generated `.env.local`; if you had your own it is moved to `.env.local.before-dev-local` while running and put back after. The chain starts fresh each time. To use Core, add a custom network with the printed RPC URL and chain id 43113, and import an anvil test key (public mnemonic `test test test test test test test test test test test junk`, fake money only).

Commands: `pnpm dev`, `pnpm dev:local`, `pnpm build` (outputs `out/`), `pnpm lint` (ESLint + no-emoji check), `pnpm typecheck`, `pnpm test` (Vitest).

**Deploy (Cloudflare Pages, project `wealthkart`):** one-time `npx wrangler login` (or set `CLOUDFLARE_API_TOKEN`), then `pnpm --filter @wealthkart/web deploy:preview` for a preview URL or `deploy:prod` for production. `public/_headers` sets security headers and text content types; `wrangler.toml` points Pages at `out/`.
