# src/components/loans

**What's here:** the Loans screens (ADR 0038, 0043): your loan, asking for one, backing one, voting on one, and the list of all loans.
**Open this when:** changing anything a borrower, guarantor or voter sees about loans.

| File                    | Purpose                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `my-loan.tsx`           | "Your loan": amount owed, interest due now with late fees, tenor timeline, pay interest, repay dialog, default notice; or your request while voted on; or no loan |
| `ask-loan-dialog.tsx`   | "Ask for a loan": type, amount with live limit checks, optional guarantor, cost preview from the rules engine                                                     |
| `guarantor-notice.tsx`  | Someone named you as guarantor: what it means and "Back this loan"                                                                                                |
| `loan-request-card.tsx` | Loan or settle vote on the Votes page: tally, guarantor state, vote, back, withdraw, settle                                                                       |
| `loans-list.tsx`        | All loans from events: status and type filters, sort, debounced search (URL state), "Mark as defaulted", "Ask the circle to settle"                               |
| `tenor-timeline.tsx`    | The three loan terms as a stepped rule with the current term marked                                                                                               |
| `parts.tsx`             | Shared `Fact`, `StatusPill`, `SectionLabel`, input style                                                                                                          |

Chain reads and writes come only from `src/lib/loan-hooks.ts`; numbers and words from `src/lib/loans.ts`.
