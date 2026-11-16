-- Payment reminders by Web Push (Phase 4, ADR 0052). Keyed by wallet address only: no names,
-- no email, no phone. Rows are small on purpose (ADR 0047): an endpoint URL, two public keys and
-- a token hash per device, one row per (wallet, circle) for settings, one per sent reminder.

-- One row per device that turned reminders on. The endpoint is the push service URL the
-- browser gave us; p256dh/auth encrypt the message for that device. `token_hash` is the SHA-256
-- of the device token returned at subscribe time, so settings can change without a new signature.
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint   TEXT    PRIMARY KEY,
  address    TEXT    NOT NULL,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  token_hash TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_by_address ON push_subs (address);

-- Which reminders a wallet wants for a circle (bitmask, see src/push/kinds.ts; 0 = off), and
-- when the cron should look at this pair next (unix seconds).
CREATE TABLE IF NOT EXISTS push_watch (
  address TEXT    NOT NULL,
  circle  TEXT    NOT NULL,
  kinds   INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  PRIMARY KEY (address, circle)
);
CREATE INDEX IF NOT EXISTS push_watch_next ON push_watch (next_at);

-- Dedupe: the highest stage already sent for a topic (e.g. `due:24321` stage 2 = "due tomorrow"
-- was sent). A stage is never sent twice; old rows are pruned after 120 days.
CREATE TABLE IF NOT EXISTS push_sent (
  address TEXT    NOT NULL,
  circle  TEXT    NOT NULL,
  topic   TEXT    NOT NULL,
  stage   INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (address, circle, topic)
);

-- Signed-message nonces already used, kept until the message expires (replay guard).
CREATE TABLE IF NOT EXISTS push_nonces (
  nonce   TEXT    PRIMARY KEY,
  expires INTEGER NOT NULL
);

-- Fixed-window rate limits (key = what is limited, e.g. `sub:0xabc…`).
CREATE TABLE IF NOT EXISTS push_rate (
  key          TEXT    PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
