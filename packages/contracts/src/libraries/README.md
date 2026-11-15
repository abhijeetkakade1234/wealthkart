# packages/contracts/src/libraries

**What's here:** pure math and validation libraries; each mirrors a module in `packages/rules`.
**Open this when:** changing dates, fees, shares or display-name rules.

**Key files**

- `PeriodMath.sol`: UTC periods and due moments (ADR 0014)
- `FeeMath.sol`: late fees 1 and 2 with the holiday shift
- `SharesMath.sol`: shares and NAV with virtual offsets (ADR 0006)
- `DisplayName.sol`: display-name charset, length and case-insensitive key (ADR 0029)
