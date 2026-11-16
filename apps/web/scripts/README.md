# apps/web/scripts

**What's here:** build-time checks run by `pnpm lint`, and the local dev runner.
**Open this when:** the no-emoji check fails, or `pnpm dev:local` misbehaves.

**Key files**

- `check-no-emoji.mjs`: fails if any `src/**/*.{ts,tsx}` contains an emoji (S-UX-08); its test sits alongside
- `dev-local.mjs`: `pnpm dev:local` (ADR 0053): anvil, contract deploy (`../e2e/support/local-chain.cjs`), test USDT, `.env.local`, `next dev`, optional indexer; Ctrl+C stops it all. Usage in `../README.md`
