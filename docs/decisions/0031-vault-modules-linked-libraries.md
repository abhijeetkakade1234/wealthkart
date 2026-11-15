# 0031. Vault logic split into linked external libraries

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

`CircleFactory` deploys each vault with `new`, so the factory's own bytecode contains the vault's full creation code. After membership landed (ADR 0028) the factory had 587 bytes left under the 24 KB contract-size limit (EIP-170). The dormant vote, and then loans, governance and exits, would not fit. Each vault is immutable (ADR 0020): no proxies and no upgrade path.

## Decision

Large pieces of vault logic move into **external libraries** that are deployed once per chain and linked into `CircleVault` at build time. The first is `src/modules/Membership.sol`: founder invites, join and dormant requests, votes and display names. Its state lives in the vault as one `Membership.Store` struct, and the vault calls it with `DELEGATECALL`.

- A library address is fixed in the vault's bytecode at link time. Nobody can change it later, so a vault still runs the same code forever. Libraries have no storage of their own and no owner.
- Loans, governance and exits (Phase 2) follow the same pattern, one module each.
- The SDK merges each linked library's events and errors into the vault ABI (`packages/sdk/scripts/gen-abi.mjs`), so the app decodes logs and reverts as before.
- Deploy order: libraries first, then the factory linked to them. `forge script` deploys missing libraries on its own. The E2E setup deploys `Membership`, then links and deploys the factory (`apps/web/e2e/support/global-setup.ts`).

Result: factory 18.4 KB (6.2 KB left), vault 12.7 KB (11.8 KB left), Membership 14.6 KB.

## Alternatives considered

- **Minimal proxies (EIP-1167 clones):** smallest factory. But every vault would delegate to one shared implementation through a proxy, which ADR 0020 rules out. An initializer also adds a front-running and re-init attack surface.
- **Blueprint contract (ERC-5202 style):** the factory copies vault creation code from a data contract. It moves the limit but doesn't remove it, because the blueprint is itself capped at 24 KB, and it does nothing for the vault's own runtime size, which loans will push past 24 KB.
- **A separate deployer contract per module:** more contracts and more cross-contract calls for no gain over libraries.

## Consequences

- Phase 2 modules land as libraries with explicit storage structs. A library must never be written so its behaviour depends on anything outside the vault's storage and its arguments.
- One extra deploy step per library per chain, and the address must be recorded. Losing it is harmless: anyone can read the linked address from a vault's bytecode.
- Supersedes the factory-size consequence in ADR 0028; the rest of 0028 stands.
- External library calls cost a little more gas (one `DELEGATECALL` plus ABI encoding). Acceptable on Avalanche.
