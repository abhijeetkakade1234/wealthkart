import { readFileSync } from "node:fs";
import { join } from "node:path";

import { rpc } from "./chain";
import { ACCOUNTS, FACTORY_ADDRESS } from "./env";
import { MULTICALL3_ADDRESS, MULTICALL3_RUNTIME } from "./multicall3";

/**
 * Deploys CircleFactory to the local anvil chain from the compiled Foundry artifact.
 * Account 0's first deployment always lands at FACTORY_ADDRESS, which the E2E web
 * build bakes in. Skips if it is already there (reused server).
 */
export default async function globalSetup() {
  // Multicall3 first: the app batches reads through it and anvil starts without it.
  await rpc("anvil_setCode", [MULTICALL3_ADDRESS, MULTICALL3_RUNTIME]);

  const code = await rpc<string>("eth_getCode", [FACTORY_ADDRESS, "latest"]);
  if (code && code !== "0x") return;

  const artifact = JSON.parse(
    readFileSync(
      join(__dirname, "../../../../packages/contracts/out/CircleFactory.sol/CircleFactory.json"),
      "utf8",
    ),
  ) as { bytecode: { object: string } };

  const hash = await rpc<string>("eth_sendTransaction", [
    { from: ACCOUNTS.deployer, data: artifact.bytecode.object, gas: "0x1C9C380" },
  ]);
  let receipt: { contractAddress: string; status: string } | null = null;
  for (let i = 0; i < 50 && !receipt; i++) {
    receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (!receipt) await new Promise((r) => setTimeout(r, 100));
  }
  if (!receipt) throw new Error("Factory deploy was never mined. Is anvil running?");
  if (
    receipt.status !== "0x1" ||
    receipt.contractAddress.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()
  ) {
    throw new Error(
      `Factory deploy went wrong (status ${receipt.status}, at ${receipt.contractAddress}). ` +
        "Restart anvil so the deployer's nonce is 0.",
    );
  }
}
