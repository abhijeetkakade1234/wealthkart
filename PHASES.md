# Phases

Where WealthKart is, phase by phase. The open items for right now are in [TODO.md](TODO.md).
Every task with its tick box is in [docs/STATUS.md](docs/STATUS.md); what each phase is for is in [PLAN.md](PLAN.md) §5.

Last updated: 2026-11-15

| Phase | What it delivers                                                                   | Status                                   |
| ----- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| 0     | Foundation: monorepo, CI, rules engine matching G1, Core sign-in, design system    | **Done** (owner actions left, see TODO)  |
| 1     | MVP on Fuji: circles, monthly AVAX payments, join by vote, dormant members, charts | **Done** (milestone deferred to the end) |
| 2     | Loans and governance: loan votes, interest, tenors, defaults, exits, rule changes  | **Next**                                 |
| 3     | Audit and mainnet beta: full analytics, external audit, G1 live on mainnet         | Not started                              |
| 4     | Growth: reminders, circle templates, Hindi and Marathi, onboarding                 | Not started                              |
| 5     | USDC vaults and a WealthKart L1                                                    | Later                                    |
| 6     | Ecosystem: reputation-based credit lines, optional reserve yield by vote           | Later                                    |

**When is it finished?** The full product is done at the end of **Phase 4**: Phase 3 puts it live on mainnet after an external audit, and Phase 4 adds the growth features. Phases 5 and 6 are optional expansion.

## Phase 1 so far

Done:

- Create a circle, invite founders who must accept, pay monthly AVAX with late fees and payment holidays
- Join by invite link and member vote (quorum, 66% yes), display names
- Dormant members: vote to pause someone who lost their wallet; pay or "I'm back" to return
- Red-team fixes: fake-circle guard, voting rights after 2 payments, invite caps, circle names without links
- Circle charts, payments heatmap, portfolio totals
- Activity feed with filters, search and Snowtrace links
- Indexer: Cloudflare Worker + D1 (deploys with the other owner actions)
- Sign-in page, Playwright tests for every feature, CI on pinned runners

Left:

- Milestone: G1 plus 2–3 test circles on Fuji, demo video, Team1 application (deferred to the end with the Fuji deploy)

## Phase 0 to 4 at a glance

```
Phase 0  ##########  done
Phase 1  ##########  done (milestone deferred)
Phase 2  ----------
Phase 3  ----------
Phase 4  ----------
```
