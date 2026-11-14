# 0010. No wallet recovery; dormant-member rule instead

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
With no accounts there is no "forgot password". Guardian recovery adds complexity and a social-engineering attack surface.

## Decision
Lost wallet = lost access. Onboarding stresses backing up the Core recovery phrase. A circle can vote a member **dormant** after N missed months (default 3): dues and fees stop, and shares stay owned by that address and are redeemable only by it.

## Alternatives considered
- Guardian or social recovery: rejected by the founders (complexity, attack surface).

## Consequences
No one can ever seize a member's shares (except loan default per ADR 0009). Some value may be permanently locked.
