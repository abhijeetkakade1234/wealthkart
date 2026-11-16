# LoanBook security review (November 2026)

- **Date:** 2026-11-15
- **Commit:** `6c2e9f3` on `abhijeet`
- **Scope:** `packages/contracts/src/modules/LoanBook.sol`, `src/interfaces/ILoanBookViews.sol`, the LOANS section of `src/CircleVault.sol` (including `_loanView`), and how loans touch `Ledger`, `Membership`, `Rules`, `Exits` and `Governance`.
- **Method:** line-by-line read using the `solidity-hardening` checklist, then the `redteam-attack` layers (business logic, state and concurrency, economic abuse, denial of service). Interest math was checked month by month against `packages/rules/src/interest.ts`. Every High and Medium finding has a Foundry proof.
- **Proof tests:** `packages/contracts/test/CircleVault.loansReview.t.sol` in the throwaway worktree `D:\wt\review-loans` (branch `wt/review-loans`, not committed). Run with `forge test --match-contract CircleVaultLoansReviewTest -vv`. All 4 pass, which means each attack works on `6c2e9f3`.

## Summary

| ID      | Title                                                                                                       | Severity | Proven                |
| ------- | ----------------------------------------------------------------------------------------------------------- | -------- | --------------------- |
| LOAN-01 | Mutual guarantees (or guarantor with own loan) count the same stake twice                                   | High     | Yes, `test_LOAN_01_*` |
| LOAN-02 | After dissolution nobody can vote a settle, so a defaulted loan locks `claimDissolution` forever            | High     | Yes, `test_LOAN_02_*` |
| LOAN-03 | Return-bomb borrower wallet makes disbursal revert forever and keeps the guarantor tied                     | Medium   | Yes, `test_LOAN_03_*` |
| LOAN-04 | `defaultAfter` and `interestFee` follow live rules, so a rule change reprices running loans                 | Medium   | Yes, `test_LOAN_04_*` |
| LOAN-05 | Payout doesn't recheck borrower or guarantor standing, or rules changed since the request                   | Low      | No                    |
| LOAN-06 | Interest and fees on a defaulted loan never stop, so a slow settle vote moves guarantor value to the others | Low      | No                    |
| LOAN-07 | A matured but unclaimed exit isn't in `exitsWaiting`, so a loan can still take its cash (RT-17 partial)     | Low      | No                    |
| LOAN-08 | Frozen (defaulted) members keep voting on other loans and settles                                           | Low      | No                    |
| LOAN-09 | Borrower or guarantor in exit notice can still borrow or guarantee (`TODO(merge)`)                          | Low      | No                    |
| LOAN-10 | Governance entry points have no `nonReentrant`, so the disbursal callee can re-enter them                   | Info     | No                    |
| LOAN-11 | `_loanView` delegatecall-in-view: reviewed, safe                                                            | Info     | n/a                   |
| LOAN-12 | Rule 17 bypass (repay all but 1 wei in the payout month), already recorded in ADR 0038                      | Info     | No                    |

**Counts:** 0 Critical, 2 High, 2 Medium, 5 Low, 3 Info.

Solvency invariants held in every path I tried, including both proofs that move money: `balance == totalAssets - loansOutstanding + totalWithdrawable` and `loansOutstanding == sum(principal)` (`_assertBooks` runs after the double settle in `test_LOAN_01`). I found no reentrancy that moves money, no overflow, and no rounding that favours a borrower.

---

## High

### LOAN-01. Mutual guarantees count the same stake twice

- **Where:** `LoanBook.sol:559-566` (`_checkGuarantor`), `:548-553` and `:570-586` (`_limit`).
- **Scenario:** `_checkGuarantor` only refuses a guarantor who already guarantees someone (`guaranteeOf[g] != 0`). It never asks whether the guarantor has a loan or request of their own, and `_checkRequest` never asks whether the borrower is guaranteeing someone. So:
  1. A (stake 0.5) asks for k x (A + G) = 2 AVAX with G as guarantor. G accepts. The circle approves.
  2. G asks for k x (G + A) = 2 AVAX with A as guarantor. `guaranteeOf[A]` is empty, so A can accept. The circle approves.
  3. Both walk away. 4 AVAX is out against 1 AVAX of combined stake.

  The simpler variant does the same thing at half the scale: G holds their own k x G loan and also guarantees A for k x (A + G), so G's shares back both loans.

