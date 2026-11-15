# 0029. Display names: ASCII, unique ignoring case, 30-day cooldown and reservation

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

PLAN.md D3b lets each member pick an in-game-style name per circle, set only by their own wallet. The red-team review (RT-06) showed how names get abused:

- look-alike Unicode letters
- zero-width and right-to-left characters
- names that differ only by case
- taking someone's old name right after they drop it

## Decision

- **Characters:** 3–24 bytes of `A–Z a–z 0–9`, space, `_`, `.` and `-`, with no leading or trailing space and no double spaces. ASCII only, so emoji, look-alike letters and invisible characters can't get in. Checked on-chain (`DisplayName.isValid`) and in the app.
- **Uniqueness:** per circle, on a lowercased key (`keccak256(lower(name))`), so "NightOwl" and "nightowl" can't both exist.
- **Cooldown:** once a name is set, the next change is allowed 30 days later. A first name can be set straight away: founders after accepting, newcomers who joined without one.
- **Reservation:** when a member changes name, the old name stays reserved for them for 30 days. Nobody else can take it in that time.
- **Joining:**
  - The applicant picks a name in `requestToJoin`, and it must be free at that moment. It isn't held during the vote.
  - If someone takes it before admission, the newcomer joins with no name and the contract emits `DisplayNameUnavailable`. The passed vote is never reverted.
  - They then pick a name, with no cooldown.
- **Reads:** `nameOf(member)`, `memberByName(name)` (any case) and `isNameAvailable(name, account)`.

## Alternatives considered

- **Unicode with normalisation (NFKC plus confusable-character checks):** far too heavy for a contract, and still leaky. Rejected for now. Real names in other scripts can come later as a separate, display-only field if people ask.
- **Holding names while a join vote runs:** lets applicants squat names, limited only by the open-request cap. Rejected in favour of re-checking at admission.

## Consequences

- The UI shows the address avatar and short address next to every name, plus a "renamed recently" hint. A name alone is never proof of identity.
- Names of exited members should stay reserved for 90 days (RT-06). That lands with exits in Phase 2.
