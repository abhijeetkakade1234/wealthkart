# Governance module: independent security review (2026-11-15)

Reviewer: independent pass, no prior context assumed. Branch `abhijeet` at `f2ed9e4`.

## 0. Scope and method

**In scope**

- `packages/contracts/src/modules/Governance.sol` (whole file)
- `packages/contracts/src/CircleVault.sol`, GOVERNANCE section, including the raw forwarder `_govForward` / `_govView` (lines 403-574)
- How Governance writes `Ledger` (`rageQuitUntil`, `dissolved`, `guardianDisabled`, `pausedUntil`) and `Membership` (`feeWaived`, `removeMember`), and how `Exits` reads those switches

**Context read:** ADR 0019, 0021, 0037, 0040; red-team plan RT-05, RT-12, RT-13, RT-24; `test/CircleVault.governance.t.sol`; `Membership.sol`, `Ledger.sol`, `Exits.sol`, `Rules.sol`.

**Method:** the `solidity-hardening` checklist (funds stuck, funds stolen, developer reimbursement), then the `redteam-attack` layers (authorisation, input handling, business logic, state and concurrency, DoS, economic abuse). Every finding marked "proved" has a throwaway Foundry test in a scratch worktree (`D:\wt\review-gov`, `test/GovReview.t.sol`). Those tests assert the _safe_ behaviour, so a failing test proves the finding. They were not committed.

**Attacker model:** a member or a small group of members (friends, so collusion is realistic), a member's contract wallet that runs code when paid, a permissionless keeper (anyone calling `processExits` / `finalizeProposal`), and plain apathy (members who don't open the app during a vote).

**Severity legend:** Critical = funds stolen or broken integrity at low effort. High = real damage, realistic. Medium = limited blast radius, or needs conditions / a later module. Low = minor or hard to exploit. Info = no action needed or a note for later modules.

## 1. Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 1     |
| Medium   | 5     |
| Low      | 5     |
| Info     | 4     |

No path was found that steals funds or corrupts the vault's storage. The raw forwarder holds up: the storage-slot header can't be overridden by the caller, each entry point hardcodes its own selector, dirty or short calldata reverts, and the view path can't write. The real problems are in vote arithmetic and in how dissolution interacts with exits:

- a dissolve (irreversible) passes on 66% of _votes cast_ at the deadline, so far fewer than 66% of members can end the circle
- after a dissolve, a keeper can push pending exits through and charge the exit fee, which the people still in the circle share

## 2. Findings

### GOV-01. Dissolve, guardian-off and rule changes pass on a share of votes cast, not of members (High, proved)

- **Where:** `Governance.sol:489-504` (`_outcome`, the `ended` branch at line 503).
- **Scenario:** at the deadline `_outcome` approves when quorum is met and `Rules.passes(yes, yes + no, pct)`. Quorum is `quorumPct` of eligible voters (20..100). So the real bar is `quorumPct × passPct` of members:
  - Default test circle (12 voters, quorum 50%, dissolve 66%): the proposer plus 5 friends vote yes, nobody else votes, and after 48 h anyone finalizes. Six of twelve members (50%) dissolved the circle. Test `test_GOV_01_dissolveWithHalfTheCircle` fails with "6 of 12 members (50%) dissolved the circle".
  - Five-member circle at the 20% quorum floor: the proposer's own automatic yes is already 20% quorum and 100% of votes cast. With no other vote, the proposer alone dissolves the circle when the window closes (as short as 1 hour). Test `test_GOV_01b_singleProposerDissolvesAtLowQuorum` fails.
