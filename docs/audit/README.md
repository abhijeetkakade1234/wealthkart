# docs/audit

**What's here:** the pack for the external audit before mainnet (Phase 3): what to review, how it fits together, what we already know, and how to run everything.
**Open this when:** preparing or answering an audit, or onboarding a security reviewer.

## Scope

| Contract / library           | Kind                  | What it does                                                              |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------- |
| `src/CircleFactory.sol`      | contract              | Deploys vaults from stored creation code; registry of circles and members |
| `src/CircleVault.sol`        | contract (one/circle) | Payments, shares/NAV, entry points for every module                       |
| `src/modules/Membership.sol` | external library      | Founders, join and dormant votes, names, voting rights                    |
| `src/modules/LoanBook.sol`   | external library      | Loan votes, disbursal, interest, tenors, default and settlement           |
| `src/modules/Exits.sol`      | external library      | Exit notice, payout queue, Chainlink Automation, guardian pause           |
| `src/modules/Governance.sol` | external library      | Rule changes with delay and rage-quit, fee waivers, dissolution           |
| `src/modules/Rules.sol`      | external library      | Settings with on-chain bounds                                             |
| `src/modules/Ledger.sol`     | internal library      | Assets, shares, loans out, refused payouts (push then pull), USDT in/out  |
| `src/libraries/*.sol`        | internal libraries    | Period math (UTC), fees, shares with virtual offsets, names, code store   |

Solidity 0.8.28, Cancun, OpenZeppelin 5.4.0 (ReentrancyGuard, SafeCast, Math, SafeERC20).

**Assets (ADR 0046):** each circle holds AVAX or the factory's one USDT token (Avalanche USDt `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7` on mainnet), fixed at creation. In scope: the token pull (`Ledger.pull`: allowance/balance checks, `safeTransferFrom`, balance delta: a transfer fee up to 1% is absorbed by the circle and logged as `TokenFeeAbsorbed`, more reverts, ADR 0050), the capped-gas token payout with bounded return data (`Ledger._send`), refused or frozen payouts moving to `withdrawable`, the per-asset exit gas guard (`Ledger.payoutGasFloor + Exits.SETTLE_GAS`), and the 6-decimal share maths. Out of our control: Tether can freeze the vault itself. Members are capped at 3..50 (ADR 0045). No proxies, no upgrades, no owner keys over funds.

## Architecture in one paragraph

Each circle is one immutable `CircleVault`, created by `CircleFactory` from creation code stored in data contracts at factory construction (`vaultCodeHash` is public). Big features live in linked external libraries that run in the vault's storage via `DELEGATECALL`; their addresses are fixed in the vault bytecode (ADRs 0031, 0037). All money goes through one `Ledger` struct: `totalAssets` = cash + loans outstanding; refused payouts move to `withdrawable` and out of assets. Shares are minted at NAV with virtual offsets (ADR 0006). Every rule is lazy: fees and interest are computed from UTC timestamps when someone interacts (ADR 0014). All decisions about money are member votes with snapshots (ADRs 0028, 0033).

## Invariants we test (and want challenged)

- `address(vault).balance == totalAssets - loansOutstanding + totalWithdrawable` (AVAX circles)
- `usdt.balanceOf(vault) >= totalAssets - loansOutstanding + totalWithdrawable` (USDT circles; `==` plus direct transfers)
- `Σ member shares == totalShares`; removed members hold 0 shares
- `loansOutstanding == Σ open loan principal`
- On every vote, `yes + no <= eligible` (snapshot honesty, including members who wake or gain rights mid-vote)
- `voterCount`, `dormantCount`, `memberCount` match the member flags
- No write path loops over members (ADR 0015)

## Known limitations (by design or deferred)

- **RT-08:** accrued but unpaid interest isn't in NAV until it's paid, so a well-timed joiner can buy in slightly cheap. Bounded by interest owed; noted for review.
- One active loan and one pending request per member (ADR 0037).
- Members far behind still count in quorum until voted dormant (ADR 0033).
- A dormant member who wakes skips the late fees on missed months, but also missed the shares those months would have bought (ADR 0032).
- The contracts no longer refuse Avalanche mainnet (ADR 0050). The network is chosen at deploy: `DeployFactory.s.sol` on chain 43114 needs `CONFIRM_MAINNET=yes` and C-Chain USDt (or no USDT). The app lists Fuji only until the audit.
- Seats held by dormant or lost wallets free only on exit or dissolve (RT-USDT-04); founder invites hold their seats for 14 days (RT-USDT-03).
- Tether can freeze the vault itself, and a member paying with tainted USDT could draw such a freeze (L-2, L-4). A member frozen by Tether waits for an unfreeze to claim `withdrawable`; there is no `withdrawTo`.
- Tokens or AVAX sent straight to the vault are stuck; there is no skim (L-1).

## How to run

```bash
cd packages/contracts
forge test                         # unit, scenario, fuzz, invariant
FOUNDRY_PROFILE=ci forge test      # longer fuzz and invariant runs
slither . --config-file slither.config.json
forge build --sizes
```

Scenario catalogue: [`../testing.md`](../testing.md). Red-team review and fixes: [`../redteam/`](../redteam/README.md). Decisions: [`../decisions/`](../decisions/README.md).
