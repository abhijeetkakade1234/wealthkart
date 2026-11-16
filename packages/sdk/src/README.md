# packages/sdk/src

**What's here:** what the app needs to talk to the contracts.
**Open this when:** adding a chain, a deployment or a formatter.

**Key files**

- `abi/`: generated ABIs (never edit by hand)
- `deployments/`: factory address per chain id (own README)
- `chains.ts`: supported chains and explorer links
- `format.ts`: amount (AVAX 18 or USDT 6 decimals), address and period formatting
- `index.ts`: public exports