- **Impact:** ADR 0021 says dissolution needs "66% of active members". `Ledger.dissolved` can never be cleared, installments stop at once (`contribute` reverts) and there is no ADR 0019 delay for dissolves (ADR 0040). A small group can end a circle during a holiday week. Payouts are pro rata, so nothing is stolen, but the decision is irreversible and against the documented rule. The same arithmetic lets one member in a small circle vote the guardian off or schedule a rule change (rage-quit protects members there, but RT-12 notes nobody gets a reminder).
- **Fix:** for `Kind.Dissolve` (and ideally `GuardianOff` and risky rule changes, RT-12) require `Rules.passes(yes, pr.eligible, pct)` even at the deadline, i.e. a share of eligible members, never of votes cast. Simplest code change: in `_outcome`, when `pr.kind == Kind.Dissolve`, return `Expired` at the end unless the early-approval test `quorum && passes(yes, e, pct)` already held. Also consider a minimum absolute quorum (e.g. `max(quorumPct × e, 2)`) so the proposer's own vote can never be the quorum on its own. Then supersede the conflicting wording in ADR 0040 with a new ADR.

### GOV-02. After a dissolve, exits still charge the exit fee, and anyone can force them through (Medium, proved)

- **Where:** `Exits.sol:355-366` (`_quote`), `Exits.sol:113` (`requestExit`), `CircleVault.sol:342` (`processExits`). Governance sets `dissolved` (`Governance.sol:539`), but Exits never reads it.
- **Scenario:** member C asked to exit with a 30-day notice. The circle then dissolves. Claiming dissolution would pay C full NAV with no fee. But once the notice ends, anyone (or Chainlink upkeep, which `checkUpkeep` triggers automatically) calls `processExits`, and C is paid NAV minus `exitFeeBps` (up to 10%). The fee stays in the vault and goes to the members who claim later. Members who request an exit _after_ the dissolve also pay the notice and the fee. In test `test_GOV_02_exitFeeChargedAfterDissolve` (exit fee 10%) the exiter got 0.45 AVAX instead of 0.5.
- **Impact:** up to 10% of an exiting member's stake moves to the other members. The keeper can be one of the people who benefit, and C has to win a race with `cancelExit` against automation.
- **Fix:** in `Exits._quote`, use `feeBps = 0` when `ledger.dissolved`. In `Exits.requestExit`, revert with `Governance.CircleDissolved()` once dissolved and point to `claimDissolution`. Optionally let `_settle` pay matured exits at full NAV after a dissolve. Add scenario S-GOV-xx "pending exit at dissolve is paid fee-free".

### GOV-03. The 66% dissolve bar can be lowered by an ordinary rule change (Medium, reasoned)

- **Where:** `Rules.sol` bounds `dissolvePassPct` to 50..100 and `passPct` to 50..100; `Governance.proposeRuleChange` (`Governance.sol:156`) uses the ordinary `current.passPct`.
- **Scenario:** a bloc passes a rule change at `passPct` (default more than 50% of votes cast, see GOV-01) that sets `dissolvePassPct = 50`. After the delay, it dissolves at 50%. A rule change can also raise `passPct` to 100 so that no later change can pass, or lower it again.
- **Impact:** the supermajority in ADR 0021 is only as strong as the simple majority that guards the parameter. Rage-quit doesn't help here: leaving early just means getting your share earlier.
- **Fix:** a change that lowers `dissolvePassPct` or `passPct` must itself pass at the _current_ `dissolvePassPct` of eligible members, i.e. pick the proposal's pass mark as `max(passPct, dissolvePassPct)` when either field goes down. This is the RT-12 "risky parameter" class that ADR 0040 left open. Write the ADR before LoanBook ships, since `reserveBps`, `maxLoanBps` and `kMultiplier` become risky then too.

### GOV-04. A passed rule change only applies when someone pokes it, so it can land mid-period (Medium, proved)

