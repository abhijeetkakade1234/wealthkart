import { readFileSync } from "node:fs";
import { join } from "node:path";

import { rpc } from "./chain";
import { ACCOUNTS, FACTORY_ADDRESS, MEMBERSHIP_ADDRESS } from "./env";
import { MULTICALL3_ADDRESS, MULTICALL3_RUNTIME } from "./multicall3";

type Artifact = {
  bytecode: {
    object: string;
    linkReferences: Record<string, Record<string, Array<{ start: number; length: number }>>>;
  };
};

const OUT = join(__dirname, "../../../../packages/contracts/out");
const readArtifact = (file: string, name: string) =>
  JSON.parse(readFileSync(join(OUT, file, `${name}.json`), "utf8")) as Artifact;

/** Writes each linked library's address over its placeholder in the bytecode. */
function link(artifact: Artifact, libraries: Record<string, string>): string {
  let hex = artifact.bytecode.object.replace(/^0x/, "");
  for (const libs of Object.values(artifact.bytecode.linkReferences)) {
    for (const [lib, refs] of Object.entries(libs)) {
      const address = libraries[lib];
      if (!address) throw new Error(`No address for linked library ${lib}`);
      for (const { start, length } of refs) {
        hex =
          hex.slice(0, start * 2) +
          address.replace(/^0x/, "").toLowerCase() +
          hex.slice((start + length) * 2);
      }
    }
  }
  return `0x${hex}`;
}

async function deploy(data: string, expected: string, label: string) {
  const hash = await rpc<string>("eth_sendTransaction", [
    { from: ACCOUNTS.deployer, data, gas: "0x1C9C380" },
  ]);
  let receipt: { contractAddress: string; status: string } | null = null;
  for (let i = 0; i < 50 && !receipt; i++) {
    receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (!receipt) await new Promise((r) => setTimeout(r, 100));
  }
  if (!receipt) throw new Error(`${label} deploy was never mined. Is anvil running?`);
  if (
    receipt.status !== "0x1" ||
    receipt.contractAddress.toLowerCase() !== expected.toLowerCase()
  ) {
    throw new Error(
      `${label} deploy went wrong (status ${receipt.status}, at ${receipt.contractAddress}). ` +
        "Restart anvil so the deployer's nonce is 0.",
    );
  }
}

/**
 * Deploys the Membership library, then CircleFactory linked to it, from the compiled Foundry
 * artifacts (ADR 0031). Account 0's first two deployments always land at MEMBERSHIP_ADDRESS
 * and FACTORY_ADDRESS, which the E2E web build bakes in. Skips if they are already there.
 */
export default async function globalSetup() {
  // Multicall3 first: the app batches reads through it and anvil starts without it.
  await rpc("anvil_setCode", [MULTICALL3_ADDRESS, MULTICALL3_RUNTIME]);

  const code = await rpc<string>("eth_getCode", [FACTORY_ADDRESS, "latest"]);
  if (code && code !== "0x") return;

  const membership = readArtifact("Membership.sol", "Membership");
  await deploy(membership.bytecode.object, MEMBERSHIP_ADDRESS, "Membership library");
  const factory = readArtifact("CircleFactory.sol", "CircleFactory");
  await deploy(link(factory, { Membership: MEMBERSHIP_ADDRESS }), FACTORY_ADDRESS, "Factory");
}
