# docs/redteam

**What's here:** red-team reviews: how a bad actor inside or near a circle could abuse the design or the contracts, and what we do about it.
**Open this when:** designing membership, votes, loans or exits; before an audit; or when a finding is cited in an ADR, test or PR.

| File                           | Purpose                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-11-plan-redteam.md`      | First review of PLAN.md, ADRs 0001–0027 and the Phase 1 contracts. 32 findings (`RT-01`..`RT-32`), priority matrix, blockers                    |
| `2026-11-governance-review.md` | Governance module review (`GOV-01`..`GOV-15`), with a fix table. Fixes: ADR 0043, tests `S-RV-GOV-*`                                            |
| `2026-11-exits-review.md`      | Exits module review (`EXIT-01`..`EXIT-12`), with a fix table. Fixes: ADR 0043, tests `S-RV-EXIT-*`                                              |
| `2026-11-loans-review.md`      | LoanBook review (`LOAN-01`..`LOAN-12`), with a fix table. Fixes: ADR 0043, tests `S-RV-LOAN-*`                                                  |
| `2026-11-16-usdt-review.md`    | USDT circles and member cap review (`RT-USDT-01`..`06`, `M-1`, `L-1`..`L-5`), with status. Fixes: ADR 0050, tests `S-USDT-09`/`10`, `S-MEM-09b` |

**Rules**

- One file per review, named `YYYY-MM-<scope>-redteam.md` (module reviews: `YYYY-MM-<module>-review.md`). Never rewrite an old review; add a new one and say which findings are closed.
- Each finding says whether it needs a plan change, a new ADR, or only a test. Test scenarios live in `docs/testing.md` under "Red-team scenarios" (`S-RT-xx`).
- A finding is closed when its fix is merged and its `S-RT` test passes. Record that in the next review or in the PR.
