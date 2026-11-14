# 0015. No loops over members in contracts (n members must scale)

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
Circles can have any number of members. Any function looping over members, loans or exits can exceed the block gas limit and **brick the circle**.

## Decision
All accounting is O(1) per action: lazy per-member state, global accumulators, NAV. Queues (exits) are processed in bounded batches with a cursor. Lists of members are served by the indexer, not loops in write paths.

## Alternatives considered
- Loop with a max member cap: caps product scale; rejected.

## Consequences
More careful contract design. A gas test with 500+ members runs in CI.
