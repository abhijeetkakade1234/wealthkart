# 0047. Indexer stays inside D1's free tier

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

The founder runs Cloudflare on the free tier, where a D1 database holds at most 500 MB. The indexer (ADR 0036) stores one row per circle event (about 0.5–1 KB with its index). A 12-member circle writes roughly 15–25 events a month, about 250 KB a year; a 50-member circle (the cap, ADR 0045) about 1 MB a year. 500 MB therefore covers around 2,000 typical circle-years, plenty for the pilot and beta, but it must never fail silently.

## Decision

- Every write reads D1's `size_after` and stores it (`db_size`).
- At a soft limit, `D1_SOFT_LIMIT_MB`, default 450, the indexer stops storing new events and stops moving its cursor (`db_full`). The API keeps serving what it has.
- The app already treats an indexer that is behind as normal: it reads history up to the indexer's cursor and every newer block from the RPC (ADR 0036). So it keeps working, just slower for the newest blocks.
- `/v1/health` shows `sizeBytes` and `full`, and the cron sends an `index-full` alert to the webhook (ADR 0041).

## Alternatives considered

- **Delete old events:** the chain is the source of truth, so this is safe. It's the next step when needed: drop events of dissolved circles, or events older than the charts use.
- **Shard across databases:** the free tier allows 10 databases. Sharding by circle address would multiply capacity, but it's not worth the complexity yet.
- **Paid plan:** off the table (CLAUDE.md, free tier only).

## Consequences

- Reaching the limit is visible (health, alert) and harmless to correctness.
- Before it happens, add pruning or sharding. The alert gives weeks of warning at the expected growth.
