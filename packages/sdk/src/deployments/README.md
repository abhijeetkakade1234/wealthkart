# packages/sdk/src/deployments

**What's here:** one JSON file per chain id with the deployed `CircleFactory` address and its deploy block. Written by `packages/contracts/script/DeployFactory.s.sol`; read by `src/chains.ts`.
**Open this when:** after a deploy (commit the updated file) or when the app can't find the factory. `null` means not deployed on that chain yet.

**Files:** `43113.json` (Fuji), `43114.json` (Avalanche mainnet). The app picks one with `NEXT_PUBLIC_NETWORK` (ADR 0051).
