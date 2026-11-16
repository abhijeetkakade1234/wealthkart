# 0056. Nominee (backup) wallet: how it is built

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

ADR 0016 promised every member a nominee wallet that can claim their share after they go dormant, a circle vote and a notice period. It was never built, while the FAQ, `/risks`, `/start` and the first-run checklist already talk about it. ADR 0016 also left open several points that matter once real money moves: what the vote needs to pass, what happens when the member changes the nominee mid-claim, whether cancelling should bring the member back, how a claim mixes with the exit queue and with a dissolve, and how short the notice may get. This ADR records how it is built. It implements and clarifies ADR 0016; it does not replace it.

## Decision

**Where it lives.** The nominee claim is an exit paid to someone else, so it lives in the `Exits` library (ADR 0031): three mappings appended to `Exits.Store` (`nominee`, `claimId`, `payTo`). The vote reuses `Membership`'s request machinery as a third request kind, `Kind.Claim`. The vault only forwards: `setNominee`, `requestNomineeClaim`, `cancelNomineeClaim`, `nomineeOf`, `nomineeClaimOf`, plus a hook after `vote`/`finalize`. No new library, no proxy (ADR 0020).

**Setting the nominee.**

- `setNominee(address)` from the member's own wallet, at any time, dormant or not. `address(0)` clears it. Refused: your own wallet and the circle itself (`InvalidNominee`). A member or an outsider is fine. `NomineeSet(member, nominee)` on every change.
- The nominee is cleared when the member leaves (exit paid or last dissolution claim), so a rejoined member starts with none.

**Asking.** Only the current nominee calls `requestNomineeClaim(member)`. The member must be active and dormant (ADR 0032), not frozen, with no loan tie (own loan, request or guarantee, as for exits), no exit pending and no claim already open or approved. Refused once the circle is dissolved. Allowed during a guardian pause (exits are never paused).

**Vote.**

- A `Membership.Kind.Claim` request: same window, quorum, voter snapshot, circle-wide cap of 20 open requests and per-address cap of 3 (the nominee is counted as the request's `invitedBy`).
- Quorum base: `voterCount`, minus the nominee if they are a voter. The member is dormant, so not counted. Neither the member nor the nominee can vote on it. `yes + no <= eligible` still holds.
- **Pass mark: 66% of votes cast** (the admission mark), not the dormant mark of more than 50%. Paying a member's whole share to someone else is closer to letting a stranger in than to pausing dues.
- No yes vote is counted for the nominee when the request opens.

**On a pass.** The member's exit is queued exactly like `requestExit` (same linked list, same fee lock of the lower of the fee at approval and at payout, same `exiting` flag, same `processExits` / Chainlink upkeep, same 90k/140k payout floors) with `payTo[member] = nominee`. The payee is the nominee who asked, fixed at that moment.

- **Notice: the circle's exit notice, but never under 30 days (`MIN_CLAIM_NOTICE`), and never shortened by a rage-quit window.** The notice is the member's last chance to say "I'm alive". A circle that votes its exit notice down to 0, or a rule change that happens to be pending, must not shrink it. (A member's own exit keeps ADR 0043's rage-quit cap.)
- **Payout:** the one payout path (`Ledger.payOut`) sends to the nominee; a refused AVAX payout or a Tether-frozen nominee lands in `withdrawable[nominee]`, never in the member's. `ExitPaid` is emitted as for any exit, plus `NomineePaid(member, nominee, payout)`. Dues are handled as for exits: arrears are forgiven (ADR 0043, EXIT-04); a dormant member owes nothing anyway.

**The member ends a claim.** Any of these from the member's own wallet ends an open or approved claim before payout (`NomineeClaimCancelled`):

| Action                               | Claim                           | Member after                                 |
| ------------------------------------ | ------------------------------- | -------------------------------------------- |
| `cancelNomineeClaim()`               | ended                           | woken, dues restart as with `wake()`         |
| `wake()`                             | ended                           | woken                                        |
| `contribute()` (pays)                | ended                           | woken, pays the current period (RT-11)       |
| `setNominee(x)` (change or clear)    | ended                           | woken, new nominee stored                    |
| `requestExit()`                      | ended                           | still dormant, own exit queued, paid to them |
| `claimDissolution()`                 | ended                           | takes their dissolution share themselves     |
| `cancelExit()` / `claimExit()` on it | refused (`NomineeClaimPending`) | use `cancelNomineeClaim`                     |

- **Cancelling wakes the member.** It proves they hold the wallet, and it stops a loop: a new claim then needs a new dormant vote, which needs `dormantAfter` new missed months. Without it the nominee could ask again the next minute.
- **Changing the nominee mid-claim ends the claim** (and wakes the member). It never redirects an approved payout; the old nominee keeps nothing, and the new one needs a new dormant vote.
- Every way back from dormant now goes through `Exits.wake`, so no path can leave a claim behind for a member who is active again.

**Dissolve.** A claim approved before a dissolve is paid like an exit queued before it: in full and with no fee once cash allows (ADR 0043). A claim vote still open at the dissolve may still pass and is queued the same way. No new claim can start after a dissolve.

**Views.** `nomineeOf(member)`; `nomineeClaimOf(member) -> (requestId, payTo)` (`requestId` while the vote runs, `payTo` once it passed; `exitOf(member)` gives `maturesAt`). Requests of kind 2 appear in `openRequestsPage` with the others.

**Reputation.** No new writes. A nominee payout is an exit; it doesn't say anything about how the member paid.

## Alternatives considered

- **A separate `Nominees` library.** Cleaner name, but one more library to link in every deploy path, and it would need Exits' private queue helpers anyway. The claim is an exit, so Exits holds it.
- **Keep the claimant fixed when the member changes the nominee.** It honours a vote that already happened, but the member just proved they are alive; paying anyone then is wrong.
- **Revert `setNominee` during a claim.** Safe, but makes the member find a second button first. Ending the claim in the same transaction is what the member means.
- **Cancelling without waking.** The member stays dormant and the nominee can ask again at once; votes could be spammed. A member who wants to stay paused can be voted dormant again after `dormantAfter` months.
- **Dormant mark (>50%) for claims.** Too low for moving a whole share to someone else.
- **Use the exit notice as is, rage-quit cap included.** A circle could vote the notice to 0 days, leaving the member only the voting window to notice a claim.
- **Let the nominee claim after a dissolve, or claim the dissolution share for the member.** A second payout path, and a queued exit after a dissolve takes its full value from cash ahead of the pro-rata claims. Left out.
- **Repay the member's loan from the share and pay the rest to the nominee (S-LIFE-03b's old wording).** Exits don't do that today; the claim follows exits. A dormant borrower's loan goes through default and settle (ADR 0038) first.
- **A cooldown after a failed claim vote.** The one-open-claim rule, the per-address cap of 3 and the 20-request cap bound the spam; a cooldown needs another timestamp per member.

