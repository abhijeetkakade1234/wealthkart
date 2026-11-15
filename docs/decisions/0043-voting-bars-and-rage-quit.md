# 0043. Review fixes: voting bars, automatic rule switch-over, rage-quit notice, exits and loans

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Three independent reviews of the Phase 2 modules (`docs/redteam/2026-11-governance-review.md`, `2026-11-exits-review.md`, `2026-11-loans-review.md`) found no way to steal funds, but they did find votes that pass on too few members, a rule change that lands whenever someone pokes it, an exit queue that a pair of members can stall, a dissolved circle that can lock up for good, and loans whose collateral can be counted twice. The lead chose a fix for each. This ADR records those choices. It supersedes the parts of ADR 0038, 0039 and 0040 named below and leaves the rest of them in force.

## Decision

### Voting bars (supersedes the pass-mark wording of ADR 0040; GOV-01, GOV-03)

- **Dissolve and guardian-off** pass only when yes votes reach the pass mark of all **eligible** members (dissolve: `dissolvePassPct`; guardian-off: `passPct`), with quorum still required. A low turnout can never carry them. If the window ends below that bar the proposal closes as `Expired`.
- **Rule changes** keep quorum plus the pass mark of votes cast, except a **risky** change, which needs the dissolve bar: `dissolvePassPct` of eligible members. Risky means any change to `passPct`, `dissolvePassPct` or `ruleChangeDelayDays`; a shorter `exitNoticeDays`; a higher `exitFeeBps`, `interestBps`, `tenor2Bps` or `tenor3Bps`; a lower `reserveBps`; a higher `maxLoanBps` or `kMultiplier` (`Rules.isRisky`). The check compares the proposal with the rules in force when it is proposed, and the result is stored on the proposal (`Proposal.memberBar`).
- **Proposing:** only current voters propose, waivers included. A member who is behind asks another member to propose for them. No waiver for a dormant member, who owes nothing. One new proposal per member per 24 hours (`PROPOSAL_COOLDOWN`, GOV-08/09).
- **Cancel:** the proposer can withdraw only while voting is open and undecided (GOV-07).

### Rules switch over by themselves (GOV-04, RT-24)

A passed change is in force from `effectiveAt`. Every write that reads the rules (contribute, the loan writes that read rules, request/claim/process exits, upkeep, every propose) first calls `_syncRules()`, which applies a due change. `applyRuleChange()` stays as a permissionless poke. Views (`rules()`, loan and exit views, `checkUpkeep`) read the effective rules, so the app never shows stale numbers. Nobody can choose the moment a change lands.

### Rage-quit keeps a notice (supersedes ADR 0039's zero-notice rule; EXIT-03, EXIT-12)

While a rule change waits (`now < rageQuitUntil`), a new exit matures at `min(now + exitNoticeDays, rageQuitUntil)` under the old rules: the old notice and the lower of the old and new fee. It is never instant and never matures later than the moment the new rules apply. This keeps ADR 0019's promise (leave under the old rules) without opening a no-notice bank-run window every time any change passes.

### Exits queue (supersedes ADR 0039's queue design; EXIT-01, EXIT-02, EXIT-05)

- The append-only array with stale slots is replaced by a **doubly linked list** of live exits (`Exits.Entry.prev/next`, `Store.first/last/length`). Request appends; cancel, payout and drop unlink in O(1). No scan ever touches a settled slot, so the 20-slot blind spot and the cancel gas bomb are gone.
- `processExits(maxCount)` walks from the head. `checkUpkeep` mirrors it over the first 20 live exits.
- `claimExit()` settles the queue in order up to the caller: earlier matured exits are paid first or marked waiting. The caller is paid unless an exit ahead of them is waiting for cash. FIFO stays fair among matured exits, and two or more waiting exits no longer block each other.
- A member with a pending exit is flagged `Membership.Member.exiting` (set and cleared by Exits). They can't vote, propose, borrow or guarantee, and they leave the quorum base (`voterCount`) until they cancel. Cancelling gives them a fresh voting stamp, so they vote only on proposals opened afterwards (EXIT-06).

### Dissolution (supersedes ADR 0040's "claims wait for loans"; GOV-02, GOV-06, EXIT-07, LOAN-02)