- **Where:** `Governance.sol:275-285` (`applyRuleChange`); `_rules` is read directly by `Exits` (`r.exitNoticeDays`, `r.exitFeeBps`) and will be read by LoanBook.
- **Scenario:** a change scheduled for Jan 1 isn't applied until someone calls `applyRuleChange()` or proposes the next change. Whoever calls it picks the moment. If nobody does until Jan 15, the circle runs January under the old rules for two weeks and then switches. `test_GOV_04_rulesStaleAfterEffectiveAt` shows `rules().interestBps` still 100 on Jan 15 when it should be 200. Meanwhile `rageQuitUntil` has already ended, so exits requested in between get the old notice period with no rage-quit.
- **Impact:** this breaks RT-24 ("a change can never apply to a period that has already started"). Once LoanBook computes interest lazily from `_rules`, a borrower or lender who can choose when the change applies (call it, or wait for someone else to) can pick which rate covers a period. Nothing is lost today, because only the exit notice and fee are affected, and the exit fee takes the lower of the two values anyway.
- **Fix:** add an internal `_effectiveRules()` view in the vault that returns `pendingRules` when `effectiveAt != 0 && block.timestamp >= effectiveAt`, and pass that to Exits and LoanBook instead of `_rules`. Or call an `applyIfDue` hook at the start of every state-changing entry point (`contribute`, exits, loans). Keep `applyRuleChange()` only as a tidy-up.

### GOV-05. `_govForward(..., true)` returns from assembly, which skips modifier epilogues; adding `nonReentrant` there would brick the vault (Medium, latent, reasoned)

- **Where:** `CircleVault.sol:532-559`, the `return(ptr, returndatasize())` at line 556. OpenZeppelin `ReentrancyGuard` v5.1 keeps `_status` in storage.
- **Scenario:** today none of the eight `ret = true` entry points has a modifier, and `claimDissolution` correctly uses `ret = false`. If a later change (for example, LoanBook work adding `nonReentrant` "for safety" to `voteProposal`) puts a modifier on a forwarded function, the assembly `return` ends execution before `_nonReentrantAfter`, and `_status` stays `ENTERED` forever. From then on every `nonReentrant` function reverts: `contribute`, `requestExit`, `claimExit`, `processExits`, `withdraw`, `claimDissolution`. Every AVAX in the circle is stuck, and the contract is immutable (ADR 0020).
- The flip side: the forwarded writes are reentrant today. During any payout callback (`claimDissolution` sends all remaining gas through `Ledger.payOut`, and `withdraw` does too), the recipient can call `voteProposal`, `finalizeProposal`, `cancelProposal` or `applyRuleChange`. I found no harmful sequence, because every payer finishes its effects first and the claimer has already been removed. That is benign only because Governance writes don't touch money.
- **Fix:** (a) switch the vault to `ReentrancyGuardTransient` (Cancun is live on C-Chain), so a skipped epilogue can't outlive the transaction; or (b) make `_govForward` always return to Solidity (copy the return data into memory and `return` it from the Solidity body); and (c) add a unit test that calls every forwarded entry point and then `contribute()` in the same test, so a stuck lock fails CI. Put a `// NEVER add modifiers` comment on the forwarded functions.

### GOV-06. Dissolution claims are blocked forever if one loan is never repaid (Medium, design; must land with LoanBook)

- **Where:** `Governance.sol:303` (`if (ledger.loansOutstanding != 0) revert`).
- **Scenario:** once LoanBook exists, a borrower who defaults and never repays keeps `loansOutstanding > 0` for good. No member can claim. Exits still work, but each exit can only be paid out of cash, and the last shareholder's quote is all of `totalAssets` (`Exits._quote`), which includes the loan that will never come back. So the last exit waits forever.
- **Impact:** permanent loss of access for the last members out (funds stuck), which ADR 0021 avoids with "defaulted loans are written off evenly via NAV".
- **Fix:** LoanBook needs a write-off path (seize frozen shares, then reduce `totalAssets` and `loansOutstanding` by the shortfall) that is callable after a default and always callable once `dissolved`. Add an invariant: when dissolved, `loansOutstanding` reaches 0 in a bounded number of permissionless calls. ADR 0040's Consequences already say this; treat it as a LoanBook launch blocker.

