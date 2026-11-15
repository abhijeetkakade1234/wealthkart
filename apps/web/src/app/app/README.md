# src/app/app (wallet-gated app)

**What's here:** every page under `/app`, all sharing `AppShell` and gated by `RequireWallet`. Static export, so circle pages take the circle as `?id=0x…`.

| Route                       | File                       | Purpose                                                                                                            |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/app/`                     | `page.tsx`                 | Your circles: portfolio totals and split, then paginated cards with stake, share and dues                          |
| `/app/new/`                 | `new/page.tsx`             | Create a circle (rules + founders), validated like the contract                                                    |
| `/app/circle/?id=`          | `circle/page.tsx`          | Overview: value, my stake, dues with UTC countdown, charts and payments heatmap, paginated members                 |
| `/app/circle/pay/?id=`      | `circle/pay/page.tsx`      | Pay the installment (with fees) or take a payment holiday                                                          |
| `/app/circle/votes/?id=`    | `circle/votes/page.tsx`    | Open join and dormant votes (paginated): tally, deadline, vote yes/no, settle                                      |
| `/app/circle/activity/?id=` | `circle/activity/page.tsx` | Activity feed: every event as a sentence, filters, search, Snowtrace links (ADR 0034)                              |
| `/app/join/?id=&by=`        | `join/page.tsx`            | Invite link: circle facts, accept a founder invite, or pick a name and ask to join; then request status and result |

Every circle page checks `factory.isCircle(id)` first (RT-01) and shows a "don't pay this" warning for look-alike contracts. Overview also has "Your name in this circle" and "Invite a friend" (`src/components/membership/`).

**Open this when:** adding or changing an app screen. Data hooks live in `src/lib/circle.ts`; transactions go through `src/lib/use-tx.ts`.
