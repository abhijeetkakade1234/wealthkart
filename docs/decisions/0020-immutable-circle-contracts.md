# 0020. Circle contracts are immutable; new versions are opt-in by vote

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

The pitch is "nobody, including the founders, can touch the money". Upgradeable proxies controlled by a founder multisig contradict that: whoever controls the upgrade controls the funds.

## Decision

- Each circle is deployed by the factory as an **immutable** contract (no proxy, no upgrade function).
- Bug fixes and features ship as a **new factory version**. An existing circle moves only if its members **vote to migrate** (with the ADR 0019 delay). Migration moves funds and member state to a new circle contract; members who disagree exit under the old rules.
- **Guardian pause** (founder multisig) is limited: it can only pause _new_ loans and new deposits, for at most 14 days, and **can never block exits or move funds**. Each circle can vote to remove the guardian.

## Alternatives considered

- UUPS or transparent proxies with a multisig and timelock: convenient bug fixes, but founders effectively hold custody. Rejected.
- No pause at all: no way to stop new money flowing into a contract with a known bug. Rejected.

## Consequences

A critical bug can't be hot-patched, so the audit, invariant tests and bounty matter even more (ADR 0013). A migration contract and flow is needed by Phase 3. No storage-layout upgrade checks are needed; instead, migration tests are required.
