# 0022. Circle rules are a fixed menu of parameters

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Circles need different numbers (installment, rates, fees), but letting circles write arbitrary rule logic would make every circle a new, unaudited contract.

## Decision

- Rule _logic_ is fixed in audited contract code. Each circle chooses only _parameters_, set in the Create-circle wizard with G1's values pre-filled (full list in PLAN.md section 3, "Rule settings").
- Parameters are validated on-chain with hard bounds (e.g. interest 0-5% a month, due day 1-28, quorum 20-100%, exit notice 0-90 days).
- Changes go through a vote plus the ADR 0019 delay.

## Alternatives considered

- Custom rule scripts per circle: unbounded audit surface. Rejected.
- One global rule set for everyone: doesn't fit different friend groups. Rejected.

## Consequences

Adding a new kind of rule = a new contract version (ADR 0020). Bounds must be tested at both edges.
