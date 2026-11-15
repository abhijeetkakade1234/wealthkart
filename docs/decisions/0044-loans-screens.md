# 0044. Loans screens: one hook file, loan list from events, third chart hue

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

ADR 0038 put loans on-chain. Members now need to ask for a loan, vote on it, back it as a
guarantor, pay interest, repay, and see who is late, all from the app (PLAN.md D4b, D4c, D7).
A parallel contract fix will change some loan behaviour (guarantors can't hold their own loan,
settling after a dissolve, payout rechecks, rules snapshotted per loan), so the UI must be easy
to adjust. The overview also needs a part-to-whole chart with three parts, and only two series
colours were validated so far.

## Decision

- **One hook file.** Every LoanBook read and write lives in `apps/web/src/lib/loan-hooks.ts`
  (`useMyLoan`, `useOpenLoanRequests`, `useLoanRequest`, `useLoanMembers`, `useBorrowerStates`,
  `useLoanAmounts`, `useMemberName`, `useLoanTx`). Components never name a loan function of the
  ABI. Pure mirrors of the contract (limits, tenor timeline, rate per month, defaultable, cure
  text, repay checks, outstanding per member, money split) live in `lib/loans.ts` and are unit
  tested.
- **Exact amounts.** "Pay interest" and "Repay in full" re-read `interestDue` / `payoffDue`
  right before sending, because a late fee can start between page load and click.
- **All loans from events.** The list is built from the circle's events (`loansFromLogs`):
  voting, active, default, repaid, settled, didn't go ahead. Running loans add live state
  (`loanOf`, `interestDue`) for the rate now and for "Mark as defaulted". Filters, sort and
  search are URL state with a 300 ms debounce (ADR 0023). "Rate now" sorts only running loans;
  closed loans show no rate (the events don't carry it).
- **Votes page.** Loan and settle requests are a third list with its own `?lpage=`.
- **Charts.** "Loans outstanding per member" is ranked horizontal bars in one hue (magnitude).
  "Where the money is" is a tall segmented bar (free cash, lent out, reserve), not a donut, per
  the dataviz form rules. Its third part uses a new token `--chart-6: #8a8f2a`, validated with
  `--chart-1` and `--chart-2` on white (all checks pass: worst CVD dE 10.2, normal dE 18.9,
  contrast at least 3:1). The amber and red chart tokens stay off series because they match the
  status colours.
- **Mobile bar.** With Loans built, the bottom bar becomes Home, Pay, Loans, Votes, More, as
  `docs/ui.md` §3 always specified. Circle stays reachable from Home and the circle switcher.
- **Events refresh.** `useCircleEvents` reads the latest block without viem's block-number
  cache, so a refetch right after a transaction includes it.

## Alternatives considered

- **Read every request with `loanRequest(1..n)` for the list:** one call per loan ever made,
  growing forever. The events are already loaded for the feed and charts.
- **Donut for the money split:** harder to compare parts; the dataviz rules prefer a bar.
- **Re-using `--chart-3` (amber) as the third hue:** it is the warning colour.

## Consequences

- Contract changes to loans are absorbed in `loan-hooks.ts` and `loans.ts` only.
- The list depends on event history; very old circles without the indexer list recent loans
  only, with the same note as the activity feed.
- A member who already backs a loan is still offered in the guarantor picker; the contract
  refuses it with a plain message (`AlreadyGuaranteeing`). A `guaranteeOf` view would let the
  UI pre-check it.
