# packages/rules

**What's here:** pure TypeScript copies of the contract math: UTC periods and deadlines, late fees, payment holidays, shares/NAV. No I/O, no chain calls.
**Open this when:** you need to preview a number in the UI (what you owe, your stake, a payout) or check contract math against an independent implementation.

**Key files**

| File             | Purpose                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `src/periods.ts` | Month periods, due moments (23:59:59 UTC), due-day bounds 1–28 (ADR 0014) |
| `src/fees.ts`    | Late fee 1/2 and payment holidays (rules 6–8, ADRs 0009, 0017)            |
| `src/shares.ts`  | Shares/NAV with virtual offsets against inflation attacks (ADR 0006)      |
| `test/*.test.ts` | Scenario tests; names carry IDs from `docs/testing.md` (e.g. `S-PAY-02`)  |

**Rules:** money is always `bigint` wei. Rounding favours the vault. Any change here must match the contracts (differential tests will enforce this once contracts exist).

**Depends on / used by:** nothing / `apps/web` (previews), contract tests (shared vectors).

Commands: `pnpm --filter @wealthkart/rules test`, `… build`, `… typecheck`.
