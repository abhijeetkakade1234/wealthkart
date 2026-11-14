# 0030. Each late fee is capped at half the installment

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

The ADR 0022 parameter table allowed late fees of any size ("≥ 0"). Contracts are immutable (ADR 0020), so a creator could set fee 1 to 100 AVAX on a 0.5 AVAX installment. Anyone who missed a day would be trapped (red-team RT-25).

## Decision

The vault constructor rejects a circle if fee 1 or fee 2 is more than half the installment. The create form shows the same rule in plain words. This supersedes the late-fee rows of the ADR 0022 table; the rest of that table stands.

## Alternatives considered

- **Cap the sum of both fees:** stricter, but G1's own fees (₹100 + ₹100 on ₹4,000) are far below either cap, so the simpler per-fee rule is enough.
- **No cap, just a warning in the UI:** people skim warnings; an on-chain bound can't be skipped.

## Consequences

The interest late fee (Phase 2) needs its own bound when loans land. RT-25 suggests 10× the base fee.
