# 0036. Indexer: a Cloudflare Worker with D1

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Charts and the activity feed need each circle's full event history (ADR 0034). Reading it straight from a public RPC means one `eth_getLogs` call per 2048 blocks; at about 2 seconds per block on Avalanche, a year-old circle needs thousands of calls. PLAN.md named three options: AvaCloud Data API, The Graph, or a small Cloudflare Worker. The stack is already Cloudflare (Pages, Workers, D1, Cron), there's no paid service (CLAUDE.md), and the app keeps no personal data.

## Decision

A Cloudflare Worker with a D1 database, in `workers/indexer` (founder decision, 2026-11-15).

- **What it stores:** circles the factory created (`CircleCreated`), and every event of those circles, decoded with the vault ABI, keyed by (circle, block, log index). Public chain data only: addresses, amounts, display names already on-chain. No keys, no secrets.
- **How it catches up:**
  - A cron runs every minute and reads block ranges after its cursor: first the factory's new circles, then all known circles' events for the same range (100 addresses per call).
  - Writes are idempotent (`INSERT OR IGNORE`), and the cursor only moves forward, so overlapping runs are harmless.
  - It stays `CONFIRMATIONS` blocks behind the tip (1 on Fuji; Avalanche finalises in about a second).
- **API:** `GET /v1/circles/:address/logs?fromBlock&fromLogIndex&limit` (paged, at most 2000 a page) and `GET /v1/health`. It's read-only with open CORS, because the data is public anyway. Inputs are validated and all SQL is parameterised. Each request first catches up a few chunks (at most every 5 seconds), so it's fresh without waiting for the cron.
- **The app:** with `NEXT_PUBLIC_INDEXER_URL` set, `useCircleEvents` reads history from the indexer up to its `indexedTo`, then only the newer blocks from the RPC. If the indexer fails, or serves a different chain, the app reads the RPC directly as before. The indexer is a speed-up, never a source of truth the app depends on.
- **Bigints** travel as `{"$n":"123"}` and are revived in the app.
- **Tests:**
  - Unit tests run the real SQL migrations on Node's built-in SQLite through the same small D1 interface.
  - E2E runs `wrangler dev --env e2e` against anvil, so every chart and feed test goes through the indexer.
- **Deploy:** the manual workflow `deploy-indexer.yml` (owner action, after the Fuji deploy). It needs a Cloudflare API token, the account id, the D1 database id and the factory address.

## Alternatives considered

- **AvaCloud Data API:** hosted and fast, but needs an API key from day one, adds a vendor, and has rate limits we don't control.
- **The Graph:** a mature indexer, but needs a subgraph and Studio account, and the Fuji support and free tier are less certain than Cloudflare's.
- **Only the RPC (ADR 0034):** stays the fallback, but too slow for old circles.

## Consequences

- One more thing to deploy and watch. The app works without it, only slower.
- D1 free tier: 5 GB and plenty of reads for this scale. If a circle's history grows past one response, paging handles it.
- A future vault version with new events only needs its ABI in `@wealthkart/sdk`. Unknown events are skipped, not stored raw.
