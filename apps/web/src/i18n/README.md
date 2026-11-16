# src/i18n

**What's here:** the app's languages (ADR 0057): a small typed dictionary layer, no library. English (`en/`) is the source of truth; Hindi (`hi/`) and Marathi (`mr/`) mirror its keys and load on demand.
**Open this when:** adding or changing any text the app shows, or touching language switching, fonts or date/number formatting. How-to and glossary: `docs/i18n.md`.

**Key files**

| Path                     | Purpose                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `config.ts`              | `LOCALES`, names for the switcher, `Intl` tags (`en-GB`, `hi-IN`, `mr-IN`), browser detection    |
| `runtime.ts`             | `t`, `tn` (plurals), `formatDate`, `formatNumber`, `setLocale`; lazy-loads `hi` / `mr`           |
| `react.tsx`              | `useT()` hook, `LocaleBoot`, `chooseLocale`, `RememberLocale`, `rich()` for inline tags          |
| `boot.ts`                | Starts loading the saved language before React renders (app and sign-in only)                    |
| `types.ts`               | `Dict` (shape every language fills), `Key`, typed `{params}`, `PlainKey`, `PluralKey`            |
| `en/`, `hi/`, `mr/`      | One file per namespace (`nav`, `msg`, `loans`, ...), `index.ts` joins them                       |
| `__tests__/i18n.test.ts` | Same keys, same `{params}` and `<tags>`, nothing empty, banned "returns" words in every language |

**Rules:** never hard-code English in `/app`, `/login` or the checklist. In render, use `t` from `useT()`; the plain `t` from `runtime.ts` is for non-React code and event handlers. Money stays in AVAX/USDT via `src/lib/asset.ts`. No emojis.
