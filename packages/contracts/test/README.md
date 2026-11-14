# packages/contracts/test

**What's here:** Foundry tests mirroring `src/` paths. Scenario tests use IDs from `docs/testing.md` (e.g. `S-PAY-02`) in their names or NatSpec; fuzz tests start with `testFuzz_`, invariants with `invariant_`.
**Open this when:** adding behaviour (write the scenario first) or a bug was found (add the scenario, then fix).

**Key files**

| Path                                                         | Purpose                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CircleVault.base.sol`                                       | Scenario harness: 12-member circle on 2026-12-01 UTC; actors `honest`, `late`, `outsider`, `attacker`; `_warpTo`, `_nextDueMoment`, `_pay`, `_request`, `_votes`, `_admit`, `_createCircle` (founders accept) / `_createCircleNoAccept` |
| `helpers/Actors.sol`                                         | `RejectingWallet` (Safe-like member that refuses plain AVAX) and `ReentrantAttacker` (re-enters on receive; for payouts in Phase 2)                                                                                                     |
| `CircleVault.contributions.t.sol`                            | S-PAY, S-LIFE-04/10, S-MEM-09/10/11                                                                                                                                                                                                     |
| `CircleVault.membership.t.sol`                               | S-MEM and S-RT membership scenarios                                                                                                                                                                                                     |
| `*.invariant.t.sol`, `CircleVault.membershipInvariant.t.sol` | Invariants I-1..I-11                                                                                                                                                                                                                    |
| `libraries/`                                                 | Unit + fuzz tests for PeriodMath, SharesMath, DisplayName                                                                                                                                                                               |
