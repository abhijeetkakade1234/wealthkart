# 0039. Exits and the guardian pause

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

PLAN.md D4 says an exit is a notice period, then a NAV payout in AVAX sent by Chainlink Automation, with a permissionless fallback, and blocked while the member has an open loan or guarantee. ADR 0037 put this in its own module, `Exits`, which is also the only writer of `Ledger.exitsWaiting` and `Ledger.pausedUntil`. ADR 0020 caps the guardian pause at 14 days and says it never blocks exits. The red team added RT-14 (pause abuse), RT-17 (lending out the exit cash), RT-20 (one bad wallet blocks the queue) and RT-21 (the keeper stops).

## Decision

- **Request.** `requestExit()`: any active member, dormant included (their shares are theirs). Refused while frozen or while `loanTies > 0`, and one pending exit per member. Notice is `exitNoticeDays`, or zero while `block.timestamp < Ledger.rageQuitUntil` (ADR 0019; Governance sets the window). `cancelExit()` works any time before payout.
- **Fee lock.** The entry stores the exit fee in force when the member asked. At payout the lower of that and the current fee applies, so a rule change during the notice can't raise it (S-RT-20). Fees round up, for the circle.
- **Value at payout.** The member's shares at NAV at the moment of payout, not at the end of notice, minus the fee. The fee stays in the vault and raises everyone else's NAV. The last shareholder takes all assets with no fee, so nothing is left in a circle that nobody owns (S-EXIT-09).
- **Effects first.** Burn shares from `totalShares`, `totalAssets -= payout`, `Membership.removeMember`, then send.
- **Sending (RT-20).** Exits sends with its own transfer, not `Ledger.payOut`: a 50,000 gas cap and no return data copied. A wallet that refuses, or burns its gas, gets the payout credited to `withdrawable` exactly as `payOut` does, and the batch goes on. A batch stops before an exit when less than 150,000 gas is left, so nobody can make a payout fail on purpose by sending too little gas.
- **Queue.** The queue is an append-only array of addresses with a `head` index. A slot is live only while the member's entry points back to it; cancelled, paid and dropped exits leave settled slots behind. Scans skip them and `head` moves past a settled prefix. `cancelExit` also pops settled slots off the tail, so request-and-cancel spam doesn't grow the queue.
- **Order.** Exits are paid first come, first served among those whose notice has ended. An exit still in its notice is skipped, not waited for, so a zero-notice rage-quit behind a 30-day exit is paid at once. Once one matured exit can't be paid, every matured exit behind it waits too.
- **`exitsWaiting` (RT-17).** It counts live exits marked `waiting`: the notice has ended and a payout attempt found too little cash or an earlier exit still waiting. The mark is set once and cleared on payout, cancel or drop, so the count is exact (invariant I-10). LoanBook lends nothing while it is above 0. An exit that matured but that nobody has touched yet isn't counted. The keeper's `checkUpkeep` returns true for exactly that case, so the gap is one upkeep.
- **Dropped exits.** If a member is frozen, takes on a loan tie, or stops being a member (for example by dissolution) before payout, processing drops the exit with `ExitDropped(reason)` and doesn't revert. The member can ask again later.
- **Processing.** `processExits(maxCount)` is permissionless and looks at up to `maxCount` slots. `checkUpkeep(bytes)` (view) and `performUpkeep(bytes)` follow Chainlink's `AutomationCompatibleInterface` without importing it; one upkeep covers 20 slots.
- **Self-claim (RT-21).** `claimExit()` lets a member collect their own matured exit. It pays only if no other exit is waiting (or the caller is the only one waiting). Otherwise it marks the caller waiting, returns `false`, and the queue pays in order.
- **Guardian pause (ADR 0020, RT-14).** The guardian is the vault's `creator` while still a member.
  - `pause()` sets `pausedUntil = now + 14 days`. It is allowed only if Governance hasn't set `guardianDisabled`, and at most once per 90 days, counted from the start of the last pause.
  - `unpause()` is for the guardian, or for anyone once the guardian has been voted off or has left.
  - The pause blocks only new loans (LoanBook reads `Ledger.paused`) and `requestToJoin`.
  - Exits, claims, `withdraw`, contributions and repayments never check it, so it can't cause late fees.
- **Not built here:** RT-18 haircuts for overdue loans at exit (with RT-08, a later NAV-policy ADR); dissolution payouts (Governance).

## Alternatives considered

- **NAV snapshot at the end of notice:** `docs/testing.md` asked for this at first. The value would be frozen while the money still sits in the vault, and a stored snapshot needs a second set of books for the gap. Paying at NAV on payout day is simpler and fair both ways: the leaver shares income and losses until paid.
- **Strict FIFO that stops at the first exit still in its notice:** with notice that can differ (rule changes, rage-quit), one 90-day exit would hold up everyone behind it.
- **`exitsWaiting` = every pending exit, notice included:** any one member could freeze lending for 30 days at a time by asking to exit and cancelling.
- **Pushing with `Ledger.payOut` (all gas, return data copied):** one wallet that burns gas or sends a huge return value could make every batch revert (RT-20).
- **Pause cooldown of 30 days after a pause ends (RT-14 text):** 90 days from the start is simpler to explain and stricter.

## Consequences

- LoanBook must refuse new loans while `exitsWaiting > 0` or while paused. It should also refuse loan requests and guarantees from a member with a pending exit (`exitOf(member).slot != 0`), so dropped exits stay rare.
- Governance must not double-pay: a dissolution that removes members makes their queued exits drop. A rage-quit just uses `requestExit` while `rageQuitUntil` is set.
- Two members working together can still leave settled slots in the middle of the queue behind an exit that is in its notice. That costs keepers gas but never blocks payment for good: `head` moves on once that exit is paid, and `claimExit` always works. Recorded for the audit.
- Vault runtime grew from 15,301 to 17,572 bytes (+2,271).
- Slither's `locked-ether` detector is back on.
- Deploys link one more library (`Exits`).