- **Impact:** the proof settles both defaults. The other 10 members lose **3 AVAX against a 1 AVAX combined stake**. RT-15 accepts (k - 1) x stake = 1 AVAX as the trust a pair can abuse, so this is triple. ADR 0038 says "one guarantee at a time covers RT-16's double counting". It doesn't, because a stake can still be counted once as "own" and once as "guarantor".
- **Fix (smallest):** a member backs at most one loan in total, in any role.
  - In `_checkGuarantor`, also revert if `s.loans[g].principal != 0 || s.pendingOf[g] != 0`.
  - In `_checkRequest`, revert if `s.guaranteeOf[b] != address(0)`.
  - Check both again at `acceptGuarantee` and at payout in `_decide`.
  - The full RT-16 fix (`lockedShares` per member, sum locked <= shares, own loan locks amount / k) is better and also covers LOAN-05's frozen-guarantor case.
- **Test:** `test_LOAN_01_mutualGuaranteesCountTheSameStakesTwice`.

### LOAN-02. A dissolved circle can never settle a default, so dissolution claims lock forever

- **Where:** `LoanBook.sol:283` (`proposeSettle` needs `isCurrentVoter`), `:643` (`_canVoteOn` uses `canVoteAt`), `Membership.sol:549-553` (current voter = at most 1 period behind), `CircleVault.sol:201` (`contribute` reverts once dissolved), `Governance.sol:303` (`claimDissolution` needs `loansOutstanding == 0`).
- **Scenario:**
  1. The circle votes to dissolve while a loan is out.
  2. `contribute` reverts from then on, so every member's `nextPeriod` stops moving. Two months later nobody is a current voter.
  3. The borrower stops paying. `markDefault` works (anyone can call it), but `proposeSettle` reverts `NotAVoter` for every member, and nobody can catch up to get the vote back.
  4. `loansOutstanding` never reaches 0, so `claimDissolution` reverts `LoansStillOutstanding` forever. Governance proposals are closed too (`CircleDissolved`), so there is no way out.

  A borrower who keeps paying interest isn't even in default until the third tenor ends, which is up to 3 x 24 = 72 months away with `tenorMonths` at its bound. When the default finally comes, nobody can vote on it.

- **Impact:** the dissolution path is bricked. Members who aren't tied can still leave through `Exits` (with notice and exit fee), but they are paid at a NAV that counts the bad loan at par. Cash runs out before everyone is paid. The last members, plus the borrower's and guarantor's shares, are stuck for good. This is the "funds stuck forever" outcome.
- **Fix:**
  - Once `dissolved`, make a defaulted loan settle permissionlessly with no vote (the circle already chose to wind down). For example, `settleDissolved(borrower)` callable by anyone once `ln.defaulted && led.dissolved`.
  - Also on dissolution, make every running loan due: `_defaultable` returns true when `dissolved && period > dissolvedPeriod + graceMonths`. A loan can then never hold claims hostage for years.
  - Or let `claimDissolution` pay the cash pro rata while loans are out, keeping a claim on later recoveries.
- **Test:** `test_LOAN_02_dissolvedCircleCanNeverSettleSoClaimsLockForever`.

---

## Medium

### LOAN-03. A return-bomb borrower blocks disbursal forever and keeps the guarantor tied

- **Where:** `Ledger.sol:53-63` (`payOut` uses `(bool ok,) = to.call{value: amount}("")` with all gas, and Solidity copies the return data), called from `LoanBook.sol:768`. `Exits._send` (`Exits.sol:380-392`) already does the safe version: a gas cap and no return-data copy.
- **Scenario:** the borrower is a smart-contract wallet, a passkey or AA wallet, or an EIP-7702 delegated EOA. Its `receive` returns a buffer sized so that memory expansion uses about 95% of the gas it was forwarded. The vault then has to copy that buffer with the 1/64 that is left, so it always runs out of gas. Raising the tx gas limit doesn't help, because the buffer grows with the gas.
  1. Ask for a loan naming guarantor G, who accepts. Then arm the bomb.
  2. Votes end 5 yes / 1 no of 11: quorum is met, but yes isn't over half of all 11, so the vote passes only at window end.
  3. Every `finalizeLoan` after the deadline takes the Approved branch, calls `_disburse`, and reverts. A year later it still reverts. The request stays `Open`, and the "one more window then Failed" escape only covers the exits and pause branch.
  4. G can't `requestExit` (`HasLoanTies`). Only the borrower can release G, by calling `cancelLoanRequest`.

  An early-deciding yes vote also always reverts, so the honest voter pays for a failed tx.

