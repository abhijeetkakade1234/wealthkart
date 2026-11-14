# packages/rules/src

**What's here:** the off-chain rules engine; the contracts must match it.
**Open this when:** changing any money rule.

**Key files**

- `periods.ts`, `fees.ts`, `shares.ts`: UTC periods, late fees and holidays, NAV and shares
- `interest.ts`: interest, tenors (rule 15), minimum interest (rule 17), medical loans (rule 18), repayment order
- `xirr.ts`: deterministic XIRR
- `index.ts`: public exports
