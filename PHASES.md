# Phases

Where WealthKart is, phase by phase. The open items for right now are in [TODO.md](TODO.md).
Every task with its tick box is in [docs/STATUS.md](docs/STATUS.md); what each phase is for is in [PLAN.md](PLAN.md) §5.

Last updated: 2026-11-15

| Phase | What it delivers                                                                   | Status                                                                                               |
| ----- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0     | Foundation: monorepo, CI, rules engine matching G1, Core sign-in, design system    | **Done** (owner actions left, see TODO)                                                              |
| 1     | MVP on Fuji: circles, monthly AVAX payments, join by vote, dormant members, charts | **Done** (milestone deferred to the end)                                                             |
| 2     | Loans and governance: loan votes, interest, tenors, defaults, exits, rule changes  | **In progress**: all three modules merged (197 contract tests); review fixes and screens in progress |
| 3     | Audit and mainnet beta: full analytics, external audit, G1 live on mainnet         | **In progress**: returns, projections, CSV, monitoring, audit pack done; reputation next             |
| 4     | Growth: reminders, circle templates, Hindi and Marathi, onboarding                 | Not started                                                                                          |
| 5     | USDC vaults and a WealthKart L1                                                    | Later                                                                                                |
| 6     | Ecosystem: reputation-based credit lines, optional reserve yield by vote           | Later                                                                                                |

**When is it finished?** The full product is done at the end of **Phase 4**: Phase 3 puts it live on mainnet after an external audit, and Phase 4 adds the growth features. Phases 5 and 6 are optional expansion.

## Phase 2 so far

Done:

- Foundation: the factory keeps the vault code in data contracts (room to grow), one shared money ledger with safe payouts, rules with on-chain limits that a vote can change

- Exits: notice period, payout at NAV (fee stays in the circle), FIFO queue with automatic processing (Chainlink Automation) and a manual fallback, guardian pause that never blocks leaving
- Governance: rule changes by vote with a delay and rage-quit, fee waivers with a reason, dissolving a circle with pro-rata claims, voting the guardian off

- Loans: request with caps and an optional guarantor, member vote, automatic payout, monthly interest over three tenors, medical loans, late fees, default with frozen shares, settle by vote

Being built now:

- Fixes for the independent security reviews of exits and governance (0 critical; 1 high and 8 medium being fixed: dissolve needs a majority of all members, risky rule changes need the higher bar, rules switch over on time, the exit queue can't be clogged, one safe payout path)
- Independent security review of loans
- Screens for leaving, proposals, rule changes, waivers and dissolution, with Playwright tests

## Phase 3 so far

Done:

- Your returns: annual return for you and the circle, 5/10/30-year projection (labelled as an illustration), your history as CSV
- Contract monitoring: the indexer checks every circle's money adds up and raises alerts
- Security policy, testnet bug bounty terms and the audit pack (`docs/audit/`)

Left:

- Reputation record (soulbound) and a public repayment record page
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
Phase 2  ########--  loans, exits, governance merged; fixing review findings; screens in progress
Phase 3  ####------  returns, projections, CSV export, monitoring, security + audit pack
Phase 4  ----------
```
