# workers/indexer

**What's here:** the Cloudflare Worker + D1 that caches public circle events, so charts and the activity feed load fast (ADR 0036), and sends payment reminders by Web Push (ADR 0052). No personal data: reminders are keyed by wallet address and the device's push endpoint only.
**Open this when:** changing what gets indexed, the API, or deploying it.

**Key files**

| Path             | Purpose                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`   | Worker entry: `fetch` (API) and `scheduled` (cron every minute)                                                                 |
| `src/indexer.ts` | `indexStep`: catch up block ranges after the cursor, factory circles first, then their events                                   |
| `src/chain.ts`   | viem reader: `CircleCreated` from the factory, decoded vault events for many circles at once                                    |
| `src/store.ts`   | D1 queries (parameterised), forward-only cursor, idempotent inserts                                                             |
| `src/api.ts`     | `GET /v1/health`, `GET /v1/alerts`, `GET /v1/circles/:address/logs?fromBlock&fromLogIndex&limit`, `POST /v1/push/*` (open CORS) |
| `src/monitor.ts` | Contract monitoring (ADR 0041): solvency check per circle, alerts table, webhook                                                |
| `src/codec.ts`   | Bigint-safe JSON (`{"$n":"123"}`)                                                                                               |
| `src/push/`      | Reminders (ADR 0052): push API, SIWE check, schedule, chain reader, sender, cron step (own README)                              |
| `scripts/`       | `vapid-keys.mjs`: makes a VAPID key pair (`pnpm vapid:keys`)                                                                    |
| `migrations/`    | `0001_init.sql` (`meta`, `circles`, `logs`), `0002_alerts.sql` (`alerts`), `0003_push.sql` (reminders)                          |
| `test/`          | Unit tests on Node's built-in SQLite through the same D1 interface (`sqlite-d1.ts`)                                             |
| `wrangler.toml`  | Fuji settings, D1 binding, cron; `[env.e2e]` points at the local anvil chain                                                    |

**Free tier:** D1 allows 500 MB per database. At `D1_SOFT_LIMIT_MB` (450) the indexer stops storing new events and raises an `index-full` alert; the app reads newer blocks from the RPC (ADR 0047).

**Reminders (ADR 0052):** the same cron looks at up to 10 (wallet, circle) pairs a minute, each about once an hour, reads their state by RPC and sends at most 20 pushes a run. The push API:

| Route                       | Body                                                        | Auth                        |
| --------------------------- | ----------------------------------------------------------- | --------------------------- |
| `POST /v1/push/subscribe`   | `message`, `signature`, `subscription`, `circles[]`         | SIWE message signed in Core |
| `POST /v1/push/unsubscribe` | `endpoint` + `token`, or `endpoint`, `message`, `signature` | device token or SIWE        |
| `POST /v1/push/settings`    | `endpoint`, `token`                                         | device token                |
| `POST /v1/push/circle`      | `endpoint`, `token`, `circle`, `kinds` (0..31)              | device token                |
| `POST /v1/push/test`        | `endpoint`, `token`                                         | device token                |

It answers 503 until `VAPID_PUBLIC_KEY` and the `VAPID_PRIVATE_KEY` secret are set. `APP_DOMAINS` lists the sites allowed in signed messages. `PUSH_EXTRA_ORIGINS` is for E2E only.

**Commands:** `pnpm test`, `pnpm typecheck`, `pnpm dev` (needs a local D1: `pnpm migrate:local` first). E2E starts it for you (`apps/web/e2e/indexer.mjs`).

**Networks (ADR 0051):** the top of `wrangler.toml` is Fuji; `[env.mainnet]` is mainnet with its own D1 database. The **Deploy indexer** workflow takes the network as an input.

**Deploy (owner action, after the Fuji deploy):** `wrangler d1 create wealthkart-indexer`, put the id and the factory address in `wrangler.toml`, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to the `fuji` environment, run the **Deploy indexer** workflow, then set `NEXT_PUBLIC_INDEXER_URL` for the web build.

**Reminders (owner action):** `pnpm vapid:keys`, put the public key in `VAPID_PUBLIC_KEY` here and in the Pages variable `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, then `pnpm exec wrangler secret put VAPID_PRIVATE_KEY` (add `--env mainnet` with a separate pair for mainnet). Check that `APP_DOMAINS` matches the site's real domain. The deploy workflow applies the `0003_push.sql` migration.