- **Impact:** a hostile borrower holds a friend's exit hostage for as long as they like and leaves a permanent open request. No funds are lost.
- **Fix:** use the Exits pattern inside `Ledger.payOut`: `assembly { ok := call(PAYOUT_GAS, to, amount, 0, 0, 0, 0) }`, falling back to `withdrawable`. Every payout path (loans, dissolution) is then bomb-proof. Optionally, also close any request as Failed once `deadline + votingWindow` has passed, whatever the reason it is still open.
- **Test:** `test_LOAN_03_returnBombBorrowerLocksGuarantorForever` (uses a `BombWallet` member).

### LOAN-04. `defaultAfter` and `interestFee` are read live, so rule changes reprice running loans

- **Where:** `LoanBook.sol:430` and `:856-865` (`_defaultable(ln, r.defaultAfter, …)`), `:356`, `:921` and `:826` (`fees = overdue * r.interestFee`), `:875` (`_maybeCure`).
- **Scenario:** ADR 0038 copies rates and tenor length at payout so that "a later rule change never reprices a running loan", but leaves late fees and `defaultAfter` live. A majority passes `defaultAfter` 2 -> 1 (bound 1..6). After the 7-day delay, any borrower one month late is in default at once. Both borrower and guarantor are frozen, and a settle vote can burn their shares. Raising `interestFee` (up to installment / 2) applies again to months already overdue. Borrower and guarantor can't use the rage-quit window, because loan ties block exits.
- **Impact:** a bloc can turn a minor delay into a share seizure, or raise the cost of an existing loan after the fact. The proof shows `markDefault` succeeding one month late, where it would have reverted under the rules the loan was taken on.
- **Fix:** copy `defaultAfter` and `interestFee` into `Loan` at payout (`uint8` plus a `uint128`; one more slot), or apply `max(copied, current)` for `defaultAfter` and `min(copied, current)` for `interestFee`, so changes can only help the borrower. Record the change in a new ADR that supersedes this line of 0038.
- **Test:** `test_LOAN_04_defaultAfterChangeAppliesToRunningLoans`.

---

## Low

### LOAN-05. Payout skips several request-time checks

- **Where:** `LoanBook.sol:729-736`. Payout rechecks only `bm.active`, `bm.frozen` and `_limit`.
- **Not rechecked between request and payout** (up to 2 voting windows):
  - Borrower: still a current voter (could now be over 1 period behind), and not dormant. A dormant member is treated as a lost wallet (ADR 0032), and the loan is still sent to that address.
  - Guarantor: still active, not dormant, not frozen. A guarantor whose own loan defaulted still backs the new loan, and their shares are claimed twice.
  - Rules: `medicalCap` (could now be 0 = medical off, or lower), `guarantorRequired`, `minMembersForLoans`.
- **Fix:** move the request checks into one `_eligible(q)` helper and call it at payout, closing as Failed when it returns false. Add `!bm.dormant && Membership.isCurrentVoter(m, b)`, plus `_checkGuarantor`-style state for `q.guarantor` (minus the `guaranteeOf` test, which is now this request).

### LOAN-06. Interest and fees on a defaulted loan never stop

- **Where:** `_owed` (`LoanBook.sol:818-827`), `_settle` (`:921`).
- **Scenario:** after `markDefault`, interest at `rate3` and `interestFee` per overdue month keep growing with no cap. ADR 0030 caps installment late fees, but nothing caps fees on loan interest. The settle debt is taken from the guarantor's shares, and the other members gain every month the settle vote is delayed, so they have no reason to hurry. `_settle` also charges the current month's interest even though it isn't due yet.
- **Fix:** freeze accrual at `markDefault` (store `defaultPeriod`, cap `_owed` at it), or cap total fees at 50% of principal. In `_settle`, count interest only up to `lastDue`.

### LOAN-07. Matured but unclaimed exits don't block disbursal

- **Where:** `LoanBook.sol:719`; `Exits.sol:340-347` (`exitsWaiting` goes up only when a claim or `processExits` call finds no cash).
- **Scenario:** an exit whose notice ended but that nobody has processed yet counts for nothing. A loan approved in that gap drains cash, and the exit then waits behind it. The reserve normally covers a single exit, so the main risk is several exits maturing together.
- **Fix:** have `_decide` call the Exits "is any exit matured" view (O(1) at the queue head), or let Exits bump `exitsWaiting` when the notice ends (`maturesAt` known). A cheap alternative: in `_decide`, refuse when the head of the queue has `maturesAt <= block.timestamp`.

