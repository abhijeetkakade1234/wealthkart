# 0021. Circles can be dissolved by vote

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Every circle eventually ends (a goal reached, members drifting apart). There must be a clean, fair wind-down.

## Decision

- Dissolution is a proposal with a higher pass mark (default **66%** of active members) and the ADR 0019 delay.
- On pass: new loans and new members stop; installments stop; existing loans keep running and must be repaid by their schedule (no early-repayment penalty).
- Payouts happen in rounds as cash comes back: each round pays every member pro-rata by shares (bounded batches, ADR 0015).
- When all loans are closed, the final round empties the vault, and the circle is marked closed (read-only history forever).
- Defaulted loans at the end are written off evenly via NAV.

## Alternatives considered

- Everyone exits individually: first movers get cash and late movers wait on loans, which is unfair. Rejected.

## Consequences

Needs a pull-based claim fallback for members whose wallets reject transfers (ADR 0008). Scenario S-LIFE-02.
