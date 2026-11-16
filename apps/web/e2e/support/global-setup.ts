import { deployLocalChain } from "./local-chain.mjs";
import { ANVIL_URL } from "./env";

/**
 * Installs Multicall3 and deploys the factory, its linked libraries and the faucet MockUSDT on
 * the anvil chain. The code lives in `local-chain.mjs`, shared with `pnpm dev:local` (ADR 0053).
 */
export default async function globalSetup() {
  await deployLocalChain(ANVIL_URL);
}
