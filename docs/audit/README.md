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
| `src/modules/Ledger.sol`     | internal library      | Assets, shares, loans out, refused payouts (push then pull)               |
| `src/libraries/*.sol`        | internal libraries    | Period math (UTC), fees, shares with virtual offsets, names, code store   |

Solidity 0.8.28, Cancun, OpenZeppelin 5.4.0 (ReentrancyGuard, SafeCast, Math). No proxies, no upgrades, no owner keys over funds.

## Architecture in one paragraph

Each circle is one immutable `CircleVault`, created by `CircleFactory` from creation code stored in data contracts at factory construction (`vaultCodeHash` is public). Big features live in linked external libraries that run in the vault's storage via `DELEGATECALL`; their addresses are fixed in the vault bytecode (ADRs 0031, 0037). All money goes through one `Ledger` struct: `totalAssets` = cash + loans outstanding; refused payouts move to `withdrawable` and out of assets. Shares are minted at NAV with virtual offsets (ADR 0006). Every rule is lazy: fees and interest are computed from UTC timestamps when someone interacts (ADR 0014). All decisions about money are member votes with snapshots (ADRs 0028, 0033).

## Invariants we test (and want challenged)

- `address(vault).balance == totalAssets - loansOutstanding + totalWithdrawable`
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
- Contracts refuse Avalanche mainnet in the current build until the audited release enables it.

## How to run

```bash
cd packages/contracts
forge test                         # unit, scenario, fuzz, invariant
FOUNDRY_PROFILE=ci forge test      # longer fuzz and invariant runs
slither . --config-file slither.config.json
forge build --sizes
```

Scenario catalogue: [`../testing.md`](../testing.md). Red-team review and fixes: [`../redteam/`](../redteam/README.md). Decisions: [`../decisions/`](../decisions/README.md).
