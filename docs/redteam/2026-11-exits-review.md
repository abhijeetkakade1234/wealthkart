# Exits module review (2026-11-15)

Independent review of the Exits module on branch `abhijeet` at `f2ed9e4`. Done with the `solidity-hardening` checklist first, then a `redteam-attack` pass. Written as Markdown instead of the skill's .docx so it sits next to the plan red team.

## 0. Scope and method

**Reviewed:** `packages/contracts/src/modules/Exits.sol`, the EXITS section of `CircleVault.sol` (lines 318-401), and how they touch `Ledger` (`totalAssets`, `totalShares`, `exitsWaiting`, `pausedUntil`, `withdrawable`, the capped-gas send) and `Membership` (`removeMember`, `frozen`, `loanTies`, `dormant`). Read against ADR 0006, 0019, 0020, 0037, 0039 and RT-14, RT-17, RT-18, RT-20, RT-21.

**Attacker model:** one to three colluding members (joins need a vote, so sybils cost social capital, not money); any outside caller of the permissionless functions (`processExits`, `performUpkeep`, `unpause` after the guardian is gone); a member whose wallet is a hostile contract.

**Not in scope:** LoanBook is not built, so `loansOutstanding`, `frozen` and `loanTies` were set with `vm.store` in tests, as the existing suite does. RT-18 haircuts are out of scope by ADR 0039 and only noted where they combine with something new.

**Proof:** throwaway Foundry tests in the review worktree, `D:\wt\review-exits\packages\contracts\test\Review.exits.t.sol` (not committed). Run with `forge test --isolate --match-contract ReviewExitsTest -vv`. "Proved" below means a test in that file reproduces the behaviour. These tests assert the current (buggy) behaviour, so they pass today and should be flipped into regression tests once a fix lands.

**Severity:** Critical = funds stolen or stuck for good, little effort. High = real damage, profitable. Medium = real but bounded or conditional. Low = minor or hard to use. Info = no exploit, worth knowing.

## 1. Summary

| Severity | Count |
| -------- | ----- |
| Critical | 0     |
| High     | 0     |
| Medium   | 3     |
| Low      | 3     |
| Info     | 6     |

No way was found to take money out that isn't owed, or to lose a payout. The solvency books (`balance == totalAssets - loansOutstanding + totalWithdrawable`) hold on every exit path I tried. The 50k payout cap with the 150k floor held up: I could not tune the caller's gas to force a payout into `withdrawable` (EXIT-09). The problems are about liveness: the append-only queue with stale slots lets a few members stall exits and cancels, and the Chainlink check goes blind after 20 settled slots even without an attacker.

| ID      | Title                                                                       | Severity | Fix effort | Proved                 |
| ------- | --------------------------------------------------------------------------- | -------- | ---------- | ---------------------- |
| EXIT-01 | Stale-slot gap makes `cancelExit` and `processExits` unbounded              | Medium   | Medium     | Yes                    |
| EXIT-02 | `checkUpkeep` goes blind after 20 settled slots at the front                | Medium   | Low        | Yes                    |
| EXIT-03 | Zero-notice rage-quit opens a bank-run window on any passed rule change     | Medium   | Medium     | No (needs LoanBook)    |
| EXIT-04 | Arrears and late fees are forgiven on exit                                  | Low      | Low        | Yes                    |
| EXIT-05 | `claimExit` lets a later exit take cash ahead of an earlier matured one     | Low      | Low        | Yes                    |
| EXIT-06 | A member in their notice keeps full voting power                            | Low      | Low        | No (by reading)        |
| EXIT-07 | Dissolution leaves stale `waiting` entries in `exitsWaiting`                | Info     | Low        | No                     |
| EXIT-08 | 0-share member takes everything if `totalShares == 0` but `totalAssets > 0` | Info     | Low        | No (unreachable today) |
| EXIT-09 | Gas floor and capped send: checked, holds                                   | Info     | n/a        | Yes (no grief window)  |
| EXIT-10 | Solvency invariant should be `>=`, not `==`                                 | Info     | Low        | No                     |
| EXIT-11 | A creator who leaves and rejoins gets the guardian role back                | Info     | Low        | No                     |
| EXIT-12 | ADR 0039 and 0019 say things the code doesn't do                            | Info     | Low        | n/a                    |

## 2. Findings

### EXIT-01. Stale-slot gap makes `cancelExit` and `processExits` unbounded

