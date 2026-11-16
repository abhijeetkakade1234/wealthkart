# workers/indexer/test

**What's here:** unit tests for the indexer, run on Node's built-in SQLite with the real migrations.
**Open this when:** changing the indexer.

**Key files**

- `indexer.test.ts` (S-IDX-01..05), `sqlite-d1.ts` (the D1 subset on node:sqlite)
- `monitor.test.ts` (S-MON-*)
- `push-schedule.test.ts` (S-REM-01..09), `push-auth.test.ts` (S-REM-10..15), `push-api.test.ts` (S-REM-20..31), `push-helpers.ts` (test signer, device keys, a decryptor that reads pushes like a browser)