### LOAN-08. Defaulted members keep voting

- **Where:** `_canVoteOn` (`LoanBook.sol:636-644`) and `isCurrentVoter` ignore `frozen`.
- **Scenario:** a frozen borrower or guarantor can vote yes on a colluder's loan, or on the settle of someone else's default. This fits the RT-15 collusion pattern.
- **Fix:** `if (m.members[voter].frozen) return false;` in `_canVoteOn`, and exclude frozen members from `eligible` (they're already excluded from their own settle).

### LOAN-09. Exit-notice members can borrow or guarantee

- **Where:** `LoanBook.sol:532` and `:562` (`TODO(merge)`).
- **Impact:** low. Exits drops the exit when it matures with ties, so no money is lost. But the member gets a loan while signalling departure, and the dropped exit surprises them. ADR 0038 lists this as a merge item.
- **Fix:** expose `Exits.isPending(member)` through a shared hook, and refuse in `_checkRequest` and `_checkGuarantor`.

---

## Info

### LOAN-10. Re-entry into Governance during disbursal

`Ledger.payOut` hands control to the borrower. All LoanBook writes come first (CEI), and every LoanBook, Exits and Ledger entry point is `nonReentrant`. But `proposeRuleChange`, `voteProposal`, `finalizeProposal`, `applyRuleChange`, `declareHoliday`, `wake` and `setDisplayName` are not, so the callee can run them mid-transaction. State is final by then, so this is equivalent to a later transaction. Adding `nonReentrant` to the Governance forwarders costs little and closes a class of future bugs. LOAN-03's fix (gas cap) also limits what a callee can do.

### LOAN-11. `_loanView` (delegatecall inside a view cast)

Reviewed and safe as written:

- The target is `address(LoanBook)`, fixed at link time. Every selector is a compile-time `LoanBook.<view>.selector`. Arguments are the vault's own slot numbers plus caller data (`borrower`, `id`, `offset`, `limit`) that can't select different code.
- The selected functions (`loanOf`, `interestDue`, `payoffDue`, `loanRequest`, `openPage`) are `view` in the library, so they contain no `SSTORE`, `CALL` with value, or `SELFDESTRUCT`. Writes are impossible even in a non-static call context.
- Library call protection doesn't matter for view functions, and the library holds no state.

Two notes. `loanRequest(0)` panics with an underflow instead of a clean error. And the pattern stays safe only while every selector passed to `_loanView` points at a view function, so add a comment or a test that would fail if someone forwards a non-view selector.

### LOAN-12. Rule 17 bypass (known)

Repay `principal - 1` in the payout month, then pay 1 wei of interest next month and close. Rule 17 is skipped. ADR 0038 records this as accepted, matching `interest.ts` (`minimumInterest` applies only to a loan fully repaid in its payout period). Nothing new; listed for completeness.

---

## Interest math against `interest.ts`

Checked and consistent:

- **Start:** month p charges only when p > `disbursedPeriod`. Same as `rateFor`.
- **Tenors:** segments `[d+1, d+t]`, `[d+t+1, d+2t]`, `[d+2t+1, ∞)` at `rate1/2/3`. The same as `ceil((p - d) / t)` clamped to 3. Matches `rateFor`, and `test_S_LOAN_14` and the fuzz test `testFuzz_S_LOAN_27` agree.
- **Medical:** free when `p <= d + freeMonths - 1`, i.e. `p < d + freeMonths`. The same as TS for every `freeMonths` from 0 to 12 (0 and 1 both free only month d). The tenor clock still runs from d+1, as in TS.
- **Rounding:** each month rounds up (`mulDiv` Ceil), the same as TS `ceilDiv`. The vault never under-charges.
- **Start-of-month balance:** `_book` freezes interest at the old principal before `repay` changes it, the same as TS `interestFor(balanceAtStart)`.
- **Rule 17:** uses the original `amount` at `rate1`, medical exempt, as in TS. The gap is LOAN-12.
- **Overflow:** `principal <= uint128`, rates <= 1000 bps and months bounded by `uint32` periods. No product comes near 2^256.
- **Not in TS:** late fees on interest and `defaultAfter`. LOAN-04 and LOAN-06 cover them.

## Votes, default and settle: other checks that came back clean

- Snapshot: only voters with `seq <= seqSnapshot` vote. Wake and new voting rights renew `seq`. The borrower can never vote. Borrower and guarantor can't vote on a settle and aren't in its `eligible`.
- Early close is monotonic. Once `yes > passPct` of eligible, later votes can't flip it. Blocked approvals wait at most one extra window, then fail.
- `_seize` burns at NAV with ceiling rounding in the circle's favour. Interest seized stays in `totalAssets` (raises NAV for the others). Write-off lowers `totalAssets` and `loansOutstanding` together. Neither can underflow, because `principalLeft <= loansOutstanding <= totalAssets`.
- `loanTies` stays exact on every path: request, accept, cancel, reject, expire, fail, approve, repay, settle. `_closeLoan` releases both ties, deletes `guaranteeOf`, cancels an open settle and recomputes `frozen` from the facts. Ties can only leak through the stuck request in LOAN-03.
- Refused wallet: payout falls back to `withdrawable`, and the books still balance (`test_S_LOAN_24`).

## Known and still open from the plan red-team

These aren't new, but they matter for loans and are still unfixed at `6c2e9f3`:

- **RT-08 and RT-18:** accrued interest is outside NAV, and a defaulted loan counts at par until a settle passes. Informed members can exit at par before the write-off. A launch blocker per the plan red-team checklist.
- **RT-15:** k x stake gives any pair a built-in (k - 1) x stake profit. LOAN-01 makes this worse.
- **RT-10:** loans can still close early on an absolute majority. Medical windows can be as short as 1 hour.

## Fix order

1. LOAN-02 (funds stuck) and LOAN-01 (collateral counted twice): both small code changes. Do them before any testnet circle holds real value.
2. LOAN-03: one-line move of `Exits._send` into `Ledger.payOut`.
3. LOAN-04: copy two fields at payout, plus an ADR.
4. LOAN-05 to LOAN-09 alongside the Exits merge hooks.

## Fix status (branch `wt/fix-gx`, 2026-11-15)

Decisions in ADR 0043. The proofs were flipped into regression tests in `packages/contracts/test/CircleVault.reviewFixes.t.sol` (`S-RV-LOAN-*` in `docs/testing.md`).

| ID      | Status                      | Fix                                                                                                             | Test                                                         |
| ------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| LOAN-01 | Fixed                       | A guarantor holds no loan or request of their own; a guarantor can't borrow; re-checked on accept and at payout | `test_S_RV_LOAN_01_*`                                        |
| LOAN-02 | Fixed                       | After a dissolve anyone settles a defaulted loan with no vote; claims pay cash as it comes in                   | `test_S_RV_LOAN_02_dissolvedCircleSettlesDefaultsAndEmpties` |
| LOAN-03 | Fixed                       | Capped-gas, no-return-data `Ledger.payOut` for every payout                                                     | `test_S_RV_LOAN_03_*`                                        |
| LOAN-04 | Fixed                       | `defaultAfter` and `interestFee` copied into each loan at payout                                                | `test_S_RV_LOAN_04_defaultAfterAndFeeAreFixedAtPayout`       |
| LOAN-05 | Fixed                       | Payout re-checks borrower and guarantor standing and the medical cap; else `Failed`                             | `test_S_RV_LOAN_05_payoutRechecksTheMedicalCap`              |
| LOAN-06 | Fixed                       | A settle charges interest and fees only up to the default month (a cure still pays all)                         | `test_S_RV_LOAN_06_settleDebtStopsAtTheDefaultMonth`         |
| LOAN-07 | Fixed                       | Disbursal waits while the first exit in the queue has matured                                                   | `test_S_RV_LOAN_07_maturedUnmarkedExitBlocksDisbursal`       |
| LOAN-08 | Fixed                       | Frozen members aren't current voters                                                                            | `test_S_RV_LOAN_08_frozenMembersCannotVote`                  |
| LOAN-09 | Fixed                       | `exiting` members can't borrow or guarantee (`MemberExiting`)                                                   | `test_S_RV_LOAN_09_leaversCannotBorrowOrGuarantee`           |
| LOAN-10 | Fixed differently           | Forwarded Governance writes refuse to run while the transient lock is set                                       | `test_S_RV_GOV_05_*`                                         |
| LOAN-11 | Fixed (note)                | `loanRequest(0)` reverts `LoanRequestNotOpen(0)`; `_loanView` only forwards view selectors                      | `test_S_RV_LOAN_11_loanRequestZeroRevertsCleanly`            |
| LOAN-12 | Open (accepted in ADR 0038) | Rule-17 bypass matches `interest.ts`                                                                            | n/a                                                          |