- **Severity:** Medium. **Fix effort:** Medium. **Proved:** yes (`test_EXIT01_staleGapMakesCancelAndProcessingUnbounded`, `test_EXIT01_waitersBehindGapCannotBePaid`).
- **Where:** `Exits.sol:147-152` (cancel pop loop), `Exits.sol:183-202` (processExits scan), `Exits.sol:169` (claim rule).
- **Scenario:**
  1. An exit X is in its notice at the head of the queue. It can be an honest member's, or a third colluding member's.
  2. Members B and C alternate: B and C request; then repeatedly B cancels (B is not the tail, so the slot stays), B requests again, C cancels, C requests again. Each round leaves two settled slots that `cancelExit`'s tail pop never reaches, because the tail is always the other member's live entry. ADR 0039 knows this pattern exists ("two members working together") but treats it as a keeper gas cost only.
  3. Victims request after the gap.
- **Impact, measured with `--isolate`:**
  - **Cancel is blocked.** With 2,000 settled slots, the victim's `cancelExit` pops its own slot plus the whole gap: 12.4M gas. At around 2,500 slots it no longer fits a 15M-gas block, so the victim can't take back their exit request until someone pays to drain the gap.
  - **Waiters can't be paid.** With 7,000 settled slots, a `processExits{gas: 15M}(max)` call used 14.6M gas, paid nobody, and did not move `head` (X is not done, so the prefix never advances). Two victims who rage-quit while cash was lent out are both `waiting`. After the cash comes back, neither can `claimExit`, because the claim rule allows only the sole waiter (`exitsWaiting == 1`). `checkUpkeep` returns false. ADR 0039's "claimExit always works" doesn't hold once two exits wait.
  - **How long it lasts:** until X matures and is paid, up to `exitNoticeDays`; after that, someone has to spend many transactions draining the gap. Lending stays frozen the whole time, because `exitsWaiting > 0`.
  - **Cost to the attacker:** about 0.13M gas per settled slot, so roughly 0.9B gas for 7,000 slots. That is about 1-25 AVAX depending on the base fee, which is cheap enough to grief a small circle.
- **Fix:** stop leaving stale slots in the middle. Replace the array with a doubly linked list keyed by address (`prev`, `next`, `first`, `last`), so `cancelExit`, paid exits and drops unlink in O(1) and scans only ever touch live exits. If you keep the array, the minimum fix is all of these together:
  - Cap the pops in `cancelExit` (for example 16 per call).
  - Count settled slots against `maxCount` but not against gas, by letting `processExits` take a `startIndex` hint.
  - Change the claim rule to "pay if no live waiting exit sits ahead of me". That needs an ordered waiting count, or a `waitingAhead` check via a `firstWaitingSlot` pointer.
  - Add a per-member cooldown between `cancelExit` and the next `requestExit`, such as 1 day, which makes building a gap slow.

### EXIT-02. `checkUpkeep` goes blind after 20 settled slots at the front

- **Severity:** Medium. **Fix effort:** Low. **Proved:** yes (`test_EXIT02_upkeepBlindAfterTwentySettledSlots`).
- **Where:** `Exits.sol:249-267` (`upkeepNeeded` looks only at `head .. head+19`), `CircleVault.sol:356-359` (`performUpkeep` processes 20 slots).
- **Scenario:** no attacker is needed. Self-claims (`claimExit`) and mid-queue cancels leave settled slots but never move `head`. Only `processExits` moves it, and only when it runs. Once 20 settled slots pile up at the front, `upkeepNeeded` skips all of them and returns false, even though `processExits` would both advance `head` and pay matured exits further back. Chainlink never calls `performUpkeep` again. Even a forced `performUpkeep` only skims the 20 settled slots.
- **Impact:** the "auto-paid" promise quietly stops working. In the test, three matured exits sat unpaid until a manual `processExits(100)` paid all three. Self-claim covers a single exit, but not several exits waiting on cash (see EXIT-01). Members using "Collect now" in the app is exactly what fills the front with settled slots.
- **Fix:**
  - Have `upkeepNeeded` return true when `queue[head]` is settled, because advancing `head` is useful work.
  - Have `performUpkeep` loop until `head` reaches a live slot, bounded by gas rather than by 20 slots.
  - Simplest of all: advance `head` inside `claimExit` and `cancelExit` while `queue[head]` is settled, bounded to a few steps.
  - With the linked list from EXIT-01 the problem goes away.
