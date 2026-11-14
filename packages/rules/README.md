# packages/rules

**What's here:** pure TypeScript copies of the contract math: UTC periods and deadlines, late fees, payment holidays, shares/NAV, loan interest and repayment order, XIRR. Plus the G1 history replay. No I/O, no chain calls.
**Open this when:** you need to preview a number in the UI (what you owe, your stake, a payout) or check contract math against an independent implementation.

**Key files**

| File              | Purpose                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/periods.ts`  | Month periods, due moments (23:59:59 UTC), due-day bounds 1–28 (ADR 0014)                                                                          |
| `src/fees.ts`     | Late fee 1/2 and payment holidays (rules 6–8, ADRs 0009, 0017)                                                                                     |
| `src/shares.ts`   | Shares/NAV with virtual offsets against inflation attacks (ADR 0006)                                                                               |
| `src/interest.ts` | Loan interest: next-month start, start-of-month balance, tenors (rule 15), minimum month (rule 17), medical free months (rule 18), repayment order |
| `src/xirr.ts`     | Annualised return for irregular cash flows (Newton, bisection fallback)                                                                            |
| `test/*.test.ts`  | Scenario tests; names carry IDs from `docs/testing.md` (e.g. `S-PAY-02`)                                                                           |
| `test/fixtures/`  | `g1-ledger.json`: the G1 sheet as data, for `g1-replay.test.ts`                                                                                    |
| `scripts/`        | `extract-g1.py`: one-off that rebuilds the G1 fixture from the xlsx                                                                                |

**Rules:** money is always `bigint` (wei; paise in the G1 replay). XIRR is display-only and uses `number`. Rounding favours the vault. Any change here must match the contracts (differential tests will enforce this once contracts exist).

**Depends on / used by:** nothing / `apps/web` (previews), contract tests (shared vectors).

Commands: `pnpm --filter @wealthkart/rules test`, `… build`, `… typecheck`.
