# Phases

Where WealthKart is, phase by phase. The open items for right now are in [TODO.md](TODO.md).
Every task with its tick box is in [docs/STATUS.md](docs/STATUS.md); what each phase is for is in [PLAN.md](PLAN.md) §5.

Last updated: 2026-11-16

| Phase | What it delivers                                                                   | Status                                                                                |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 0     | Foundation: monorepo, CI, rules engine matching G1, Core sign-in, design system    | **Done** (owner actions left, see TODO)                                               |
| 1     | MVP on Fuji: circles, monthly AVAX payments, join by vote, dormant members, charts | **Done** (milestone deferred to the end)                                              |
| 2     | Loans and governance: loan votes, interest, tenors, defaults, exits, rule changes  | **Done**: contracts reviewed and fixed (239 tests), all screens with Playwright tests |
| 3     | Audit and mainnet beta: full analytics, external audit, G1 live on mainnet         | **Code done**: bug bounty, external audit and mainnet deploy are owner/external       |
| 4     | Growth: landing page, reminders, circle templates, Hindi and Marathi, onboarding   | **Started**: landing page, test USDT faucet, `pnpm dev:local` done                    |
| 5     | USDC vaults and a WealthKart L1                                                    | Later                                                                                 |
| 6     | Ecosystem: reputation-based credit lines, optional reserve yield by vote           | Later                                                                                 |

**When is it finished?** The full product is done at the end of **Phase 4**: Phase 3 puts it live on mainnet after an external audit, and Phase 4 adds the growth features. Phases 5 and 6 are optional expansion.

## Phase 2 (done)

Done:

- Foundation: the factory keeps the vault code in data contracts (room to grow), one shared money ledger with safe payouts, rules with on-chain limits that a vote can change

- Exits: notice period, payout at NAV (fee stays in the circle), FIFO queue with automatic processing (Chainlink Automation) and a manual fallback, guardian pause that never blocks leaving
- Governance: rule changes by vote with a delay and rage-quit, fee waivers with a reason, dissolving a circle with pro-rata claims, voting the guardian off

- Loans: request with caps and an optional guarantor, member vote, automatic payout, monthly interest over three tenors, medical loans, late fees, default with frozen shares, settle by vote

- Independent security reviews of all three modules (hardening + red-team skills), and every high and medium finding fixed (ADR 0043): closing a circle needs a majority of all members, risky rule changes need the higher bar, rules switch over on time, the exit queue can't be clogged, one safe payout path, no double-counted guarantees, nothing can get stuck after closing
- Screens for leaving, the guardian pause, proposals, rule changes, fee waivers and closing a circle, with Playwright tests

- Loan screens: ask with live limits, vote, pay interest, repay, guarantor and default flows, loan votes, loans in the activity feed, and two loan charts
- Safety fixes found while testing everything together: exit claims can't succeed while paying nobody, and every write is sent with gas headroom so nested calls never run out

## Phase 3 so far

Done:

- Your returns: annual return for you and the circle, 5/10/30-year projection (labelled as an illustration), your history as CSV
- Contract monitoring: the indexer checks every circle's money adds up and raises alerts
- Security policy, testnet bug bounty terms and the audit pack (`docs/audit/`)
- Reputation: a soulbound record per wallet that circles write on every payment, repayment and default, and a public repayment record page
- Circles of 3 to 50 members, in AVAX or USDT (chosen once, never changed), with two independent reviews of the USDT code and their fixes
- Fuji or mainnet chosen by the environment: `main` deploys to Cloudflare Production (Fuji now, mainnet after the audit), `dev` to Preview on Fuji, `abhijeet` nowhere
- Indexer stays inside D1's 500 MB free tier, with an alert before it fills

Left:

- Owner/external: testnet bug bounty run, external audit, mainnet deploy with deposit caps, contract verification

## Phase 1 (done)

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
Phase 2  ##########  done
Phase 3  ########--  code done; bug bounty, audit, mainnet deploy left (owner/external)
Phase 4  ----------
```