- Once dissolved, `requestExit` reverts. A queued exit is still paid, with no exit fee.
- `claimDissolution` moves to Exits and pays `shares x cash / totalShares` from cash only, rounded down. While loans are out it burns `ceil(amount x totalShares / totalAssets)` shares (never lowers NAV for the rest) and the member stays to claim again as repayments come in. With no loans out the member takes the rest and leaves; the last one out empties the vault. O(1) per claim. A claimant's waiting exit is cleared first, so `exitsWaiting` stays exact.
- A member tied to an open loan (borrower or guarantor) or frozen can't claim until the loan is repaid or settled.
- After a dissolve nobody pays installments, so nobody stays a voter. A defaulted loan is therefore settled by anyone at once with no vote (`proposeSettle` returns 0). Before a dissolve, settle stays vote-gated. Together with cash claims, funds can't get stuck.

### Loans (supersedes the matching lines of ADR 0038)

- **One stake, one loan (LOAN-01):** a member with a loan or open request can't guarantee, and a guarantor can't request a loan. Re-checked on `acceptGuarantee` and at payout.
- **Fixed at payout (LOAN-04):** each loan copies `defaultAfter` and `interestFee` as well as the rates and tenor.
- **Re-checked at payout (LOAN-05):** the borrower must still be active, not dormant, frozen or exiting; the guarantor still eligible; the medical cap still met; otherwise the request closes as `Failed`.
- **Default stops the meter for a settle (LOAN-06):** a settle charges interest and late fees only up to the default month. A cure still pays everything owed up to now, so defaulting earns no free months.
- **Matured exits block lending (LOAN-07):** besides `exitsWaiting`, disbursal waits while the first exit in the queue has finished its notice.
- **Frozen members can't vote (LOAN-08).** Members in exit notice can't borrow or guarantee (LOAN-09).

### One send path and the lock (GOV-05, EXIT-09, LOAN-03)

- `Ledger.payOut` is the only push: 50k gas cap, no return data copied (return bombs cost nothing), and it reverts if less than 90k gas is left, so a caller can't starve the transfer to force a payout into `withdrawable`. A refused payout still goes to `withdrawable`.
- The vault uses OpenZeppelin `ReentrancyGuardTransient` (Cancun opcodes, live on C-Chain). The lock can't outlive a transaction. Forwarded Governance calls never set it, and they refuse to run while it is set (inside a payout callback).
- The guardian role ends for good the first time the creator leaves; a rejoin doesn't bring it back (EXIT-11).

### Kept by design

- **Arrears forgiven on exit (EXIT-04):** missed months bought no shares, so nobody is diluted. Fees that were never charged are not collected at exit.
- Members two or more periods behind, and frozen members, still count in the quorum base though they can't vote (GOV-10). The app should warn when quorum can't be reached.

## Alternatives considered

- **Minimum absolute quorum of 2 for dissolve:** the member bar already makes a lone proposer unable to dissolve any circle with more than one voter.
- **Zero-notice rage-quit only for no-voters, or with an RT-18 haircut:** needs per-vote bookkeeping or the haircut model that isn't built yet. The capped notice is simpler and closes the bank-run window.
- **Keeping the array and capping cancel pops:** still leaves the claim rule and the upkeep blind spot hard to get right; the linked list removes the whole class.
- **Blocking dissolution claims until every loan closes:** one bad debt would lock the circle forever.
- **`nonReentrant` on the forwarded Governance functions:** the assembly return skips the epilogue, which would leave even a transient lock set for the rest of the transaction and break batching wallets. A read-only check of the lock gives the same protection.

## Consequences

- ABI changes: `exitOf` returns `(prev, requestedAt, feeBps, waiting, next, maturesAt)` (no `slot`; `requestedAt == 0` means no exit); `memberOf` has `exiting`; `proposal` has `memberBar`; `loanOf` has `defaultAfter`, `defaultPeriod`, `interestFee`; `exitQueuePage` returns live exits only; `claimDissolution` can be called again while loans are out; new views `hasVotedProposal`, `lastPauseAt`; `DissolutionClaimed` and `NotDissolved` now come from Exits; `LoansStillOutstanding` is gone; new errors `ProposalTooSoon`, `ClaimBlockedByLoan`, `NothingToClaimYet`, `MemberExiting`, `PayoutGasTooLow`; new event `GuardianRetired`.
- Storage moved by one slot (no `ReentrancyGuard` slot). Test slot constants live in `CircleVaultBase` with a layout test.
- Vault runtime 22,663 B -> 23,432 B (limit 24,576). Little room is left; the next feature has to move code out first.
- Still open: RT-08/RT-18 (NAV ignores accrued interest and impairment), GOV-10 quorum base, GOV-11 joins after a dissolve, LOAN-12 rule-17 bypass.
