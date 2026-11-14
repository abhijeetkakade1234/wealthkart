# 0019. 7-day delay on rule changes, with exit under old rules

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

A majority could vote rule changes that harm the minority (e.g. a 50% exit fee, a longer notice period, raising k).

## Decision

- A passed rule change waits **7 days** (circle setting, minimum 3) before taking effect, and then applies from the next period.
- During the wait, any member may **exit under the old rules** (current notice period, current fees). This is a "rage-quit".
- Applies to every parameter change, dissolution, and migration to a new contract version (ADR 0020).

## Alternatives considered

- Immediate changes: minority can be trapped. Rejected.
- Supermajority for every change: protects the minority but makes routine changes hard. Rejected as the default (a circle may still raise its pass mark).

## Consequences

Exits requested in the window are locked to the old parameters. The UI shows pending changes with a countdown on Home.
