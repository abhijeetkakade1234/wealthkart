# packages/contracts/script

**What's here:** `DeployFactory.s.sol` deploys `CircleFactory` and writes the address to `packages/sdk/src/deployments/<chainId>.json`.
**Open this when:** deploying. Preferred path: the manual GitHub workflow "Deploy contracts" (environment approval, verifies on Snowtrace). Local: `forge script script/DeployFactory.s.sol --rpc-url fuji --broadcast --private-key $DEPLOYER_PRIVATE_KEY`, then commit the updated JSON.
**USDT (ADR 0046):** the factory takes one USDT address. Set `USDT_ADDRESS` (mainnet: Avalanche C-Chain USDt `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7`), or on Fuji set `DEPLOY_MOCK_USDT=true` to deploy `MockUSDT.sol` first (6 decimals, public faucet `mint` capped at 10,000 per call, refuses mainnet). With neither, the factory only makes AVAX circles. The JSON also records `usdt`.
