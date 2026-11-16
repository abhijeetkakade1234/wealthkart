# workers/indexer/src/push

**What's here:** payment reminders by Web Push (ADR 0052), inside the indexer Worker.
**Open this when:** changing what gets reminded, the push API, or how pushes are sent.

**Key files**

- `api.ts`: `POST /v1/push/subscribe | unsubscribe | settings | circle | test`, body and rate limits
- `auth.ts`: Sign-In with Ethereum check (site, chain, action, device, expiry, nonce), device tokens
- `validate.ts`: push endpoint allowlist (https push services only), key sizes, circle lists
- `schedule.ts`: pure "what is due now" per member and circle, UTC stages, vote grouping, copy
- `time.ts`: UTC period and due-moment maths (mirrors `packages/rules/src/periods.ts`)
- `kinds.ts`: the reminder kind bitmask (mirrored in `apps/web/src/lib/push.ts`)
- `reader.ts`: viem reads for circle and member state, in JSON-RPC batches
- `send.ts`: encrypt (RFC 8291) and sign (VAPID, RFC 8292) with `@block65/webcrypto-web-push`; 404/410 means the device is gone
- `step.ts`: the cron step: due pairs, dedupe, send within a budget, next look in an hour
- `store.ts`: D1 queries for the `push_*` tables
