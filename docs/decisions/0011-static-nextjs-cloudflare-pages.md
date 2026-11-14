# 0011. Static Next.js PWA on Cloudflare Pages

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

With no user database (ADR 0004) and wallet-based auth, there's no need for server-side code.

## Decision

Next.js (App Router) static export, deployed to **Cloudflare Pages**. Data is read from the chain (RPC plus an indexer). Circle routes use `?id=0x...` query params, since dynamic segments can't be pre-rendered. Workers are used only for optional helpers (push reminders in Phase 4, an event-cache indexer).

## Alternatives considered

- OpenNext on Workers (SSR): unnecessary without a server-side need.

## Consequences

Nothing to breach server-side, near-zero hosting cost. No SSR, so SEO applies to the landing page only. All logic runs client-side or on-chain.
