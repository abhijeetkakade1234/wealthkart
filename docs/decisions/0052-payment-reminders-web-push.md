# 0052. Payment reminders by Web Push from the indexer Worker

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Phase 4 adds reminders (PLAN.md §5). Until now the app showed dues, fees and open votes only when a member opened it, and members found out about a late fee after it started. The constraints are fixed by CLAUDE.md: no personal data (the wallet address is the identity), free tier only, the Cron sends reminders and nothing else, and deadlines are UTC on-chain with local time shown on the device (ADR 0014). The indexer Worker (ADR 0036) already runs a cron every minute next to a D1 database, under a size guard (ADR 0047).

## Decision

**Channel.** Web Push with VAPID (RFC 8030, 8291, 8292), sent from Cloudflare. No email, SMS or chat bot: each of those needs a name, number or handle. The push service only sees an encrypted blob.

**Where it runs.** Inside the existing indexer Worker: same D1, a new migration (`0003_push.sql`), a new step in the same cron, and `POST /v1/push/*` routes. A separate Worker would need its own copy of the circle list and its own deploy, for no gain.

**What is stored** (all keyed by the lowercase wallet address):

- `push_subs`: one row per device: push endpoint, the device's public key and auth secret, and the SHA-256 of a device token. At most 5 devices per wallet; a sixth replaces the oldest.
- `push_watch`: one row per (wallet, circle): a bitmask of reminder kinds and when to look next. At most 100 circles per wallet.
- `push_sent`: the highest stage already sent per topic, pruned after 120 days.
- `push_nonces`, `push_rate`: replay guard and rate-limit counters, pruned hourly.

When a wallet's last device goes, its settings and history are deleted too. A row is a few hundred bytes, so even 10,000 wallets stay far below the ADR 0047 limit; once D1 is full, new devices are refused (existing ones keep working).

**Proof of ownership.** Turning reminders on (or off without the token) needs a Sign-In with Ethereum message (EIP-4361) signed in Core. It names the site (`APP_DOMAINS`, so Core can warn on a look-alike site), the chain, the action, and the first 32 hex of SHA-256(endpoint), so a signature can't be reused for another device or action. It expires in at most 10 minutes and its nonce is accepted once. The Worker checks it with viem's `recoverMessageAddress`, so only plain wallets (EOAs) work; Core is one. A successful sign-up returns a random 32-byte device token; the Worker keeps only its hash. Settings changes, the test button and "turn off" use that token, so one signature per device is enough.

**Endpoints accepted.** https only, standard port, no credentials, at most 1024 characters, and the host must be a known push service (FCM, Mozilla, Apple, Windows). The device key must be a real P-256 point and the secret 16 bytes. The Worker never follows redirects. This keeps the API from becoming a way to make the Worker call arbitrary URLs.

**Rate limits** (fixed windows in D1): subscribe 30/hour per IP and 10/hour per wallet, settings 120/hour per wallet, test pushes 1 per 30 seconds and 10 per day per device. Bodies over 8 KB are refused.

**What reminds, and when** (all UTC, computed by a pure function, `src/push/schedule.ts`):

| Kind (switch)         | Stages                                                                           |
| --------------------- | -------------------------------------------------------------------------------- |
| Installment due       | 3 days before the due day, the day before, on the due day                        |
| Late fee coming       | 6 hours before the due moment; on the second-fee day; once after a missed month  |
| Loan interest         | in the 3 days before the due day; once when it is late                           |
| Votes waiting for you | when a vote this member can cast is open; again when less than 24 hours are left |
| Money to collect      | exit notice over; a refused payout waiting to be withdrawn                       |

Each topic (for example "the December installment") has stages, and a stage is sent at most once; a lower stage is never sent after a higher one, so someone who turns reminders on late gets only the latest. Votes in the same circle are grouped into one notification. Dormant members, months under a payment holiday and closing circles get no installment reminders. Every kind can be switched off per circle.