- Add a test: S-EXIT-04b, 20 self-claims then one matured exit, and `checkUpkeep` must be true.

### EXIT-03. Zero-notice rage-quit opens a bank-run window on any passed rule change

- **Severity:** Medium (High once LoanBook ships without the RT-18 haircut). **Fix effort:** Medium. **Proved:** no, because it needs loans.
- **Where:** `Exits.sol:127` (`notice = 0` while `now < rageQuitUntil`), `Governance.sol` sets `rageQuitUntil = effectiveAt`.
- **Scenario:** any rule change that passes, even a harmless one, opens a window where every member can exit with no notice. The window runs from the vote until the next period start after the delay, so 7 to about 37 days. During it, members who hear that a borrower is in trouble exit at once at full NAV, because `totalAssets` counts loans at face value until default (RT-08, RT-18). A majority can also pass a trivial change just to open the window for themselves.
- **Impact:** the notice period is the main brake on runs, and this turns it off often. The loss lands on whoever stays. ADR 0019 says rage-quit is "exit under the old rules (current notice period, current fees)". ADR 0039 chose zero notice instead, and the two ADRs now disagree.
- **Fix (choose one, record it in a new ADR that supersedes the rage-quit part of 0039):**
  - (a) Keep the normal notice for rage-quit, but freeze the exiter's terms at the old rules (fee lock already exists; also lock installment and other parameters).
  - (b) Zero notice only for members who voted no or didn't vote on that change.
  - (c) Zero notice, but apply the RT-18 haircut at payout.
  - Whichever you choose, don't ship LoanBook until RT-18 is resolved.

### EXIT-04. Arrears and late fees are forgiven on exit

- **Severity:** Low. **Fix effort:** Low. **Proved:** yes (`test_EXIT05_arrearsAndLateFeesForgivenOnExit`: four months unpaid, 0.52 AVAX of installment plus fees owed, paid full NAV minus the exit fee).
- **Where:** `Exits.sol:113-138`. `requestExit` doesn't look at `periodsOverdue` or the late fees owed.
- **Scenario:** a member stops paying, lets fee 1 and fee 2 build up, then exits. Nobody else's shares are diluted, because missed months simply mint no shares. But the penalties that PLAN.md says go "into the vault" are never collected.
- **Fix:** at payout, subtract the late fees owed (`_lateFees` for each overdue period, capped as usual) from the payout and leave them in the vault, or require `periodsOverdue == 0` to request. Deduction is friendlier and can't trap anyone. Skip dormant members, who owe nothing by design.

### EXIT-05. `claimExit` lets a later exit take cash ahead of an earlier matured one

- **Severity:** Low. **Fix effort:** Low. **Proved:** yes (`test_EXIT06_claimJumpsTheQueue`).
- **Where:** `Exits.sol:169`.
- **Scenario:** A and B both matured; cash covers one; nobody has marked A `waiting` yet (the keeper is a block behind, or blind per EXIT-02). B calls `claimExit`: `exitsWaiting == 0`, so B is paid and A waits. FIFO only holds among exits already marked.
- **Fix:** in `claimExit`, before paying, walk from `head` to the caller's slot (bounded, say 20) and mark any earlier matured live exit `waiting`. If any were found, don't pay. With the linked list, keep a `firstMatured` pointer instead.

### EXIT-06. A member in their notice keeps full voting power

- **Severity:** Low. **Fix effort:** Low. **Proved:** no, found by reading.
- **Where:** `Membership` voter flags aren't touched by `requestExit`.
- **Scenario:** a leaver votes on joins, dormancy, rule changes, dissolution and, once LoanBook exists, loans whose outcome they won't share. With RT-18 open, a leaver can approve a friend's risky loan and be gone before it defaults.
- **Fix:** while `exitOf(member).slot != 0`, leave the member out of new vote snapshots and refuse their votes on loan requests. `cancelExit` gives the rights back.

### EXIT-07. Dissolution leaves stale `waiting` entries in `exitsWaiting`

