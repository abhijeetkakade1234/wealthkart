# 0042. Reputation: a soulbound record per wallet across circles

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

PLAN.md Phase 3 lists a reputation SBT and a public repayment record. A member's history in one circle (on-time months, loans repaid, defaults) is useful when they ask to join another, and the founders want it on-chain so nobody can edit it. There must be no personal data (D5).

## Decision

- `Reputation` is one contract per factory, deployed by the factory's constructor (`factory.reputation()`).
- Each wallet gets one token whose id is the wallet address. It's **soulbound**: ERC-5192 `locked` is always true, and every transfer or approval reverts. It shows up in wallets as an ERC-721 (mint event, `ownerOf`, `balanceOf`).
- **Only circles from that factory can write** (`factory.isCircle(msg.sender)`), so a look-alike contract can't forge or spoil anyone's record.
- **Counters:** months paid on time, months paid late, loans repaid, defaults, number of circles, first seen and last seen. They only go up, so a record can't be quietly cleaned.
- Circles call it after their own state changes (CEI). Payment records come from `contribute`; loan outcomes come from LoanBook on full repayment or default. Both hooks land when the Phase 2 modules are merged.
- **Views:** `recordOf`, `onTimeBps`, `seenIn`. The public "repayment record" page reads these, plus the indexer for detail.

## Alternatives considered

- **Off-chain score in the indexer only:** easy, but anyone running the indexer could change it, and other dapps couldn't read it.
- **A transferable NFT:** reputation that can be sold isn't reputation.
- **A single score number:** hides how it was made. Raw counters let each circle decide what matters to them.

## Consequences

- Every `contribute` and loan outcome costs one extra external call (a few thousand gas) to a trusted contract created by the same factory.
- Defaults are permanent in the record. That's deliberate (D4b: "reputation is marked"), so the circle vote that settles a default matters.
