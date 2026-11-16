# packages/contracts/test/helpers

**What's here:** test-only contracts for the scenario harness.
**Open this when:** a test needs a hostile or unusual member.

**Key files**

- `Actors.sol`: `RejectingWallet` (refuses AVAX, like some smart wallets) and `ReentrantAttacker`
- `MockUSDT.sol`: `TestUSDT`, a 6-decimal token with open `mint`, a Tether-style blacklist switch and a fee-on-transfer switch, for USDT circle tests (ADR 0046). The faucet token for Fuji is `script/MockUSDT.sol`
