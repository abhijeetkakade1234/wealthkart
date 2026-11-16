# packages/sdk

**What's here:** the bridge between contracts and app: typed ABIs generated from Foundry output, supported chains (Fuji now; mainnet later), deployment addresses, explorer links, and display formatting (AVAX or USDT from smallest units, short addresses, month labels).
**Open this when:** the app needs to call a contract, after any contract change (regenerate ABIs), or after a deploy (fill in addresses).

**Key files**

| File                  | Purpose                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/abi/*.ts`        | Generated ABIs (`as const` for viem typing). Do not edit by hand                                                                                                              |
| `scripts/gen-abi.mjs` | Regenerates ABIs: `forge build` in contracts, then `pnpm --filter @wealthkart/sdk gen`. Merges linked libraries' events and errors into the vault ABI (ADR 0031, `MERGE` map) |
| `src/chains.ts`       | Supported chains, `DEPLOYMENTS` per chain id, explorer URLs                                                                                                                   |
| `src/format.ts`       | `formatUnitsDown` (any decimals) and `formatAvax`, both round down; `shortAddress`, `periodLabel`                                                                             |

**Depends on / used by:** viem, `packages/contracts` (build output) / `apps/web`.
