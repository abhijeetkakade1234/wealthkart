# 0045. Member cap: 3 to 50 per circle

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

`Config.maxMembers` allowed 0, meaning no cap, and the founder list allowed up to 200 wallets. Neither number came from how circles actually work.

- **Trust.** A circle lends to members on a vote of friends. That only works while members know each other. G1 has run for eight years with 12 people. A circle of a few hundred wallets is a pool of strangers, which is the product we said we would not build (ADR 0005).
- **Voting.** Every loan, join, dormant mark and rule change needs a quorum of voters (ADR 0033). The bigger the circle, the harder it is to reach quorum inside a voting window, and the easier it is for a block of new wallets to outvote the people who started it.
- **Law.** In India, an association of more than 50 people that carries on business for gain generally has to register (Companies Act 2013, section 464 and its rules, which set the limit for unregistered associations at 50; how it applies to savings circles is open). We are not claiming this answers the legal question. We are keeping circles under that line until the lawyer review says otherwise, and the review should confirm or change the number.

## Decision

- `Config.maxMembers` must be **3 to 50**. 0 (no cap) is no longer accepted.
- `MAX_FOUNDERS` is **50**: the creator plus invited founders can't exceed 50, and can't exceed `maxMembers`.
- The cap is fixed at creation like the rest of `Config`. Rule-change votes can't raise it.
- The app's create form defaults to 12 (G1's size) and lets the creator pick 3 to 50.
- Error messages say it plainly: "maxMembers must be 3..50", "maxMembers must be at least the creator plus invited founders".

## Alternatives considered

- **Fixed 12 for everyone.** Matches G1, but smaller and larger friend groups exist (families of 5, college batches of 30). A choice inside a safe range costs nothing.
- **Unlimited (keep 0).** Keeps flexibility nobody asked for, weakens votes and trust, and invites the registration question above.
- **A higher cap such as 100.** No user has asked for it, and it puts every circle on the wrong side of the 50-person line.

## Consequences

- Existing test circles use a cap of 50 instead of 0; scenarios S-LIFE / S-MEM cover the 3 and 50 bounds and the founders-over-cap case.
- Join votes that pass when the circle is full still close as `Full` (ADR 0028), now always against a real number.
- The founder loop at creation is bounded by 50 instead of 200, which also lowers worst-case creation gas.
- If the lawyer review allows more, a new ADR supersedes this one; existing circles keep their cap because contracts are immutable (ADR 0020).
