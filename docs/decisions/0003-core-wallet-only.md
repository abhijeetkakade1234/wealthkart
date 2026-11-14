# 0003. Login with Core Wallet only; members pay their own gas

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

We need identity without accounts. We considered passkey smart wallets with a paymaster and embedded wallets with email or phone login.

## Decision

Login = connect **Core Wallet** (extension via EIP-6963; mobile via WalletConnect or Core's in-app browser). Members pay gas in AVAX. No account abstraction, no paymaster.

## Alternatives considered

- Embedded wallets (Privy, thirdweb): collect email or phone, which conflicts with ADR 0004.
- Passkey smart wallets plus a paymaster: better UX but adds infrastructure, cost and audit surface.
- MetaMask and others: may be added later; Core first for ecosystem fit.

## Consequences

Simple stack. Onboarding requires installing Core and acquiring AVAX. Members using smart-contract wallets must still work (see ADR 0013 scenarios).
