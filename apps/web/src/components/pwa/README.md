# components/pwa

**What's here:** `RegisterServiceWorker`, which registers `public/sw.js` in production builds only.
**Open this when:** changing offline behaviour. The caching rules are in `public/sw.js` (app shell and hashed assets cached; RPC, cross-origin and non-GET never cached; `push` shows a reminder with the deadline in local time, `notificationclick` opens only same-origin `/app/` pages, ADR 0052). The manifest is `src/app/manifest.ts`.