### GOV-07. The proposer can cancel after the window closed, vetoing a passed vote (Low, proved)

- **Where:** `Governance.sol:261-271` (`cancel` checks only `status == Open` and the proposer).
- **Scenario:** a proposal that only passes at the deadline (6 yes of 12, quorum met) stays `Open` until someone finalizes it. The proposer can call `cancelProposal` after the deadline and turn an `Approved` result into `Cancelled`, or front-run a `finalizeProposal`. `test_GOV_07_cancelAfterDeadlineVetoesAPassedVote` shows the cancel goes through.
- **Impact:** one member overrides a decided vote. This hurts most for waivers that another member proposed for someone else, and for proposals other people backed.
- **Fix:** in `cancel`, revert if `block.timestamp > pr.deadline` or if `_outcome(pr, quorumPct, false) != Status.Open`. Simpler still: allow cancel only while `pr.yes + pr.no == 1`, before anyone else has voted.

### GOV-08. One member can hold the single rule-change slot over and over (Low, reasoned)

- **Where:** `Governance.sol:165` (`openRuleChange != 0`) and line 166-169 (a pending change blocks new ones).
- **Scenario:** any current voter opens a do-nothing rule change (the current rules again). Other changes are refused until the majority votes it down (about half the circle has to vote no for an early rejection at `passPct` 50) or the window ends, and the member can open it again right away. If the junk change passes on low turnout (GOV-01), it blocks every other change for the delay plus rounding to the next period: up to about 61 days with `ruleChangeDelayDays = 30`.
- **Impact:** a cheap way to delay a needed change, such as raising the reserve before a run of exits.
- **Fix:** reject proposals whose `newRules` equal the current rules (hash compare); after a rejected or expired rule change, give its proposer a cooldown (for example one voting window) before they can open another; optionally let a new rule change that passes replace a pending one, with a fresh delay.

### GOV-09. Members who can't vote can still use up proposal slots with self-waivers (Low, proved)

- **Where:** `Governance.sol:405-419` (`_waiverVoters`) plus the global cap `MAX_OPEN_PROPOSALS = 10`.
- **Scenario:** the subject of a waiver may propose it without being a current voter. That includes a **dormant** member, who owes nothing (`amountDue` uses the current period for dormant members), because `s.active` stays true and `nextPeriod` is stale. Test `test_GOV_09_dormantMemberOpensWaiver` shows a dormant member opening one. Five such members (dormant, more than a period behind, or newly admitted) fill all 10 global slots for a full voting window and reopen them as they expire. That blocks dissolve, guardian-off and rule-change proposals. Each waiver can be cleared early, but only when about half the circle votes no on it.
- **Impact:** governance DoS for up to `votingWindow` (14 days at most) per round, from members who don't even have a vote.
- **Fix:** in `_waiverVoters`, revert for `s.dormant`; allow one open waiver per subject (`openWaiverOf[member]`); and keep a few global slots for proposals from current voters (for example, waivers may use at most 5 of the 10).

### GOV-10. The quorum base counts voters who are behind and can't vote (Low, reasoned)

- **Where:** `eligible = m.voterCount` (`Governance.sol:398`). `voterCount` counts `voter && active && !dormant`, but `isCurrentVoter` also requires being at most one period behind (`Membership._isCurrentVoter`).
- **Scenario:** members who are two or more installments behind count toward quorum but can't vote. With a high `quorumPct` (say 80-100%), a few late payers make every proposal expire, including the guardian-off vote that is meant to protect against the guardian. They can catch up and then vote, because paying doesn't renew `seq`, so the invariant `yes + no <= eligible` still holds.
- **Impact:** governance freezes. Membership votes have the same issue.
- **Fix:** document it and have the UI warn when quorum can't be reached. Or keep a counter of current voters in O(1), which is hard because "behind" changes with time alone. The cheapest workable answer is to cap `quorumPct` lower (for example at 66) in `_validate`.

