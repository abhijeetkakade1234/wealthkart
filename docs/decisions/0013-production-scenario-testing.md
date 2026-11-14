# 0013. Tests model real production failures, not happy paths

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Contracts custody friends' money and can't be hot-fixed easily. Happy-path unit tests miss what breaks in production.

## Decision

Every feature ships with **scenario tests** drawn from what really happens: people paying late, twice, or from the wrong network; bank runs; lost wallets; malicious members; contract wallets; automation outages; rounding over years; timezone edges. Plus fuzz and invariant tests on all money paths, a replay of G1's real history, and e2e tests against a local chain. Catalogue: `docs/testing.md`.

## Alternatives considered

- Coverage-percentage targets alone: high coverage with weak assertions; rejected as the only bar.

## Consequences

Slower feature delivery, far fewer production incidents. The catalogue must be extended after every bug.
