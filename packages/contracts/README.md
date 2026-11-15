# packages/contracts

**What's here:** WealthKart's Solidity contracts and their Foundry tests.
**Open this when:** working on anything that holds or moves money: circle vaults, contributions, loans, votes, exits.

**Key files**

| Path                                   | Purpose                                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/CircleVault.sol`                  | One circle: monthly AVAX contributions, shares at NAV, lazy late fees, payment holidays. Membership calls go to the linked `Membership` library. No loans/exits yet, so it refuses to deploy on Avalanche mainnet                                 |
| `src/modules/Membership.sol`           | Linked external library (ADR 0031): founder invites, join requests + 66% vote (ADR 0028), dormant votes (ADR 0032), display names (ADR 0029). Deployed once per chain; its address is fixed in the vault bytecode                                 |
| `src/CircleFactory.sol`                | Deploys immutable vaults (`new`, no proxies), `isCircle` registry, paginated `circlesOf`; circles call `registerMember` when someone joins. Embeds vault creation code, so watch its size (`forge build --sizes`)                                 |
| `src/interfaces/`                      | `ICircleRegistry` (factory hook used by vaults)                                                                                                                                                                                                   |
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

**Sizes (2026-11-15):** factory 20.1 KB, vault 13.6 KB, Membership ~15 KB, all under the 24 KB limit. New Phase 2 logic goes into its own module under `src/modules/` (ADR 0031). Deploys link libraries: `forge script` deploys missing libraries itself; anything that deploys from the raw artifact must deploy `Membership` first and fill its address into the factory bytecode (see `apps/web/e2e/support/global-setup.ts`).

**Rules (see `docs/engineering.md`):** immutable contracts, no proxies (ADR 0020); no loops over members (ADR 0015); internal accounting, never `address(this).balance`; custom errors; events for every state change; run the `solidity-hardening` and `redteam-attack` skills on every contract change. The math must match `packages/rules`.

**Depends on / used by:** forge-std, OpenZeppelin / `packages/sdk` (ABIs), `apps/web`.

**Setup:** Foundry lives at `D:\tools\foundry\bin` on the main dev machine (on PATH). After cloning: `git submodule update --init --recursive`.

Commands: `pnpm build`, `pnpm test`, `pnpm lint` (Solhint + `forge fmt --check`), `pnpm coverage`, `pnpm gas`. They call `scripts/forge.mjs`, which finds forge via `FOUNDRY_DIR` even when it is not on PATH. CI uses `FOUNDRY_PROFILE=ci` and also runs Slither (`slither.config.json`, fails on medium+). Excluded on purpose: `timestamp` (UTC deadlines are the design, ADR 0014), `locked-ether` (Phase 1 has no withdrawal yet and refuses mainnet; **re-enable when exits land in Phase 2**), `cyclomatic-complexity` (constructor validation). Calendar math in `PeriodMath` silences `divide-before-multiply` inline.

Lint config: `.solhint.json` (recommended rules, custom errors required, `console` allowed only in `script/`). Tests are not Solhint-checked.