- **Severity:** Info. **Fix effort:** Low.
- **Where:** `Governance.sol:311` calls `removeMember` directly and never clears the exit entry.
- **Impact:** a member whose exit was `waiting` and who then takes `claimDissolution` stays counted in `exitsWaiting` until `processExits` reaches and drops the entry. Behind a gap (EXIT-01), that can take a long time. It doesn't matter while the circle is dissolved, but invariant I-10 ("exact count") is temporarily false.
- **Fix:** have `claimDissolution` call an Exits hook (`Exits.clearFor(member)`) that runs `_clear`, or block `requestExit` once `dissolved` is set and clear existing entries on claim.

### EXIT-08. 0-share member takes everything if `totalShares == 0` but `totalAssets > 0`

- **Severity:** Info (unreachable today). **Fix effort:** Low.
- **Where:** `Exits.sol:362` (`shares == total` returns all of `totalAssets`) and the same branch in `Governance.sol:306`.
- **Scenario:** if assets ever arrive while no shares exist, a member with 0 shares matches `shares == total` and is paid the whole vault. Examples are a fee or interest paid by a 0-share member after the last holder left, or a future migration credit. Today every inflow mints shares, so this can't be reached; LoanBook could change that.
- **Fix:** guard the branch with `shares != 0`. With 0 shares, the payout is 0 and the member is simply removed.

### EXIT-09. Gas floor and capped send: checked, holds

- **Severity:** Info. **Proved:** yes. `test_EXIT03_tunedGasPushesPayoutIntoWithdrawable` swept the caller's gas from 150k to 400k in 500-gas steps against a wallet that needs at least 47k gas in `receive`. No gas value made the payout fall back to `withdrawable`. The test fails, which is the good outcome here.
- **Notes:**
  - The send at `Exits.sol:385` copies no return data, so a return bomb costs nothing.
  - A refused send is credited to `withdrawable` after effects, so no value is lost.
  - Reentry inside the 50k cap hits `nonReentrant` on every Exits entry point, and the payee is already removed, so it can't vote.
  - A gas-burner wallet costs the batch at most about 61k gas.
  - The margin depends on how much gas `_settle` spends before the call (`removeMember` writes a fresh `nameFreeAt` slot). Add `if (gasleft() < PAYOUT_GAS + 30_000) revert` immediately before the call, so a later change to the effects can't open a grief window unnoticed.

### EXIT-10. Solvency invariant should be `>=`, not `==`

- **Severity:** Info. **Fix effort:** Low.
- AVAX forced in (selfdestruct from a contract created in the same transaction, or a coinbase reward) raises `balance` without touching the books. The vault never reads `balance`, so nothing breaks, but the invariant tests and any off-chain monitor that asserts `==` will raise false alarms. Assert `balance >= totalAssets - loansOutstanding + totalWithdrawable`.
- I found no path that breaks `>=`. Payout reduces `totalAssets` by exactly what is sent or credited. The fee stays in `totalAssets` with shares burned. The last holder takes `totalAssets` but only up to cash.

### EXIT-11. A creator who leaves and rejoins gets the guardian role back

- **Severity:** Info. **Fix effort:** Low.
- **Where:** `Exits.sol:216` (the guardian is `creator` while `active`).
- After the creator exits, anyone can unpause, which is good. If the creator later rejoins by vote, they hold the pause again. The 90-day cooldown still applies, so this is limited. If that isn't intended, set `guardianDisabled` when the creator is removed.

### EXIT-12. ADR 0039 and 0019 say things the code doesn't do

- **Severity:** Info.
- ADR 0039 says "`claimExit` always works": it doesn't when two or more exits wait (EXIT-01).
- ADR 0039 says the untouched-matured gap "is one upkeep": not after 20 settled slots (EXIT-02).
- ADR 0039 says the settled-slot gap "never blocks payment for good": true, but cancels can be blocked and payment delayed by up to the notice period plus drain time.
- ADR 0019's "current notice period" contradicts 0039's zero notice (EXIT-03).
- Supersede with a new ADR once the fixes are chosen. Don't edit the accepted ones.

## 3. What was checked and found sound