### GOV-11. After a dissolve, joins and other proposals keep going (Low, reasoned)

- **Where:** `CircleVault.requestToJoin` / `acceptInvite` / `proposeDormant` don't check `dissolved`. Governance blocks new proposals (`_open`), but proposals opened before the dissolve can still be voted, finalized and applied (`applyRuleChange` has no `dissolved` check).
- **Impact:** ADR 0021 says "new members stop". New members get 0 shares, so nothing is lost, but the factory registry records members of a dead circle, and a rule change can still apply after the dissolve. Confusing, and a trap if LoanBook later reads a rule.
- **Fix:** revert `requestToJoin`, `acceptInvite` and Membership `finalize` (admission) when `dissolved`; in `_close`, mark open proposals as `Cancelled` when they settle after a dissolve, and make `applyRuleChange` a no-op once dissolved.

### GOV-12. Notes for LoanBook integration (Info)

- `claimDissolution` ignores `frozen` and `loanTies`. That is fine while `loansOutstanding == 0` implies nobody is frozen. LoanBook must clear `frozen` in the same step as its write-off, or `claimDissolution` must check it.
- ADR 0019 asks that rage-quit exits keep the old rules for the whole notice period. Today a rage-quit exit has no notice, and `feeBps` is locked as the lower of the old and new fee, so this holds. Loan terms (`interestBps`, tenors) must be stored per loan when it is disbursed, or a rule change will reprice loans already running.

### GOV-13. Forwarder: checked and sound (Info, proved where noted)

- **Selector confusion:** each vault entry point passes its own hardcoded `Governance.X.selector`. The caller only controls bytes after offset `0xe4`, so it can't change the storage-slot header (`_gov`, `_m`, `_ledger`, `_rules`) or the settings (`installment`, `votingWindow`, `quorumPct`). All forwarded arguments are static, so the vault's ABI layout matches the library's.
- **Dirty or short calldata:** the vault's decoder rejects short calldata and dirty value types; dirty bits inside the `Rules.Params calldata` struct are rejected when the library reads the field. `test_GOV_15_forwarderRejectsDirtyAndShortCalldata` passes. Extra trailing bytes are copied but ignored.
- **View path:** `_govView` only ever forwards library `view` functions. Called by a plain CALL (not STATICCALL), it still writes nothing. `test_GOV_15b_viewPathDoesNotWrite` passes.
- **Direct calls to the library:** Solidity's call protection makes non-view library functions revert under a plain CALL. Delegatecalling the library from another contract only touches that contract's own storage.
- **Return data and reverts** pass through as they are. `memory-safe` holds: the forwarder writes past the free-memory pointer and then either leaves the call (`ret = true`) or doesn't need that memory again (`ret = false`).
- **`msg.value`:** the forwarded functions aren't payable, so the vault rejects value before the forward.
- The one real hazard is GOV-05.

### GOV-14. Vote integrity: checked and sound (Info)

- **Snapshot:** `canVoteAt` needs `seq <= seqSnapshot`, and every way to become a voter (`_addMember`, `recordPayment` granting voting rights, `_wake`, `acceptInvite`) renews `seq`. So `yes + no <= eligible` holds, and `e - no` in `_outcome` can't underflow. Exiting and rejoining gives a fresh `seq`, so nobody votes twice. `hasVoted` blocks voting twice with the same address.
- **Proposer:** the automatic yes is cast without `_canVoteOn`, but the proposer is always a current voter and so is counted in `eligible`. A self-proposed waiver casts no vote, and the subject is taken out of `eligible` exactly when `voterCount` counts them.
- `passPct` is copied when the proposal opens; `quorumPct` and `votingWindow` are immutable. Finalizing after the deadline always gives a non-`Open` result.
- **`_effectiveAt`:** rounds to 00:00 UTC on the 1st of the next month and handles a delay that ends exactly on a boundary (already covered by S-RT-32).

