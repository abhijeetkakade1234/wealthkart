# 0033. Voting rights after N payments, per-member request cap, safe circle names

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Four membership findings from the red-team review were still open after ADR 0028 and ADR 0032:

- **RT-03:** one member can vote in their own spare wallets one at a time and build a bloc.
- **RT-05:** a single member can flood the Votes page.
- **RT-07:** members who stop paying still sit in the quorum denominator.
- **RT-26:** a circle name like "Claim refund: wealthkart-help.app" turns our own portfolio into phishing bait.

## Decision

- **Voting rights after N payments (RT-03 item 1):** new setting `minPaidToVote`, 0 to 6, default 2.
  - Founders (the creator and accepted invitees) vote from the start.
  - A member admitted by vote gets voting rights on the payment that brings them to N installments. With N = 0 they get them on admission.
  - The member keeps those rights while dormant and uses them again after waking.
- **Quorum base:** `voterCount` is the number of members who can vote right now (voting rights, active, not dormant), kept as a running count. Join and dormant votes take their quorum denominator from it, so newcomers who are still paying in never make quorum harder.
- **Snapshots stay honest:** gaining voting rights renews the member's voting stamp, as waking already does (ADR 0032). A member votes only on requests opened after their rights arrived, so `yes + no <= eligible` still holds.
- **Per-member cap (RT-03 item 5, RT-05):** at most **3 open requests** can name the same member as inviter (join) or proposer (dormant). A request with no inviter isn't capped per member; the circle-wide cap of 20 and one request per address still apply.
- **Inviter visibility (RT-03 item 4):**
  - Each join card shows how many open invites the named inviter has, and how many members they have brought in (counted only when they confirmed with a yes vote).
  - The card warns when that is more than a third of the circle.
- **Safe circle names (RT-26):**
  - 3 to 48 characters of letters, digits, spaces and `_ - ' &`, with single spaces and no space at either end.
  - No dots, colons or slashes, so no domain or link can fit.
  - Enforced by the vault constructor (`CircleName.sol`) and by the create form.
- **RT-07 quorum part:** members more than one month behind already can't vote (ADR 0028). Removing them from the quorum base would need a count that changes with time for every member, which can't be kept without loops (ADR 0015). The fix is the dormant vote (ADR 0032): a member who stops paying is voted dormant and leaves every quorum.

## Alternatives considered

- **Voting rights by time in the circle (e.g. 60 days):** a Sybil only has to wait. Paying in costs real AVAX, so it is the stronger filter.
- **No votes for founders until they pay too:** a brand-new circle couldn't admit anyone or decide anything for two months.
- **Cap open invites at 1 per member (RT-03's suggestion):** too tight for a group that is just starting and inviting several friends at once. 3 still makes Sybil-stuffing slow and visible.
- **Block "www" or known brand names in circle names:** a word list is easy to get around. Without dots a name can't be a working address, and the ADR 0028 consent step stops unwanted circles from showing up at all.

## Consequences

- Members admitted by vote see "New member · can vote after N more payments" in the members table until their rights arrive.
- Supersedes the "still open" voting items in the consequences of ADR 0028; the rest of 0028 stands.
- Vault creation code grew: factory 20.1 KB (4.4 KB left). Phase 2 logic must go into modules (ADR 0031), and long revert strings are worth shortening if space gets tight.
