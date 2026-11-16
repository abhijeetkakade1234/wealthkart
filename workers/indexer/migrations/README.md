# workers/indexer/migrations

**What's here:** D1 schema migrations, applied in order by `wrangler d1 migrations apply`.
**Open this when:** changing the indexer.

**Key files**

- `0001_init.sql`: `meta`, `circles`, `logs`
- `0002_alerts.sql`: `alerts` (contract monitoring, ADR 0041)
- `0003_push.sql`: reminder devices, per-circle settings, sent stages, nonces, rate limits (ADR 0052)
