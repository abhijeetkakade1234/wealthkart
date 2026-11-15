# apps/web/public

**What's here:** static files copied as-is into the export.
**Open this when:** changing HTTP headers or the service worker.

**Key files**

- `_headers`: Cloudflare Pages headers (security, cache, noindex for `/kit`, no-cache for `sw.js`)
- `sw.js`: service worker, app-shell cache only, never RPC (registered in production)
