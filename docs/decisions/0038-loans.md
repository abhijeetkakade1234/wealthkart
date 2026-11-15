# 0038. Loans: LoanBook module, lazy interest, default and settle by vote

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Phase 2 needs loans on-chain (ADR 0007, 0009, 0018, 0037): a member asks, the circle votes, and the AVAX goes out on its own. Interest, tenor step-ups, late fees and defaults have to run without an admin or a keeper. The vault had about 9 KB of runtime space left for three modules, and Exits needs to know who is tied to a loan or frozen.

## Decision

- **Module:** `src/modules/LoanBook.sol`, an external library with its own `Store` inside the vault. The vault only has thin entry points in its LOANS section. All money goes through `Ledger`, and every number comes from `Rules.Params`.
- **Request:** the borrower must be a current voter, not frozen, and have no loan or open request. The circle needs at least `minMembersForLoans` members. The amount must fit under all three caps:
  - the fund cap (`maxLoanBps` of total assets),
  - k x (own stake + guarantor stake),
  - lendable cash (cash minus `reserveBps` of total assets).

  Medical loans are capped at `medicalCap`, allowed once per UTC calendar year, and vote for half the window (at least 1 hour). No pause, no dissolved circle.

- **Guarantor (rule 11, RT-16):** another active member who isn't dormant, isn't frozen and isn't already guaranteeing someone. Naming a guarantor ties nobody. The guarantor is tied only when they call `acceptGuarantee`. The loan can't pass before that, and a passing vote pays out the moment they accept. If they haven't accepted when the window ends, the request fails.
- **Voting:** same machinery as Membership:
  - The request takes a seq snapshot. Eligible voters are those at request time, minus the borrower.
  - Quorum is `quorumPct` of eligible voters; the pass mark is `passPct` via `Rules.passes`.
  - The vote closes early only when the remaining votes can't change the result. The borrower can't vote.
- **Payout:** caps and lendable cash are checked again when the loan passes. If they no longer fit, the request closes as Failed. Otherwise `loansOutstanding` goes up, then `Ledger.payOut` runs as the last step (CEI). A wallet that refuses the AVAX gets it as `withdrawable` (RT-20).
  - While exits wait (`exitsWaiting > 0`, RT-17) or the guardian pause is on, a passed loan stays open and `finalizeLoan` reverts.
  - After one more voting window past the deadline, the request closes as Failed, so nobody is paid out on an old approval.
- **Interest (lazy, O(1)):** each loan copies its rates (`interestBps`, `tenor2Bps`, `tenor3Bps`), `tenorMonths` and `medicalFreeMonths` at payout, so a later rule change never reprices a running loan. Late fees and `defaultAfter` follow the current rules.
  - Month p (from the month after payout) charges principal x rate(p), rounded up, due by p's due moment.
  - Medical months before `disbursedPeriod + medicalFreeMonths` are free. That matches `packages/rules` (the payout month counts as one).
  - The sum over any range of months comes from the three tenor segments, so there is no loop over time.
  - Unpaid interest rolls forward without compounding. `interestFee` is charged per overdue month that charges interest.
- **Paying:**
  - `payInterest` takes exactly all interest owed so far (including the current month) plus fees. Part payments are rejected. Interest and fees add to total assets.
  - `repay` takes principal and needs no overdue interest. Before the principal changes, the current month is booked at the old balance (start-of-month rule, S-LOAN-07).
  - Closing the loan needs all booked interest paid. If no interest was ever charged, it adds one month's interest at the first rate (rule 17; medical loans exempt).
- **Default:** anyone can call `markDefault` once `defaultAfter` months are overdue or the third tenor has ended with principal left. That freezes the borrower and the guarantor. Paying what is owed (interest, or the whole loan after tenor 3) cures it. `frozen` is always recomputed from the facts: own loan defaulted, or guaranteeing a defaulted loan.
- **Settle:** a second request kind on the same vote machinery, proposed by a current voter. The borrower and the guarantor can't vote on it.
  - On pass, the borrower's shares are burned at NAV to cover principal + interest + fees, then the guarantor's shares.
  - The principal part cancels against their equity; total assets and loans out drop together.
  - Principal still unpaid is written off, so the loss is shared through NAV. Uncovered interest is dropped.
  - If the loan is cured or closed during the vote, the request closes as Cancelled.
- **`loanTies`** is kept exact: +1 for the borrower on request (carried into the loan), +1 for the guarantor on accept; -1 each when the request closes unpaid or the loan closes. Exits relies on it.
- **Size:** views that return structs (`loanOf`, `loanRequest`, `openLoanRequestsPage`) forward the library's ABI output unchanged through a DELEGATECALL in a view cast (`_loanView`). They declare no return type in the vault. `ILoanBookViews` holds the real types, and `gen-abi.mjs` copies them into the SDK ABI. Vault runtime grew from 15,301 to 18,150 bytes; LoanBook is 17.7 KB.

## Alternatives considered

- **Keeper-driven interest:** needs a server, against D4. Rejected.
- **Monthly loops for interest:** gas grows with time unpaid (ADR 0015). Closed form instead.
- **Rates from the live rules:** a vote could reprice running loans retroactively. Rejected.
- **Tie the guarantor on request:** anyone could block someone's exit by naming them. Rejected.
- **Typed struct views in the vault:** about 1.9 KB more vault code, which is a third of what Exits and Governance have left. Rejected for the forwarder.
- **Locked shares per guarantee (RT-16 full fix) and k ramping with tenure (RT-15):** left for a later ADR. One guarantee at a time covers RT-16's double counting.

## Consequences

- Exits must refuse members with `loanTies > 0` or `frozen`. It also needs `acceptGuarantee` to refuse a member already in exit notice; that check belongs in Exits or a shared hook.
- RT-10 asks that loans never finish early. This module follows the Membership rule (early only when the result can't change, with no vote changes), so S-RT-17 is only partly covered.
- Medical windows are at least 1 hour, not RT-19's 12 hours, as asked for this phase.
- A borrower who repays almost all of a loan in its payout month and the rest next month pays interest only on the small rest (rule 17 applies to the payout month only, like `packages/rules`). Low impact; recorded.
- Accrued but unpaid interest is still outside NAV (RT-08). RT-18's exit haircut is open.
- The app reads the three forwarded views through the SDK ABI. Solidity callers use `ILoanBookViews`.
