# components/app

**What's here:** the shared app layout (ADR 0023): `AppShell` (top bar, desktop sidebar, mobile bottom bar) and `PageHeader`. Every page under `/app` uses these so layouts stay identical.
**Open this when:** changing navigation or page structure. Circle-only nav items stay disabled until a circle is selected.

**Key files**

- `app-shell.tsx`, `page-header.tsx`, `circle-switcher.tsx`, `circle-not-found.tsx`: layout and circle navigation
- `language-switcher.tsx`: `LanguageMenu` (header and sign-in, a native select) and `LanguageSwitcher` (Settings), ADR 0057
- `pagination.tsx`: URL-state pagination (`?page=`, or another param for a second list)
- `first-run-checklist.tsx`: "Before you start" on the home screen for a new wallet; links to `/start` steps, dismissible per wallet (ADR 0054)
- `countdown-utc.tsx`, `deadline.tsx`: due dates and any on-chain moment in UTC plus local time, with time left (`pastText` once it has passed)
- `stat-card.tsx`: big-number tile
- `tx-for.tsx`: `TxFor`, the transaction tracker for one `useTx` state, hidden while idle
- `test-usdt-faucet.tsx`: `TestUsdtFaucet`, the "Get test USDT" box (test network builds only, ADR 0053) on the empty dashboard and USDT Pay pages
- `asset-pay.tsx`: `AssetBadge` (AVAX / USDT pill on circle headers and cards), `PayButton` and `PayProgress` (USDT: "Approve" then "Pay" steps with their states) for `useAssetPayment`
