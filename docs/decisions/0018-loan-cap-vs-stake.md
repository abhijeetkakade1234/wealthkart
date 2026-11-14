# 0018. Loan cap tied to the borrower's own stake

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
With loans decided by vote, a majority could approve large loans to each other and default, leaving the minority with the loss. Freezing the borrower's shares only covers losses up to the value of those shares.

## Decision
A loan (plus the borrower's existing loans) may not exceed **k × (borrower's share value + guarantor's locked share value)**, default **k = 2**. This applies on top of the fund-wide cap (rule 13, default 40% of fund) and the reserve (rule 12, 20%). k is a circle setting changeable by vote (with the ADR 0019 delay).

## Alternatives considered
- Fund-wide cap only (G1 today): doesn't stop collusion. Rejected.
- k = 1 (fully collateralised): too restrictive for friends; loses the point of lending on need. Rejected as the default.

## Consequences
New members with small stakes can borrow less until they've contributed for a while, which is acceptable for friend circles. The uncovered part (up to (k-1) x stake) is the trust the circle extends; the UI shows it on every loan vote.
