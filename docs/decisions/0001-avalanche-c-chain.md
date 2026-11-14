# 0001. Build on Avalanche C-Chain (own L1 later)

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

WealthKart needs a tamper-proof ledger that can hold funds and enforce rules, with cheap and fast transactions. The founders are Team1 (Avalanche) collaborators and are seeking ecosystem funding.

## Decision

Deploy contracts on Avalanche C-Chain: Fuji testnet first, then mainnet. Consider a dedicated WealthKart Avalanche L1 (zero-fee gas, ICM) in Phase 5.

## Alternatives considered

- Other EVM L2s: viable technically, but they lose the Avalanche/Team1 funding and community fit.
- Own L1 from day one: too much infrastructure before product-market fit.

## Consequences

EVM tooling (Foundry, viem, wagmi). Sub-second finality simplifies the UX. Members need AVAX for gas.
