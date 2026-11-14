# 0023. UI system: shadcn/ui + web3-style components, one layout, real pagination and search

- **Status:** Accepted; look-and-feel parts superseded by [0025](0025-visual-identity-gallery.md)
- **Date:** 2026-11-14

## Context
The app has about 12 pages with many lists (circles, members, loans, votes, activity). It should feel like a modern web3 product, be consistent across pages, and stay usable as circles grow to many members and years of history.

## Decision
- **shadcn/ui** (Radix + Tailwind) is the base component system. Components live in our repo, so we own and theme them.
- **Web3-style flair** from shadcn-compatible copy-paste libraries, **Magic UI** and **Aceternity UI**: animated gradient borders, glow cards, number tickers, shimmer buttons, aurora/grid backgrounds. Used sparingly on key moments (balances, CTAs, vote results), never on dense data.
- **Dark-first theme** (light supported) with design tokens in CSS variables; charts via **shadcn charts** (Recharts).
- **One page template for every app page**: `AppShell` → `PageHeader` → (`StatsRow`) → content (`DataTable` / cards / form). Pages differ by content, not layout.
- **Every list is paginated** and **searchable where useful**, with a debounced (300 ms) search. Page, size, search and filters are kept in the URL query string, so refresh, back button and shared links work.
- The landing page is out of scope for now (ADR to follow when designed).

## Alternatives considered
- Chakra / MUI / Mantine: heavier, harder to give a distinctive web3 look.
- A fully custom component kit: slow; shadcn gives accessible primitives we can restyle.
- Infinite scroll: breaks "page 7 of 40", deep links and the back button. Rejected for data lists (OK only for the activity feed on mobile, as an optional "load more").

## Consequences
Shared `DataTable`, `Pagination`, `SearchInput`, `PageHeader` components must be built first, in Phase 0. Full spec: `docs/ui.md`.
