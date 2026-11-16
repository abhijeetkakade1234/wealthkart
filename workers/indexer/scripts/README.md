# workers/indexer/scripts

**What's here:** small one-off tools for the indexer Worker.
**Open this when:** setting up reminders (ADR 0052).

**Key files**

- `vapid-keys.mjs`: prints a fresh VAPID key pair for Web Push. The public key goes in `wrangler.toml` and the web build; the private key only into `wrangler secret put VAPID_PRIVATE_KEY`.
