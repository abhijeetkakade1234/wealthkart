# 0016. Nominee wallet per member (G1 rule 1)

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

G1's rule 1: every member has a nominee who takes responsibility for their money. With no wallet recovery (ADR 0010), a member who dies or becomes permanently unreachable would leave their share locked forever.

## Decision

- Each member may set **one nominee wallet address** per circle: optional, changeable at any time by the member's own wallet.
- The nominee can be **anyone**: another member of the circle, or someone outside it (spouse, parent). An outside nominee does not join the circle, pay, or vote.
- **Claim flow:** member is dormant (ADR 0010, default 3 missed months) → nominee calls `requestNomineeClaim()` → **circle vote** → on pass, a notice period runs (same as an exit) → the member's share (shares × NAV − dues) is paid to the nominee automatically.
- During the notice period the **member can cancel** the claim from their own wallet (proving they're alive and in control).
- Blocked if the member has an open loan or guarantee, until that's settled (the loan is repaid from the share first).

## Alternatives considered

- No nominee: value is locked forever on death. Rejected; it breaks an existing group rule.
- Guardian or social recovery of the wallet: rejected in ADR 0010 (complexity, attack surface). A nominee gets a payout, not control of the wallet.
- Nominee claims without a vote after a timeout: too easy to abuse if the member is merely away. Rejected.

## Consequences

One extra address stored per member (no personal data). Needs scenario tests: fake claim while the member is alive, nominee is also a member, nominee changed mid-claim, member with an open loan.
