# packages/contracts/src/interfaces

**What's here:** interfaces shared between contracts.
**Open this when:** one contract calls another.

**Key files**

- `ICircleRegistry.sol`: what a vault may call on its factory (`registerMember`)
- `ILoanBookViews.sol`: real return types of the vault's three forwarded loan views (ADR 0038); `gen-abi.mjs` copies them into the SDK ABI
