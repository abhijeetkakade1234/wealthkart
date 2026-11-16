# src/components/exits

**What's here:** leaving a circle and the guardian pause (ADR 0039, 0020).
**Open this when:** changing how members leave, collect their share, or how the pause shows.

| File                 | Purpose                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `leave-card.tsx`     | "Leaving the circle": notice, fee and today's value; confirm dialog; pending exit with UTC and local time, cancel, "Collect my share", waiting-for-cash note, rage-quit note          |
| `pause.tsx`          | `PauseBanner` (circle pages, Unpause for the guardian), `GuardianPause` (button + dialog with the 14-day and 90-day limits), `CirclePauseBanner` (self-loading, for Pay and Activity) |
| `withdraw-alert.tsx` | Inline alert with "Withdraw" when a payout was refused and waits in `withdrawable`                                                                                                    |

State comes from `useCircleGov` in `src/lib/gov-hooks.ts`; pure rules (exit phase, notice text) live in `src/lib/governance.ts`. Contract errors (frozen, loan ties, pause too soon) reach the user through `toFriendlyError`.
