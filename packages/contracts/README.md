# packages/contracts

**What's here:** WealthKart's Solidity contracts and their Foundry tests.
**Open this when:** working on anything that holds or moves money: circle vaults, contributions, loans, votes, exits.

**Key files**

| Path                                   | Purpose                                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/CircleVault.sol`                  | One circle: monthly AVAX contributions, shares at NAV, lazy late fees, payment holidays. Membership calls go to the linked `Membership` library. Since ADR 0050 it no longer refuses Avalanche mainnet; the network is chosen at deploy           |
| `src/modules/Governance.sol`           | Linked external library (ADR 0040): rule changes (delay, then next period; sets the rage-quit window), fee waivers by vote, dissolve + `claimDissolution`, guardian off. Vault entry points forward raw calldata                                  |
| `src/CircleVault.sol`                  | One circle: monthly AVAX contributions, shares at NAV, lazy late fees, payment holidays. Membership and exit calls go to linked libraries. The network is chosen at deploy time, not in the contract (ADR 0050)                                   |
| `src/modules/Membership.sol`           | Linked external library (ADR 0031): founder invites, join requests + 66% vote (ADR 0028), dormant votes (ADR 0032), display names (ADR 0029). Deployed once per chain; its address is fixed in the vault bytecode                                 |
| `src/modules/Exits.sol`                | Linked external library (ADR 0039): exit notice, payout at NAV minus exit fee, FIFO queue with `exitsWaiting`, `processExits` / Chainlink `checkUpkeep` + `performUpkeep`, `claimExit`, guardian pause (14 days, once per 90 days)                |
| `src/modules/LoanBook.sol`             | Linked external library (ADR 0038): loan request, guarantor accept, vote, payout, lazy interest with tenors, late fees, rule 17, default, settle by vote. Vault views that return structs forward its output (`ILoanBookViews`)                   |
| `src/CircleFactory.sol`                | Deploys immutable vaults (`new`, no proxies), `isCircle` registry, paginated `circlesOf`; circles call `registerMember` when someone joins. Embeds vault creation code, so watch its size (`forge build --sizes`)                                 |
| `src/interfaces/`                      | `ICircleRegistry` (factory hook used by vaults), `ILoanBookViews` (typed loan views)                                                                                                                                                              |
| `src/libraries/CircleName.sol`         | Circle-name rules: 3–48 safe characters, no dots, so no links (ADR 0033, RT-26)                                                                                                                                                                   |
| `src/libraries/DisplayName.sol`        | Name rules (ASCII, 3–24 bytes) and the case-insensitive uniqueness key                                                                                                                                                                            |
| `src/libraries/FeeMath.sol`            | Late fees 1/2 with holiday shift (mirrors `packages/rules/src/fees.ts`)                                                                                                                                                                           |
| `src/libraries/PeriodMath.sol`         | UTC month periods and due moments, due day 1–28 (ADR 0014)                                                                                                                                                                                        |
| `src/libraries/SharesMath.sol`         | Shares/NAV with virtual offsets against inflation attacks (ADR 0006)                                                                                                                                                                              |
| `test/`                                | Scenario, fuzz and invariant tests; names carry IDs from `docs/testing.md`. `CircleVault.base.sol` is the scenario harness (actors, UTC time helpers, join/vote helpers); `helpers/Actors.sol` has contract-wallet and reentrancy attacker actors |
| `script/`                              | Deploy scripts (Fuji / mainnet via manual CI workflow only)                                                                                                                                                                                       |
| `scripts/forge.mjs`                    | Runs forge from `FOUNDRY_DIR` or PATH so turbo and hooks always find it                                                                                                                                                                           |
| `.solhint.json`, `slither.config.json` | Static checks run by `pnpm lint` and CI                                                                                                                                                                                                           |
| `lib/`                                 | Git submodules: forge-std v1.9.7, OpenZeppelin v5.4.0 (pinned tags)                                                                                                                                                                               |
| `foundry.toml`                         | Solc 0.8.28, Cancun, fuzz 1000 runs (5000 in `ci` profile), invariant settings                                                                                                                                                                    |

**Sizes (2026-11-15):** factory 20.1 KB, vault 13.6 KB, Membership ~15 KB, all under the 24 KB limit. New Phase 2 logic goes into its own module under `src/modules/` (ADR 0031). Deploys link libraries: `forge script` deploys missing libraries itself; anything that deploys from the raw artifact must deploy every linked library (`Membership`, `Rules`, `Exits`, ...) first and fill its address into the factory bytecode (see `apps/web/e2e/support/global-setup.ts`).
**Sizes (2026-11-15, after LoanBook):** factory 3.2 KB (blueprint, ADR 0037), vault 18.2 KB, Membership 15.3 KB, LoanBook 17.7 KB, all under the 24 KB limit. New Phase 2 logic goes into its own module under `src/modules/` (ADR 0031). Deploys link libraries: `forge script` deploys missing libraries itself; anything that deploys from the raw artifact must deploy `Membership`, `Rules` and `LoanBook` first and fill its address into the factory bytecode (see `apps/web/e2e/support/global-setup.ts`).

**Sizes (2026-11-16, after the view forwarder, 50-member cap and USDT circles):** vault 22.0 KB (2.5 KB headroom; was 23.7 KB before `_view`), factory 3.4 KB, Membership 17.2 KB, LoanBook 20.1 KB, Governance 15.3 KB, Exits 8.7 KB. Struct, array and string views go through `_view` (see `src/modules/README.md`).

**Sizes (2026-11-16, after the USDT review fixes, ADR 0050):** vault 22,109 B (2,467 B headroom), factory 3,353 B, Membership 17,449 B, LoanBook 20,300 B, Governance 15,296 B, Exits 8,740 B, Rules 3,217 B. Exit batches need `Ledger.payoutGasFloor + Exits.SETTLE_GAS` per exit (AVAX 230k, USDT 280k).

**Sizes (2026-11-16, after the nominee wallet, ADR 0056):** vault 23,103 B (1,473 B headroom), Exits 14,448 B, Membership 17,192 B. `Exits.Store` grew by three mappings, so `_loans` moved to slot 50.

**Nominee / backup wallet (ADR 0016, 0056):** `setNominee`, `requestNomineeClaim` (vote, 66%), `cancelNomineeClaim`, `nomineeOf`, `nomineeClaimOf`. A passed claim is an ordinary queued exit paid to the nominee; any action by the member ends it.

**Circle asset (ADR 0046):** `Config.asset` is AVAX or USDT, fixed at creation. The factory constructor is `(bytes vaultCode, address usdt)`; a USDT circle needs a non-zero factory `usdt`. Payments in USDT circles are approve-then-pay with no AVAX attached; `repay(uint256 amount)` works for both assets. Members: 3..50 (ADR 0045).

**Rules (see `docs/engineering.md`):** immutable contracts, no proxies (ADR 0020); no loops over members (ADR 0015); internal accounting, never `address(this).balance`; custom errors; events for every state change; run the `solidity-hardening` and `redteam-attack` skills on every contract change. The math must match `packages/rules`.

**Depends on / used by:** forge-std, OpenZeppelin / `packages/sdk` (ABIs), `apps/web`.

**Setup:** Foundry lives at `D:\tools\foundry\bin` on the main dev machine (on PATH). After cloning: `git submodule update --init --recursive`.

Commands: `pnpm build`, `pnpm test`, `pnpm lint` (Solhint + `forge fmt --check`), `pnpm coverage`, `pnpm gas`. They call `scripts/forge.mjs`, which finds forge via `FOUNDRY_DIR` even when it is not on PATH. CI uses `FOUNDRY_PROFILE=ci` and also runs Slither (`slither.config.json`, fails on medium+). Excluded on purpose: `timestamp` (UTC deadlines are the design, ADR 0014), `cyclomatic-complexity` (constructor validation). `locked-ether` is back on since exits landed (ADR 0039): AVAX leaves the vault through `processExits`, `claimExit` and `withdraw`. Calendar math in `PeriodMath` silences `divide-before-multiply` inline.

Lint config: `.solhint.json` (recommended rules, custom errors required, `console` allowed only in `script/`). Tests are not Solhint-checked.
