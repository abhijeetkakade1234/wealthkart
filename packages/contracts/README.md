# packages/contracts

**What's here:** WealthKart's Solidity contracts and their Foundry tests.
**Open this when:** working on anything that holds or moves money: circle vaults, contributions, loans, votes, exits.

**Key files**

| Path                                   | Purpose                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/CircleVault.sol`                  | One circle: monthly AVAX contributions, shares at NAV, lazy late fees, payment holidays. Phase 1 slice: no loans/votes/exits yet, so it refuses to deploy on Avalanche mainnet |
| `src/CircleFactory.sol`                | Deploys immutable vaults (`new`, no proxies) and keeps a paginated registry per member                                                                                         |
| `src/libraries/FeeMath.sol`            | Late fees 1/2 with holiday shift (mirrors `packages/rules/src/fees.ts`)                                                                                                        |
| `src/libraries/PeriodMath.sol`         | UTC month periods and due moments, due day 1–28 (ADR 0014)                                                                                                                     |
| `src/libraries/SharesMath.sol`         | Shares/NAV with virtual offsets against inflation attacks (ADR 0006)                                                                                                           |
| `test/`                                | Scenario, fuzz and invariant tests; names carry IDs from `docs/testing.md`                                                                                                     |
| `script/`                              | Deploy scripts (Fuji / mainnet via manual CI workflow only)                                                                                                                    |
| `scripts/forge.mjs`                    | Runs forge from `FOUNDRY_DIR` or PATH so turbo and hooks always find it                                                                                                        |
| `.solhint.json`, `slither.config.json` | Static checks run by `pnpm lint` and CI                                                                                                                                        |
| `lib/`                                 | Git submodules: forge-std v1.9.7, OpenZeppelin v5.4.0 (pinned tags)                                                                                                            |
| `foundry.toml`                         | Solc 0.8.28, Cancun, fuzz 1000 runs (5000 in `ci` profile), invariant settings                                                                                                 |

**Rules (see `docs/engineering.md`):** immutable contracts, no proxies (ADR 0020); no loops over members (ADR 0015); internal accounting, never `address(this).balance`; custom errors; events for every state change; run the `solidity-hardening` and `redteam-attack` skills on every contract change. The math must match `packages/rules`.

**Depends on / used by:** forge-std, OpenZeppelin / `packages/sdk` (ABIs), `apps/web`.

**Setup:** Foundry lives at `D:\tools\foundry\bin` on the main dev machine (on PATH). After cloning: `git submodule update --init --recursive`.

Commands: `pnpm build`, `pnpm test`, `pnpm lint` (Solhint + `forge fmt --check`), `pnpm coverage`, `pnpm gas`. They call `scripts/forge.mjs`, which finds forge via `FOUNDRY_DIR` even when it is not on PATH. CI uses `FOUNDRY_PROFILE=ci` and also runs Slither (`slither.config.json`, fails on medium+).

Lint config: `.solhint.json` (recommended rules, custom errors required, `console` allowed only in `script/`). Tests are not Solhint-checked.
