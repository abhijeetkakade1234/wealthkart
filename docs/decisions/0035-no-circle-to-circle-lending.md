# 0035. No circle-to-circle lending

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Phase 6 in PLAN.md listed group-to-group lending: circles with spare cash would lend to circles that are short, through vault-to-vault loans. WealthKart is built on private circles of friends who know each other and lend on trust (ADR 0005, 0007).

## Decision

Drop circle-to-circle lending from the roadmap (founder decision, 2026-11-15). A circle's money is lent only to that circle's own members, by that circle's vote. Phase 6 keeps reputation-based credit lines and optional yield on the idle reserve by circle vote.

## Alternatives considered

- **Keep it as a far-future idea:** leaving it on the roadmap invites design choices (cross-vault calls, shared risk) that the product doesn't want.

## Consequences

- No vault ever lends to or borrows from another contract. That keeps each circle's risk inside the circle and makes audits simpler.
- Pitch and docs no longer mention it.
