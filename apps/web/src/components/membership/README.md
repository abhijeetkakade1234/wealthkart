# src/components/membership

**What's here:** Phase 1 membership UI (ADR 0028 join by vote, ADR 0029 display names).
**Open this when:** changing how people join a circle, vote on newcomers, or pick a name.

| File                     | Purpose                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `display-name-field.tsx` | Name input: contract rules checked as you type, availability checked 300 ms later (`useNameCheck`) |
| `name-card.tsx`          | "Your name in this circle" card + dialog; respects the 30-day cooldown                             |
| `invite-card.tsx`        | "Invite a friend": copy or share `/app/join/?id=…&by=…` (no secret codes, RT-04)                   |
| `request-card.tsx`       | One open join request on the Votes page: inviter, tally, deadline, vote, settle                    |

Pure rules (name validation, vote outcome, tally text) live in `src/lib/membership.ts` and mirror the contract; hooks in `src/lib/circle.ts` (`useJoinRequests`, `useJoinRequest`, `useIsCircle`, `useChainNow`). Deadlines are judged by chain time, not the device clock.
