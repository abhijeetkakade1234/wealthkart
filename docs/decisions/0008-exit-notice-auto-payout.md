# 0008. Exit via notice period with automatic payout

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Members must be able to leave and get a fair share without an admin, and without a bank run draining lending capacity.

## Decision

`requestExit()` -> notice period (default 30 days, dues continue) -> NAV snapshot -> payout = shares x NAV - unpaid dues -> AVAX sent automatically by **Chainlink Automation** calling `processExits()`, with a permissionless fallback. Blocked with an open loan or guarantee. If cash is short, the exit is queued and paid from inflows. No exit fee unless voted.

## Alternatives considered

- Instant exit: bank-run risk.
- Admin-processed exit: trust issue.

## Consequences

A failed transfer (e.g. a contract wallet that reverts) must not block the queue: fall back to a pull-based claim. Automation needs funding (LINK).
