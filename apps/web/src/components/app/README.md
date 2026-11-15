# components/app

**What's here:** the shared app layout (ADR 0023): `AppShell` (top bar, desktop sidebar, mobile bottom bar) and `PageHeader`. Every page under `/app` uses these so layouts stay identical.
**Open this when:** changing navigation or page structure. Circle-only nav items stay disabled until a circle is selected.

**Key files**

- `app-shell.tsx`, `page-header.tsx`, `circle-switcher.tsx`, `circle-not-found.tsx`: layout and circle navigation
- `pagination.tsx`: URL-state pagination (`?page=`, or another param for a second list)
- `countdown-utc.tsx`, `deadline.tsx`: due dates and any on-chain moment in UTC plus local time, with time left (`pastText` once it has passed)
- `stat-card.tsx`: big-number tile
- `tx-for.tsx`: `TxFor`, the transaction tracker for one `useTx` state, hidden while idle
