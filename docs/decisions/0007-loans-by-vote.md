# 0007. Loans and all money decisions by member vote; auto-disbursal

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

G1 relies on admins approving loans, and rule 2 says decisions are taken by majority.

## Decision

Loan request -> contract checks (free cash after the 20% reserve, cap, no default, one pending request) -> **member vote** (default 48h, 50% quorum, majority; the borrower can't vote) -> AVAX **auto-disbursed** when the vote is finalised. Fee waivers, new members, dormant status and rule changes are also votes. Admin is limited to setup and emergency pause.

## Alternatives considered

- Admin approval: reintroduces single-person trust; rejected.

## Consequences

Voting power is snapshotted at proposal creation (no join-to-vote attacks). Slow for emergencies, so medical loans may use a shorter window (circle setting).
