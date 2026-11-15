# 0028. Membership: founders accept, everyone else joins by request and vote

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

PLAN.md §2.4 says circles are invite-only and existing members approve newcomers by vote. The first contract slice made every address in `createCircle(founders)` an active member at once. A creator could add spare wallets or strangers without their consent (red-team RT-02). An earlier draft of this slice used secret invite codes checked on-chain; those leak in the public mempool and can be front-run (RT-04). The red-team review (`docs/redteam/2026-11-plan-redteam.md`, RT-01 to RT-09) asked for a stricter design before membership ships.

## Decision

**Founders.** The wallet calling `createCircle` is the creator and the only member at the start. Every other founder is _invited_ and must call `acceptInvite()` within 14 days. Until they accept, they don't count in `memberCount` or quorum, and the circle doesn't appear in their portfolio (`circlesOf`). They can `declineInvite()`. An expired invite can't be accepted, but the person can still ask to join the normal way.

**Joining.** The invite link is just the circle address. Nothing secret goes on-chain; the vote is the real gate. `requestToJoin(displayName, invitedBy)` works like this:

- One open request per address, and at most 20 open requests per circle (RT-05). Requests live in a swap-and-pop index, so reads stay paginated and no write loops.
- `invitedBy` is optional and must be a current member. It is only a claim until confirmed: `inviterConfirmed` turns true when that member votes yes, and the app shows the claim as unconfirmed until then.
- The request snapshots the member count (the quorum denominator) and a join-order stamp. Only members who joined before the request can vote (RT-03).

**Voting.** Each member votes yes or no once. A member more than one period behind on installments can't vote (RT-07), though for now they still count in the quorum denominator (see Consequences). A request passes with quorum **and at least 66% yes of votes cast** (RT-03). Quorum is `quorumPct` of the snapshot: 20–100%, default 50%. The vote that makes the outcome certain settles it. Otherwise anyone calls `finalizeJoin` after the window closes (`votingWindow`: 1 hour to 14 days, default 48 hours).

Outcomes:

- **Approved**
- **Rejected**
- **Expired:** no quorum
- **Cancelled:** by the applicant
- **Full:** the vote passed, but `maxMembers` was reached first. This is checked at settlement (RT-09).

**First period.** A new member, founder or newcomer, owes from the current month if its due moment (23:59:59 UTC on the due day) hasn't passed, and from next month if it has. Nobody joins already late (RT-09). Shares are minted only when they pay, at the current NAV (ADR 0006).

**Registry.** `CircleFactory.isCircle(address)` says whether a vault is genuine (RT-01). A circle calls `registerMember` on the factory when someone accepts or is admitted. Only circles the factory deployed can do this.

**Settings.** `votingWindow`, `quorumPct` and `maxMembers` join the `Config` struct, with the bounds from the ADR 0022 table. `maxMembers` is 0 for unlimited; otherwise it must be at least 3 and at least the number of founders.

## Alternatives considered

- **Secret invite codes (hash on-chain):** they leak in the mempool and in URLs, and a stolen single-use code griefs the invitee (RT-04). Rejected.
- **Address-bound invites (`invite(invitee)`):** safe, but every join needs an extra round trip first. The vote already blocks strangers, so we kept the simple link and made `invitedBy` verifiable instead.
- **Simple majority:** too easy for a small Sybil bloc to grow (RT-03). 66% is the same bar as dissolving a circle (ADR 0021).
- **Holding the requested display name during the vote:** lets applicants squat names. Instead the name is checked again at admission (ADR 0029).

## Consequences

- The create flow must explain that friends get an invite and must accept it. Invited wallets need an "invitations" view in the app (Phase 1 web work).
- The join and votes pages read `openRequestsPage`, `getRequest` and `canVote`.
- Still open:
  - Members who are behind still count in quorum. Excluding them needs an O(1) running count of behind members, which can't be kept without loops until dormancy lands.
  - "No vote until N installments paid" (RT-03 item 1).
  - Per-inviter caps.
  - Re-joining after an exit (Phase 2). The member record already resets and the member list never duplicates, but `circlesOf` would get a second entry.
- `CircleFactory` is close to the 24 KB contract-size limit because it embeds the vault's creation code. Phase 2 must split the vault into modules before adding loans.
