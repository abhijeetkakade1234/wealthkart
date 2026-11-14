# 0012. Monorepo (pnpm + Turborepo) with Foundry for contracts

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Contracts, SDK, rule engine and web app must stay in sync (ABIs, addresses, math).

## Decision

pnpm workspaces plus Turborepo. `apps/web` (Next.js), `packages/contracts` (Foundry), `packages/sdk` (ABIs, addresses, typed hooks), `packages/rules` (TS mirror of contract math), `workers/*`. **Every folder has a `README.md`** saying what's inside and when to open it.

## Alternatives considered

- Hardhat: slower tests, weaker fuzz/invariant support than Foundry.
- Polyrepo: harder to keep ABIs and the UI in sync.

## Consequences

ABIs flow contracts -> sdk -> web in one build graph. Turborepo caches CI.
