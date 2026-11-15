# 0034. Charts read circle events from the chain until the indexer lands

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Phase 1 needs the circle charts and the payments heatmap (PLAN.md D7). The contracts keep only current state: balances, shares, each member's next unpaid month. History (who paid which month, with what fee) exists only in events. The indexer (AvaCloud Data API, The Graph or a Worker cache) is a separate Phase 1 item and isn't built yet. The app is a static export with no backend (ADR 0003).

## Decision

- **Source:** the browser reads the circle's own events with `eth_getLogs`, from the block the circle was created in to the latest block, and builds every chart from them (`apps/web/src/lib/events.ts`, `analytics.ts`).
- **Bounded reads:**
  - `CircleVault.createdAtBlock` (new immutable) gives the start block.
  - Reads go in chunks of `NEXT_PUBLIC_LOG_CHUNK` blocks (default 2048, the public Avalanche RPC cap), at most 300 chunks, 4 at a time, newest first.
  - When a circle is older than that, the page says it is showing recent months only.
- **Month logic:** a payment counts in the month it is for, not the month it was sent. Late payments show as late in their own month, and no block timestamps are needed.
- **Share value** is shown as an index that starts at 1.00 (what 1 AVAX paid in at the start is worth now), because shares carry `VIRTUAL_SHARES` extra precision (ADR 0006).
- **Colours:**
  - Series use `--chart-1` `#4f6bc4` and `--chart-2` `#c0729f`. Both pass the dataviz checks (lightness band, chroma, CVD ΔE 10.2, normal-vision ΔE 18.9, contrast at least 3:1). The brand cobalt `#2c4596` is too dark for the chart band and stays the UI accent.
  - Status colours appear only in the heatmap, for state, and every cell also has an icon and a text label.
- **Every chart has a table view**, and each widget has its own error boundary (ADR 0026).

## Alternatives considered

- **Build the indexer first:** blocks charts on infrastructure that needs a deploy and an account. The pure analytics functions take an event list, so the indexer only has to supply the same list later.
- **Store history on-chain (per-month arrays):** costs gas on every payment, forever, to save a read.
- **Fetch every block's timestamp to bucket by payment time:** one RPC call per block, for little gain.

## Consequences

- Large or old circles load slowly on public RPCs until the indexer replaces `useCircleEvents`. Nothing else changes when it does.
- The activity feed (next item) reuses the same event reader.
- Charts refresh every 30 seconds while the page is open.