## Consequences

- ABI: new functions `setNominee`, `requestNomineeClaim`, `cancelNomineeClaim`, `nomineeOf`, `nomineeClaimOf`; events `NomineeSet`, `NomineeClaimRequested`, `NomineeClaimApproved`, `NomineeClaimCancelled`, `NomineePaid`; errors `InvalidNominee`, `NotNominee`, `NomineeClaimPending`, `NoNomineeClaim`; `Membership.Kind` gains `Claim` (2). `wake()` and `contribute()` now also end a claim. `Membership.wake`/`wakeToPay` are gone from the library (the vault calls `Exits.wake`).
- `wake`, `setNominee` and `cancelNomineeClaim` now hold the vault's reentrancy lock, like `cancelExit`, because they can unlink queue entries; none of them can run inside a payout callback (self-review RV-NOM-01, [`../redteam/2026-11-16-nominee-review.md`](../redteam/2026-11-16-nominee-review.md)).
- Storage: `Exits.Store` grew by three mappings, so `_loans` moved from slot 47 to 50 (`SLOT_LOANS` in the test base; the layout test checks it).
- Sizes: vault 22,109 B -> 23,103 B (1,473 B left), Exits 8,740 B -> 14,448 B, Membership 17,449 B -> 17,192 B.
- A circle where the nominee is the only voter can't run a claim (`NoOtherVoters`). The nominee should then be someone outside the circle, which the app suggests.
- A dormant member with no nominee who never returns still locks their share (ADR 0010). After a dissolve, a dormant member without an approved claim can only claim themselves.
- The nominee has no on-chain reverse index. The app finds "who named me" by reading `nomineeOf` across the member list (at most 200 reads in one multicall).
- The first-run checklist reads `nomineeOf` in every circle of the wallet instead of a self-tick (ADR 0054 item 3).
- Tests: S-NOM-01..16 in `docs/testing.md`, invariant I-14, the claim gas sweep, S-E2E-50/51.
