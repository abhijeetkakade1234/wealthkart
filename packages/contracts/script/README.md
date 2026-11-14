# packages/contracts/script

**What's here:** `DeployFactory.s.sol` deploys `CircleFactory` and writes the address to `packages/sdk/src/deployments/<chainId>.json`.
**Open this when:** deploying. Preferred path: the manual GitHub workflow "Deploy contracts" (environment approval, verifies on Snowtrace). Local: `forge script script/DeployFactory.s.sol --rpc-url fuji --broadcast --private-key $DEPLOYER_PRIVATE_KEY`, then commit the updated JSON.