### GOV-15. Fee waivers: minor points (Info)

- A waiver can't target a paid month (`period < nextPeriod` reverts), but the member can pay, fees included, while the vote runs; the waiver then passes and refunds nothing (ADR 0040 knows this). The app should block paying while a waiver for that period is open, or warn.
- Two waivers for the same `(member, period)` can be open at once. Harmless, but each uses a slot (GOV-09).
- Friends can collude on waivers (A proposes for B, quorum met by a few yes votes). The impact is capped by the fee cap (ADR 0030): at most `fee1 + fee2` per month.

## 3. Priority matrix

| ID         | Title                                                    | Severity | Fix effort | When                        |
| ---------- | -------------------------------------------------------- | -------- | ---------- | --------------------------- |
| GOV-01     | Dissolve and other votes pass on votes cast, not members | High     | Low        | Before merge to `dev`       |
| GOV-02     | Exit fee charged after dissolve, keeper-forced           | Medium   | Low        | Before merge to `dev`       |
| GOV-05     | Assembly `return` skips modifiers (latent lock-brick)    | Medium   | Low        | Before merge to `dev`       |
| GOV-04     | Rule change applies only when poked                      | Medium   | Medium     | Before LoanBook             |
| GOV-03     | Ordinary rule change lowers the dissolve bar             | Medium   | Medium     | Before LoanBook (RT-12 ADR) |
| GOV-06     | Unrepaid loan blocks dissolution forever                 | Medium   | Medium     | With LoanBook (blocker)     |
| GOV-07     | Proposer cancels after the deadline                      | Low      | Low        | Next pass                   |
| GOV-09     | Non-voters fill proposal slots via self-waivers          | Low      | Low        | Next pass                   |
| GOV-08     | Rule-change slot griefing                                | Low      | Low        | Next pass                   |
| GOV-11     | Joins and old proposals continue after dissolve          | Low      | Low        | Next pass                   |
| GOV-10     | Quorum counts members who can't vote                     | Low      | Medium     | Document / UI               |
| GOV-12..15 | Notes and verified areas                                 | Info     | n/a        | n/a                         |

## 4. Fix checklist before Governance goes further

- [ ] GOV-01: dissolve (and guardian-off) need `dissolvePassPct` of **eligible** members even at the deadline; the proposer's own vote can never be the whole quorum. New ADR superseding the ADR 0040 wording.
- [ ] GOV-02: `Exits._quote` charges no fee once `dissolved`; `requestExit` reverts once `dissolved`.
- [ ] GOV-05: `ReentrancyGuardTransient`, or no assembly `return` in `_govForward`; a CI test that every forwarded entry point leaves the lock released.
- [ ] GOV-04: modules read `_effectiveRules()` (pending rules once `effectiveAt` has passed), not `_rules`.
- [ ] GOV-06 (LoanBook blocker): a write-off path that always brings `loansOutstanding` to 0 after a dissolve.

## 5. Proof tests

These live in the scratch worktree `D:\wt\review-gov\packages\contracts\test\GovReview.t.sol` (not committed). Run them with `forge test --match-contract GovReviewTest`. They should move into `CircleVault.governance.t.sol` as scenarios once the fixes land, renamed to their S-GOV IDs.

| Test                                                | Expectation                            | Result on `f2ed9e4`    |
| --------------------------------------------------- | -------------------------------------- | ---------------------- |
| `test_GOV_01_dissolveWithHalfTheCircle`             | 6 of 12 can't dissolve                 | FAIL (finding proved)  |
| `test_GOV_01b_singleProposerDissolvesAtLowQuorum`   | 1 of 5 can't dissolve                  | FAIL (finding proved)  |
| `test_GOV_02_exitFeeChargedAfterDissolve`           | exiter gets full stake                 | FAIL: 0.45 vs 0.5 AVAX |
| `test_GOV_04_rulesStaleAfterEffectiveAt`            | new rules in force after `effectiveAt` | FAIL: 100 vs 200 bps   |
| `test_GOV_07_cancelAfterDeadlineVetoesAPassedVote`  | cancel reverts after the deadline      | FAIL: cancel succeeded |
| `test_GOV_09_dormantMemberOpensWaiver`              | dormant member can't open a waiver     | FAIL: waiver opened    |
| `test_GOV_15_forwarderRejectsDirtyAndShortCalldata` | dirty/short calldata reverts           | PASS (sound)           |
| `test_GOV_15b_viewPathDoesNotWrite`                 | view via CALL writes nothing           | PASS (sound)           |

