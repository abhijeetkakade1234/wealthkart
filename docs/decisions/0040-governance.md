# 0040. Governance module: rule changes, fee waivers, dissolution, guardian off

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

ADR 0037 gives Governance its own linked library. It has to turn ADRs 0019 (rule-change delay with rage-quit), 0020 (vote the guardian off), 0021 (dissolve) and PLAN.md D4b (fee waivers by vote, with a reason on-chain) into code. The vault had about 9 KB of runtime space left, shared by LoanBook, Exits and Governance, and Governance was given 2.5 KB of it.

## Decision

- **`src/modules/Governance.sol`**, an external library with its own `Store` in the vault (`_gov`). It is the only writer of `Ledger.rageQuitUntil`, `Ledger.dissolved` and `Ledger.guardianDisabled`. When the guardian is voted off it also sets `Ledger.pausedUntil = 0`, the one write to that field outside Exits.
- **Four proposal kinds, one voting flow.**
  - `RuleChange(newRules)`: `Rules.validate` runs when the proposal opens.
  - `FeeWaiver(member, period, reason)`: the reason is a fixed enum (Medical, Bereavement, BankIssue, Other) and never free text (D5). Only an unpaid period that has started qualifies. The member may ask for themselves but can't vote on it, and isn't counted in its quorum base.
  - `Dissolve()`: uses the `dissolvePassPct` pass mark (default 66%).
  - `GuardianOff()`.
- **Voting works as in Membership:**
  - The proposer must be a current voter (the waiver's own subject is the exception) and their yes is counted.
  - Snapshot voting: only voters stamped before the proposal (`seqSnapshot`) who can still vote take part.
  - Quorum is the vault's `quorumPct` of the voters at proposal time.
  - A proposal is decided early as soon as the remaining votes can't change it. Otherwise it closes when the vault's `votingWindow` ends: no quorum means Expired, else it passes if it meets the pass mark of votes cast (`Rules.passes`).
  - The pass mark is copied into the proposal when it opens, so a rule change can't move the goalposts of a vote already running.
  - The proposer can cancel while it's open.
- **Spam bounds (RT-05):** at most 10 open proposals per circle and 2 per proposer. Proposals stay in a swap-and-pop list, so reads are paginated.
- **"Applies from the next period" (ADR 0019, RT-24):** when a change passes, `effectiveAt` is now plus `ruleChangeDelayDays` days, rounded up to the start of the next period (00:00 UTC on the 1st). A delay that ends exactly on a period start applies then. `rageQuitUntil` is set to the same moment, so Exits can let members leave with no notice until the change applies. `applyRuleChange()` can be called by anyone after `effectiveAt`. It validates the rules again and copies them into the vault's `_rules`.
- **One rule change at a time:** a new rule-change proposal is refused while another is open or waiting. If the waiting one is already due, proposing applies it first.
- **Dissolution:**
  - On pass, `Ledger.dissolved = true` straight away, with no ADR 0019 delay. The payout is pro-rata for everyone, so a delay would protect nobody, and it lets new loans and installments stop at once. `contribute()` reverts `CircleDissolved` and no new proposals open.
  - `claimDissolution()` is a pull claim, not the batched rounds in ADR 0021. It works only once `Ledger.loansOutstanding == 0`, and pays the caller's shares at NAV. Shares are burned, `totalAssets` goes down, the member is removed, and `Ledger.payOut` runs last, so a refused payout stays withdrawable (RT-20).
  - The last shareholder receives whatever is left, so no dust stays behind.
- **Thin vault entry points:** each Governance function in the vault forwards its own calldata to the library function of the same shape (`_govForward`). The vault storage slots and the settings the library needs come first, then the caller's arguments, which are all static types. Return data and reverts pass through unchanged. Views use the same forwarder through a function-type cast (the library's views write nothing). This keeps Governance's vault growth to about 2.0 KB. Calling the libraries the normal way took 5.2 KB.

## Alternatives considered

- **Normal Solidity library calls from the vault:** 5.2 KB of growth, over the budget. Rejected.
- **Several rule changes open at once:** they would need a "blocked" state when two pass. One at a time is simpler, and a majority can vote a spam proposal down at once.
- **Classifying risky parameters with a higher bar and a 14-day delay (RT-12, S-RT-19):** not built in this step. Every change uses `passPct` and `ruleChangeDelayDays`. Open for a later ADR.
- **Partial dissolution claims while loans are out (rounds):** fairer in time, but they interact with frozen collateral shares (LoanBook). Left for when LoanBook's default and write-off path exists.
- **Migration by vote (ADR 0020, RT-13):** out of scope until a factory registry exists.

## Consequences

- Other modules read `_rules` directly. A passed change only takes effect once someone calls `applyRuleChange()` (or proposes the next change). The app and a keeper should call it at `effectiveAt`.
- **LoanBook** must refuse new loans once `Ledger.dissolved` is true. Its default handling (seizing frozen shares, or writing loans off) must bring `loansOutstanding` to 0, or dissolution claims stay blocked.
- **Exits** reads `rageQuitUntil`, must stop guardian pauses once `guardianDisabled` is true, and must handle members who claim dissolution while an exit is pending.
- A waiver passed after the member already paid the fees refunds nothing. The app should suggest voting before paying.
- The E2E deploy has to deploy and link the new `Governance` library, as it does for Membership.
- New events and errors are merged into the vault ABI (`gen-abi.mjs`).