**Reading the chain.** The cron step takes up to 10 (wallet, circle) pairs whose `next_at` has passed, reads circle and member state by RPC (JSON-RPC batches, so a run costs a few subrequests), and looks again an hour later. Pushes are capped at 20 per run; a pair whose pushes didn't fit keeps its place for the next minute. An RPC failure retries the pair in 15 minutes. Only factory-created circles can be watched (the indexer's `circles` table, or the factory's `isCircle` registry for one created a moment ago), so a look-alike contract never produces a notification, and only those where the chain says the wallet is a member (`isMember`, one JSON-RPC batch at subscribe time), so a throwaway wallet can't make the cron read circles it isn't in. A wallet no longer in a circle, with nothing to collect, stops being watched.

**Sending.** `@block65/webcrypto-web-push` 2.0.0, pinned: WebCrypto only, works on Workers, one small dependency. TTL one day, a `Topic` header per circle and kind. 404 or 410 from the push service deletes the device; other errors retry on the next look. A broken VAPID key on our side never deletes devices.

**Copy.** Plain sentences with the circle name as the title and amounts in the circle's asset (AVAX, or USDT with 6 decimals): "Your 4.00 AVAX for December is due tomorrow, by 10 Dec 23:59 UTC." The service worker adds "Your time: ..." in the device's time zone (ADR 0014). Links open the right app page (`/app/circle/pay/?id=…`, loans, votes, overview); the service worker only opens same-origin `/app/` paths.

**App.** A Reminders card on each circle's overview (per-kind switches for that circle) and a Settings page (`/app/settings/`, also behind "More" on phones) with the device card (permission flow, test notification, turn off) and a paginated per-circle on/off list. The card covers every state: not set up on this site, browser without push, iPhone or iPad outside the Home Screen (iOS only allows push for installed web apps), notifications blocked, off, on for another wallet, and on.

**Keys.** `VAPID_PUBLIC_KEY` is a wrangler var and the web build's `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. `VAPID_PRIVATE_KEY` is a Worker secret only. `VAPID_SUBJECT` is the site URL, so no email address is needed. Until both keys are set the push API answers 503 and the app says reminders aren't set up. E2E makes a fresh key pair per run.

## Alternatives considered

- **A separate push Worker:** cleaner separation, but a second deploy, a second D1 or cross-Worker calls, and its own copy of the circle list. Rejected.
- **Signing every settings change:** simplest to reason about, but a wallet pop-up for every switch. The device token is limited to that device's reminder settings and can't move money.
- **Server-issued nonces:** one more round trip and table. A client nonce plus a short expiry and a used-nonce table gives the same replay protection.
- **Computing reminders from indexed events only:** no RPC, but the indexer can lag and fees and votes depend on time and on rules the events don't fully carry. The chain stays the source of truth; the indexer only says which circles are real.
- **Hand-written RFC 8291/8292:** possible with WebCrypto, but a maintained, pinned library that already runs on Workers is less to review. Unit tests decrypt its output as a browser would and check the VAPID signature.
- **Email or SMS:** needs personal data. Rejected (CLAUDE.md).

## Consequences

- Owner actions: generate a VAPID pair (`pnpm --filter @wealthkart/indexer vapid:keys`), put the public key in `wrangler.toml` and the Pages build (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`), `wrangler secret put VAPID_PRIVATE_KEY` (and `--env mainnet` with its own pair), check `APP_DOMAINS` matches the real domain, redeploy the indexer (the migration runs in the deploy workflow).
- Changing the VAPID pair later breaks every existing device; they have to turn reminders on again.
- The push endpoint is a device identifier held by Google, Mozilla, Apple or Microsoft. It's the minimum Web Push needs; it's deleted when the member turns reminders off or the service says it's gone.
- Scale: about 600 (wallet, circle) pairs are looked at per hour with the defaults. Beyond that each pair is checked less often than hourly; raise the batch size or move to a paid plan before then. The cron already runs every minute, so this adds no new trigger.
- No quiet hours yet: the Worker doesn't know the member's time zone, and the first notice goes out right after 00:00 UTC.
- Contract wallets (ERC-1271) can't sign up yet.