## 6. Fix status (branch `wt/fix-gx`, 2026-11-15)

Decisions in ADR 0043. The proof tests above were turned into regression tests in `packages/contracts/test/CircleVault.reviewFixes.t.sol` (scenario IDs `S-RV-GOV-*` in `docs/testing.md`); they assert the safe behaviour.

| ID     | Status            | Fix                                                                                                                    | Test                                                                          |
| ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GOV-01 | Fixed             | Dissolve and guardian-off need the pass mark of all eligible members (`Proposal.memberBar`); expire below it           | `test_S_RV_GOV_01_*`, `test_S_GOV_08_guardianOffNeedsMembersNotJustVotesCast` |
| GOV-02 | Fixed             | No exit fee once dissolved; `requestExit` reverts once dissolved                                                       | `test_S_RV_GOV_02_pendingExitAtDissolveIsPaidWithoutFee`                      |
| GOV-03 | Fixed             | Risky rule changes (`Rules.isRisky`) need `dissolvePassPct` of eligible members, flagged at proposal time              | `test_S_RV_GOV_03_*`                                                          |
| GOV-04 | Fixed             | `_syncRules()` at the start of every write that reads rules; views read the effective rules                            | `test_S_RV_GOV_04_rulesSwitchOverAutomatically`                               |
| GOV-05 | Fixed             | `ReentrancyGuardTransient`; forwarded writes never set the lock and refuse to run inside one                           | `test_S_RV_GOV_05_forwardedCallsNeverLeaveTheLockSet`                         |
| GOV-06 | Fixed             | Dissolution claims pay the share of cash now and can repeat; a defaulted loan is settled with no vote after a dissolve | `test_S_LIFE_02_claimsPayCashNowAndTheRestLater`, `test_S_RV_LOAN_02_*`       |
| GOV-07 | Fixed             | Cancel only while voting is open (open + in time = undecided)                                                          | `test_S_RV_GOV_07_proposerCannotCancelAfterTheDeadline`                       |
| GOV-08 | Fixed             | One new proposal per member per 24 hours                                                                               | `test_S_GOV_03_proposalSpamIsRateLimited`                                     |
| GOV-09 | Fixed             | Only current voters propose waivers; none for a dormant member                                                         | `test_S_RV_GOV_09_dormantOrBehindMembersCannotOpenWaivers`                    |
| GOV-10 | Open (documented) | Members behind or frozen still count in the quorum base; members in exit notice no longer do. UI should warn           | n/a                                                                           |
| GOV-11 | Open (Low)        | Joins and pre-dissolve proposals still run after a dissolve; harmless (0 shares)                                       | n/a                                                                           |
| GOV-12 | Fixed             | Tied or frozen members can't claim dissolution; loan terms (incl. fee and default limit) are fixed per loan            | `test_S_RV_LOAN_02_*`, `test_S_RV_LOAN_04_*`                                  |
| GOV-13 | Sound             | Kept as regression tests                                                                                               | `test_S_RV_GOV_13_*`                                                          |
| GOV-14 | Sound             | `yes + no <= eligible` still holds: a cancelled exit renews the voting stamp                                           | invariant I-13                                                                |
| GOV-15 | Open (Info)       | App should warn about paying while a waiver for that month is open                                                     | n/a                                                                           |