- **CEI in `_settle`:** entry cleared, shares and assets reduced and the member removed before the send. Every vault entry point into Exits is `nonReentrant`.
- **`exitsWaiting`:** set once per entry, cleared in `_clear` on pay, cancel and drop. It doesn't drift within Exits; the only drift is EXIT-07, from outside.
- **`head` and slots:** `cancelExit` pops only while `len > head`, so `head <= queue.length` always holds, and `processExits` can't underflow `len - i`. A reused index can't revive a stale entry, because entries are keyed by address and checked against `slot == i + 1`.
- **Rounding:** `assetsForShares` rounds down with a virtual offset, and the fee rounds up (`Math.Rounding.Ceil`), so both favour the circle. The last-holder branch avoids dust.
- **Fee lock:** the lower of the locked and current fee applies. Requesting early is a free option on the lower fee, but only while the exit is pending, and the keeper pays it as soon as it matures. Acceptable.
- **Dormant, frozen and loan-tied members:** request is refused while frozen or tied; frozen or tied during the notice means the exit is dropped, not paid. Dormant members exit with their shares, and `dormantCount` is kept right in `removeMember`.
- **Guardian:** pause lasts 14 days, at most once per 90 days, only while the creator is a member and not voted off. No Exits path checks `paused`, and `guardianOff` clears `pausedUntil`.
- **Gas bounds:** `upkeepNeeded` is bounded at 20 slots and `processExits` by `maxCount` plus the gas floor. The unbounded cases are only the stale-slot ones in EXIT-01 and EXIT-02.

## 4. Fix order

1. EXIT-01 and EXIT-02 together: move the queue to a linked list, or at minimum advance `head` in claim and cancel, cap cancel pops, and make `upkeepNeeded` treat a settled head as work. Add scenarios S-EXIT-14 (gap griefing) and S-EXIT-04b (upkeep after self-claims).
2. EXIT-03: decide the rage-quit notice in an ADR before LoanBook lands; pair it with RT-18.
3. EXIT-04, EXIT-05, EXIT-06: small changes, do them with LoanBook.
4. Info items whenever the files are next touched; supersede ADR 0039 for EXIT-12.

## 5. Fix status (branch `wt/fix-gx`, 2026-11-15)

Decisions in ADR 0043. The proof tests were flipped into regression tests in `packages/contracts/test/CircleVault.reviewFixes.t.sol` (`S-RV-EXIT-*` in `docs/testing.md`).

| ID      | Status                | Fix                                                                                    | Test                                                           |
| ------- | --------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| EXIT-01 | Fixed                 | Doubly linked list of live exits; cancel, payout and drop unlink in O(1)               | `test_S_RV_EXIT_01_*`, invariant I-13                          |
| EXIT-02 | Fixed                 | No settled slots exist; upkeep checks the first 20 live exits                          | `test_S_RV_EXIT_02_upkeepStillSeesMaturedExitsAfterSelfClaims` |
| EXIT-03 | Fixed                 | Rage-quit exits mature at `min(now + notice, rageQuitUntil)` under the old rules       | `test_S_RV_EXIT_03_*`, `test_S_EXIT_12_*`                      |
| EXIT-04 | Won't fix (by design) | Missed months bought no shares; recorded in ADR 0043                                   | `test_S_RV_EXIT_04_arrearsAreForgivenOnExitByDesign`           |
| EXIT-05 | Fixed                 | `claimExit` settles the queue in order up to the caller                                | `test_S_RV_EXIT_05_claimCannotJumpTheQueue`                    |
| EXIT-06 | Fixed                 | `Member.exiting`: no vote, no proposal, out of `voterCount`; fresh stamp on cancel     | `test_S_RV_EXIT_06_leaverLosesTheVoteUntilCancel`              |
| EXIT-07 | Fixed                 | A dissolution claim clears the claimant's exit; no new exits once dissolved            | `test_S_RV_GOV_02_dissolutionClaimClearsAWaitingExit`          |
| EXIT-08 | Fixed                 | A 0-share member never counts as the last shareholder                                  | covered by `_quote` (`shares != 0`)                            |
| EXIT-09 | Fixed                 | One send path (`Ledger.payOut`) with a 90k gas floor before the 50k-capped send        | `test_S_RV_EXIT_09_tunedGasNeverPushesAPayoutIntoWithdrawable` |
| EXIT-10 | Fixed                 | Balance invariants assert `>=`                                                         | `invariant_I9_*`, `invariant_S_LOAN_28_*`                      |
| EXIT-11 | Fixed                 | The guardian role ends for good when the creator leaves                                | `test_S_RV_EXIT_11_creatorWhoLeavesNeverGuardsAgain`           |
| EXIT-12 | Fixed (docs)          | ADR 0043 supersedes the zero-notice rage-quit, queue design and claim rule of ADR 0039 | n/a                                                            |
