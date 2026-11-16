# 0041. Contract monitoring in the indexer Worker

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Phase 3 needs "monitoring and alerts on contracts" before real money goes in. The contracts are immutable and the indexer Worker (ADR 0036) already runs every minute on Cloudflare's free tier. Paid monitoring services are off the table (CLAUDE.md).

## Decision

The indexer's cron also checks circles, `MONITOR_BATCH` (25) per run, round robin, for the invariant that must never break: **the vault's AVAX balance is at least its cash** (`totalAssets - loansOutstanding`). Refused payouts in `withdrawable` only add to the balance, so `balance < cash` always means money is missing.

- A broken check writes an alert row (`alerts` table: circle, kind, detail, first and last seen). A later passing check marks it resolved.
- `GET /v1/alerts` lists open alerts (public, like all indexer data).
- If the `ALERT_WEBHOOK_URL` secret is set, new alerts are posted as Slack/Discord-style JSON (`text` and `content`). Webhook failures never stop indexing.
- RPC errors are skipped, not alerted; the circle is checked again on its next turn.

## Alternatives considered

- **OpenZeppelin Defender / Tenderly alerts:** strong tools, but paid at the scale we'd need, and they add an account the circles depend on.
- **Checking every circle every minute:** too many RPC calls on a public endpoint. Round robin covers 25 circles a minute, about 36,000 checks a day.

## Consequences

- More checks (exit queue stuck, interest never paid) can be added as new alert kinds without touching the contracts.
- The webhook is an owner action at deploy time, kept as a Worker secret, never in the repo.
