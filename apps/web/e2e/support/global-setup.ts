import { readFileSync } from "node:fs";
import { encodeAbiParameters, getContractAddress } from "viem";
import { join } from "node:path";

import { rpc } from "./chain";
import { ACCOUNTS, FACTORY_ADDRESS } from "./env";
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
 * Deploys CircleFactory and every library the vault links to, from the Foundry artifacts.
 * The factory goes first (nonce 0), so it always lands at FACTORY_ADDRESS however many
 * libraries are added later; the libraries follow at addresses predicted from the deployer's
 * nonce, and the vault code the factory stores is linked to those addresses (ADR 0031, 0037).
 * Last comes the testnet faucet token `script/MockUSDT.sol` (6 decimals, public `mint`), at the
 * next predicted address, which the factory takes as its USDT (ADR 0046), so USDT circles work
 * locally too. Skips if the factory is already there.
 */
export default async function globalSetup() {
  // Multicall3 first: the app batches reads through it and anvil starts without it.
  await rpc("anvil_setCode", [MULTICALL3_ADDRESS, MULTICALL3_RUNTIME]);

  const code = await rpc<string>("eth_getCode", [FACTORY_ADDRESS, "latest"]);
  if (code && code !== "0x") return;

  const vaultArtifact = readArtifact("CircleVault.sol", "CircleVault");
  const libraries = Object.entries(vaultArtifact.bytecode.linkReferences)
    .flatMap(([file, libs]) => Object.keys(libs).map((name) => ({ file, name })))
    .sort((a, b) => a.name.localeCompare(b.name));
  const addresses: Record<string, string> = {};
  libraries.forEach((lib, i) => {
    addresses[lib.name] = getContractAddress({ from: ACCOUNTS.deployer, nonce: BigInt(i + 1) });
  });

  const usdt = getContractAddress({
    from: ACCOUNTS.deployer,
    nonce: BigInt(libraries.length + 1),
  });

  const vault = link(vaultArtifact, addresses);
  const factory = readArtifact("CircleFactory.sol", "CircleFactory");
  const args = encodeAbiParameters(
    [{ type: "bytes" }, { type: "address" }],
    [vault as `0x${string}`, usdt],
  );
  await deploy(`${link(factory, addresses)}${args.slice(2)}`, FACTORY_ADDRESS, "Factory");

  for (const lib of libraries) {
    const artifact = readArtifact(lib.file.split("/").pop()!, lib.name);
    await deploy(link(artifact, addresses), addresses[lib.name]!, `${lib.name} library`);
  }

  await deploy(readArtifact("MockUSDT.sol", "MockUSDT").bytecode.object, usdt, "MockUSDT");
}
