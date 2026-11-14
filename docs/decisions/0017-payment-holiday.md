# 0017. Payment holiday: fee-free delay, up to 3 times a year

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

G1's rules 9-10: a member who can't pay by the due date informs the group in advance, and this can be used 3 times a year.

## Decision

- Before the due day (UTC), a member calls `takeHoliday(period)`.
- That period gets **no late fees**. The installment is **still owed** and must be paid by the next due date (together with that period's installment). If unpaid by then, normal late fees apply from that point.
- Limit per member per year (UTC calendar year): circle setting, default **3**.
- No vote needed; it's a member's right within the limit.

## Alternatives considered

- Skipping the month entirely: changes ownership math and invites abuse. Rejected.
- Admin- or vote-approved holidays: friction for a routine need. Rejected.

## Consequences

Lazy fee logic must check holiday flags. Holidays don't apply to loan interest (interest has its own late-fee rule). Scenario S-LIFE-04 plus boundary tests (declared after the due day = rejected).
