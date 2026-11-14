# 0014. All deadlines in UTC on-chain; local time shown only in the app

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
`block.timestamp` is UTC. If members read "due on the 10th" in local time while the contract counts UTC days, the rule doesn't match what they see. In India (UTC+5:30), late fees would start at 05:30 IST on the 11th; for members behind UTC, people could be fined for paying "on time".

## Decision
- The contract works **only in UTC**. Rule: pay before **23:59:59 UTC on the due day**. No per-circle timezone or offset.
- The due day is capped at **28**, so it exists in every month.
- The app shows the deadline in UTC **and** converted to the member's device time, plus a countdown, e.g. "Due 10 Dec 23:59 UTC (your time: 11 Dec 05:29 IST) · 2d 4h left". The conversion is display only.
- Other dates follow the same rule: day-20 second late fee, financial year for medical loans (Apr–Mar UTC), notice periods, voting windows.

## Alternatives considered
- Per-circle timezone offset in the contract: more date math, more edge cases, more audit surface. Rejected in favour of UTC plus UI conversion.
- Showing only a UTC clock: simplest UI, but most members can't convert in their head. Rejected.

## Consequences
Simple, single-rule contract date math (still use a tested date library for month boundaries). The UI must make the local-time conversion and the countdown prominent on Home and Pay.
