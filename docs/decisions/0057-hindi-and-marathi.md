# 0057. Hindi and Marathi: typed dictionaries, lazy languages, localized public routes

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

Phase 4 promises a Hindi and Marathi UI (PLAN.md §5). The first circles are friends and family in Maharashtra, many of whom read Hindi or Marathi more easily than English. The app is a static export on Cloudflare Pages (ADR 0011): no server, no middleware, routes use `?id=` query params, `/app/*` is noindex. ADR 0026 already routes every result and problem message through one catalogue (`messages.ts`), and every page must stay light for English users.

## Decision

1. **A small typed dictionary layer, no library** (`apps/web/src/i18n/`). English (`en/`) is the source of truth, one file per namespace (`nav`, `msg`, `loans`, ...). `hi/` and `mr/` are typed as `Dict` (the shape of `en`), so a missing or extra key fails typecheck; a unit test checks that `{params}` and `<tags>` match and that nothing is empty, equal to its key, or an emoji.
   - `useT()` in components (re-renders on a switch via `useSyncExternalStore`, English server snapshot for hydration); `t()` from `runtime.ts` for lib code and `messages.ts`, read at call time. `tn()` picks `_one` / `_other` with `Intl.PluralRules`. `rich()` renders simple inline tags (`<link>`) for links inside sentences. Constants keep keys (`PlainKey`), not text.
   - Dates and numbers through `Intl` with `en-GB` (unchanged English output), `hi-IN-u-nu-latn` and `mr-IN-u-nu-latn`: lakh and crore grouping, Latin digits (plain `mr-IN` prints Devanagari digits). Display only; amounts stay in AVAX or USDT through `src/lib/asset.ts`, never converted to rupees.
   - `messages.ts` keeps its function names, signatures and error codes; only the text moved to the `msg` namespace.
2. **Bundle budget.** Hindi and Marathi load with `import()` only when chosen (about 35 kB gzipped each, once). English core namespaces (`common`, `nav`, `time`, `msg`, `kit`, `wallet`) are in every app page; every other namespace registers itself when a screen imports it (`import "@/i18n/en/loans"`), so its words ship with that screen. A test fails if a file uses a key without importing its namespace. Result: `/app` first load 369 → 380 kB (+11 kB), within the ~15 kB budget.
3. **Choosing a language.** A picker in the app header and on the sign-in page (a native `<select>`: phone picker, no menu library), a Language card in Settings, and language links in the public footer. The choice is saved as `wk.locale` in localStorage (try/catch; listed on the privacy page). With nothing saved, the first browser language we speak wins (hi or mr), else English. `boot.ts` starts loading the saved dictionary before React renders; `LocaleBoot` keeps `<html lang>` in step and follows other tabs.
4. **Scope.** All of `/app` (every screen, button, state, empty state, toast and error), the sign-in page, the first-run checklist and the repayment record page. The CSV history export stays English (a data file). **Push reminder text stays English**: it is built in the indexer Worker, and translating it would mean storing a language per device and a second dictionary in the Worker; revisit after the native-speaker review. The service worker only shows what the Worker sends. `/kit` (dev showcase) stays English.
5. **Public pages: static localized routes (option a).** `/hi/`, `/mr/`, `/hi/start/`, `/mr/start/`, `/hi/how-it-works/`, `/mr/how-it-works/` from `src/app/[lang]/` (`generateStaticParams`, `dynamicParams = false`), copy in `src/content/hi/` and `src/content/mr/` with the same types and section ids. Each has a self canonical, `hreflang` alternates for en, hi, mr and `x-default` (English), and sitemap entries with alternates; the English versions carry the same alternates. The root layout says `lang="en"`, so `scripts/localize-html.mjs` sets `lang="hi"` / `"mr"` in the exported HTML after `next build`, and a small client effect sets it on client navigation. FAQ, rules, security, the legal pages and `llms.txt` stay English; localized pages link to them marked as English, and their footer says the English legal text governs (lawyer review pending, ADR 0055). Visiting a localized page saves the language, so "Open app" opens in it.
6. **Fonts.** Noto Sans Devanagari (UI and numbers) and Noto Serif Devanagari (display), self-hosted through `next/font`, devanagari subset only, never preloaded. They join the font stacks only when `<html lang>` is hi or mr, and their `unicode-range` means a browser downloads them only for Devanagari text, so English pages never fetch them. Under hi and mr, body line height is 1.7 and headings 1.35 (matras need room), and positive letter-spacing is dropped (it pulls conjuncts apart). Generous whitespace still applies: text wraps, never shrinks.
7. **Words.** Natural, everyday Hindi and Marathi, not word-for-word and not Sanskritised; AVAX, USDT, Core, Avalanche, Fuji and Snowtrace stay as they are. The glossary is in `docs/i18n.md`. ADR 0024 applies in every language: a banned-word list with Hindi and Marathi equivalents is checked on public copy and on the onboarding and app namespaces. A native speaker of each language must review before mainnet (TODO).

## Alternatives considered

- **next-intl / react-i18next / Lingui.** next-intl's routing and server features assume middleware or a server; on a static export it adds runtime for little gain. react-i18next brings i18next (~15 kB gzipped) plus its own loading model, and none of them give compile-time key and param checks against the English file without extra codegen. The custom layer is about 2 kB and fully typed.
- **One bundle with all three languages.** Simple, but every English user would download ~70 kB of Devanagari text.
- **Client-side switch only for public pages (option b).** Search engines would only ever see English; static localized routes are cheap in a static export and let Hindi and Marathi searches find the guide.
- **Multiple root layouts for `<html lang>`.** Correct in principle, but it means moving every route into route groups and loses the shared 404; a post-build rewrite of six files is smaller and is tested.
- **Hind / Mukta fonts.** Fine faces, but Noto pairs a serif with a sans, so display headings keep a serif voice in Devanagari too.

## Consequences

- Every new string needs three entries; typecheck and `i18n.test.ts` catch gaps. How-to in `docs/i18n.md`.
- Screens that use a non-core namespace must import it (test-enforced).
- English output is byte-identical, so existing tests and E2E selectors keep working; Hindi and Marathi E2E select by dictionary values (S-I18N-20..24).
- Hindi or Marathi users may see English for a moment on first load while the dictionary downloads.
- The translations need a native-speaker review before mainnet; until then they are the team's best effort.
