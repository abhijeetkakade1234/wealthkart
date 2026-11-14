# 0009. Late fees and loan penalties paid into the vault

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

G1's rules 6-8 (late fees) and 15-17 (tenors, default, minimum interest) must be enforced without an admin.

## Decision

Missed installment: fee 1 after the due day, fee 2 after day 20, dormant vote after 3 missed months. Missed interest: fee after the due day, second fee after day 20, unpaid interest rolls forward without compounding; 2 months missed = default (freeze borrower and guarantor shares, block new loans); tenor step-ups 1% -> 1.5% -> 2%; after tenor 3, frozen shares repay the loan after a vote. All fees go into the vault. All amounts are circle settings. Computed lazily on interaction.

## Alternatives considered

- Fees burned or sent to the company: no benefit to members; rejected.

## Consequences

Lazy evaluation means views must compute "as of now" correctly. Waivers only by vote.
