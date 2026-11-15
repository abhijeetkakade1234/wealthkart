# 0032. Dormant members: vote, pause, wake

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

ADR 0010 says a circle can vote a member dormant after N missed months: dues and fees stop and their shares stay theirs. Red-team RT-11 adds that a bloc could use dormancy to shrink the quorum, so the contract itself must check the missed months, and the member must be able to clear dormancy easily. ADR 0010 left out the pass mark, who counts in quorums, and what happens when the member comes back.

## Decision

- **Setting:** `dormantAfter`, missed installments before a vote is allowed, 1 to 12, default 3 (PLAN.md §3). It is fixed at creation like the other settings.
- **Missed installments:** installments past their fee-free deadline and unpaid (`periodsOverdue`). A period with a payment holiday doesn't count until the next period's due moment (ADR 0017).
- **Proposal:** any member who can vote (active, at most one month behind) proposes `proposeDormant(member)` once the contract sees at least `dormantAfter` missed installments. One open proposal per member. The proposer's yes is counted. The member it is about can't vote on it.
- **Vote:** same window and quorum as join votes (ADR 0028), with voters snapshotted when the proposal opens. It passes with **more than 50% yes** of votes cast (PLAN.md §3 default pass mark). The member can't vote, so the quorum denominator is everyone else who could vote.
- **Caught up:** if the member pays enough that they're below `dormantAfter` missed installments before the vote closes, it closes as Cancelled.
- **While dormant:** nothing is owed and no late fees build up. The member can't vote, take a holiday or rename. Their shares and name are untouched. Dormant members don't count in any quorum.
- **Coming back:**
  - **Pay (RT-11):** a dormant member who pays is woken in the same transaction and pays the **current** period, with its usual late fees if this month's due moment has passed.
  - **`wake()`:** dues restart like a new member's: this month if its due moment hasn't passed, otherwise next month.
  - Either way, the months missed before and during dormancy are not owed. They bought no shares, so no other member was diluted.
  - Waking renews the member's join stamp, so they vote only on requests opened afterwards. That keeps every vote's total at or below its quorum denominator.

## Alternatives considered

- **Any vote from the wallet clears dormancy (RT-11's wording):** a vote counted from someone left out of the quorum denominator can break `yes + no <= eligible`. Paying and `wake()` are enough to prove the wallet is back.
- **Arrears stay owed after waking:** fairer to the late-fee pot. But it needs a list of skipped months or a big catch-up payment, and the shares model already means missed months only cost the member.
- **66% pass mark, like admission:** dormancy protects the member (fees stop) and they can undo it in one transaction, so a simple majority is enough.

## Consequences

- A member who misses months on purpose and then wakes skips the late fees on those months. They also lose the growth those months would have bought, and it takes a vote by the others to get there.
- Nominee claims (ADR 0016) start from dormancy, so they build on this in Phase 2.
- Dormant proposals share the 20-request cap with join requests. Only members who are up to date can propose, so spam is bounded.
