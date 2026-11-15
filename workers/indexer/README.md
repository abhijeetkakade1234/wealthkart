# workers/indexer

**What's here:** the Cloudflare Worker + D1 that caches public circle events, so charts and the activity feed load fast (ADR 0036). No keys, no personal data.
**Open this when:** changing what gets indexed, the API, or deploying it.

**Key files**

| Path                       | Purpose                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `src/index.ts`             | Worker entry: `fetch` (API) and `scheduled` (cron every minute)                               |
| `src/indexer.ts`           | `indexStep`: catch up block ranges after the cursor, factory circles first, then their events |
| `src/chain.ts`             | viem reader: `CircleCreated` from the factory, decoded vault events for many circles at once  |
| `src/store.ts`             | D1 queries (parameterised), forward-only cursor, idempotent inserts                           |
| `src/api.ts`               | `GET /v1/health`, `GET /v1/circles/:address/logs?fromBlock&fromLogIndex&limit` (open CORS)    |
| `src/codec.ts`             | Bigint-safe JSON (`{"$n":"123"}`)                                                             |
| `migrations/0001_init.sql` | `meta`, `circles`, `logs` tables                                                              |
| `test/`                    | Unit tests on Node's built-in SQLite through the same D1 interface (`sqlite-d1.ts`)           |
| `wrangler.toml`            | Fuji settings, D1 binding, cron; `[env.e2e]` points at the local anvil chain                  |

**Commands:** `pnpm test`, `pnpm typecheck`, `pnpm dev` (needs a local D1: `pnpm migrate:local` first). E2E starts it for you (`apps/web/e2e/indexer.mjs`).

**Deploy (owner action, after the Fuji deploy):** `wrangler d1 create wealthkart-indexer`, put the id and the factory address in `wrangler.toml`, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to the `fuji` environment, run the **Deploy indexer** workflow, then set `NEXT_PUBLIC_INDEXER_URL` for the web build.
