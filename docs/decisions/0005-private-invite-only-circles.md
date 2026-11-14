# 0005. Private, invite-only circles; no rotating payouts or public discovery

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
Indian law (BUDS Act 2019, Chit Funds Act 1982, RBI lending rules, SEBI CIS rules) targets schemes that collect money from the public, rotating chit schemes, or lending as a business. Friends pooling their own money is a different thing.

## Decision
Circles are **private and invite-only**, among people who know each other, lending on need. No public discovery, no chit-style rotating payouts, no advertised returns. The company never holds keys or funds. One wallet can be in **n circles**; a circle can have **n members**.

## Alternatives considered
- Public or open groups and chit templates: growth upside, but high regulatory risk; rejected.

## Consequences
Growth comes through invites. Marketing must never promise returns. Lawyer review before mainnet. Members handle their own crypto tax (the app provides a CSV export).
