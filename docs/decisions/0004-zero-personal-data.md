# 0004. Zero personal data; self-chosen on-chain display names

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
Storing names, phone numbers or documents creates legal (DPDP Act 2023) and breach risk. Friends still need to recognise each other.

## Decision
Wallet address = identity. We store **no** names, phones, emails, documents or KYC anywhere. Each member sets an **in-game-style display name** per circle, on-chain in `Membership`: 3-20 characters, unique per circle, a 30-day change cooldown, settable only by that wallet. Avatars are derived from the address.

## Alternatives considered
- Off-chain profiles in D1: creates a PII store; rejected.
- Device-local nicknames only: names differ per device; rejected as the primary mechanism.

## Consequences
No user database, which enables a static site (ADR 0011). Display names are public on-chain, so the UI warns about this. Medical-loan proof is replaced by a member vote.
