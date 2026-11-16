// Local chain setup shared by the E2E global setup and `pnpm dev:local` (ADR 0053).
// Plain ESM so a node script can import it without a TypeScript step; Playwright loads it too.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { encodeAbiParameters, encodeFunctionData, getContractAddress } from "viem";

import { MULTICALL3_ADDRESS, MULTICALL3_RUNTIME } from "./multicall3.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** Repo root (apps/web/e2e/support -> ../../../..). */
export const REPO_ROOT = join(here, "..", "..", "..", "..");
export const CONTRACTS_OUT = join(REPO_ROOT, "packages", "contracts", "out");

/** Fuji's chain id, so the app treats the local chain as its target network. */
export const CHAIN_ID = 43113;

/** Anvil dev account 0 (public test mnemonic). Deploys everything, so addresses are fixed. */
export const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

/**
 * The deployer's first contract (nonce 0): CircleFactory. Linked libraries are deployed after it
 * at predicted addresses, so this address never moves.
 */
export const FACTORY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

/** Converts a Git Bash path (/d/tools/foundry) to a Windows one (d:/tools/foundry). */
function nativePath(dir) {
  return process.platform === "win32" && /^\/[a-zA-Z]\//.test(dir)
    ? `${dir[1]}:${dir.slice(2)}`
    : dir;
}

/** A Foundry tool (anvil, forge) from FOUNDRY_DIR or ~/.foundry, else the bare name (PATH). */
export function foundryBin(tool) {
  const exe = process.platform === "win32" ? `${tool}.exe` : tool;
  for (const dir of [process.env.FOUNDRY_DIR, join(homedir(), ".foundry")]) {
    if (!dir) continue;
    const p = join(nativePath(dir), "bin", exe);
    if (existsSync(p)) return p;
  }
  return tool;
}

/** JSON-RPC client for one node URL. */
export function makeRpc(url) {
  let id = 0;
  return async function rpc(method, params = []) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  };
}

/** Waits until the node answers, or throws after `ms`. */
export async function waitForRpc(url, ms = 30_000) {
  const rpc = makeRpc(url);
  const end = Date.now() + ms;
  for (;;) {
    try {
      return await rpc("eth_chainId");
    } catch (e) {
      if (Date.now() > end) throw new Error(`No chain answered at ${url}: ${String(e)}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

const readArtifact = (file, name) =>
  JSON.parse(readFileSync(join(CONTRACTS_OUT, file, `${name}.json`), "utf8"));

/** Writes each linked library's address over its placeholder in the bytecode. */
function link(artifact, libraries) {
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

async function waitForReceipt(rpc, hash) {
  for (let i = 0; i < 50; i++) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function deploy(rpc, data, expected, label) {
  const hash = await rpc("eth_sendTransaction", [{ from: DEPLOYER, data, gas: "0x1C9C380" }]);
  const receipt = await waitForReceipt(rpc, hash);
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

/** The MockUSDT address global setup gives the factory: the nonce after the libraries. */
function predictedUsdt(libraryCount) {
  return getContractAddress({ from: DEPLOYER, nonce: BigInt(libraryCount + 1) });
}

/**
 * Deploys CircleFactory and every library the vault links to, from the Foundry artifacts.
 * The factory goes first (nonce 0), so it always lands at FACTORY_ADDRESS however many
 * libraries are added later; the libraries follow at addresses predicted from the deployer's
 * nonce, and the vault code the factory stores is linked to those addresses (ADR 0031, 0037).
 * Last comes the testnet faucet token `script/MockUSDT.sol` (6 decimals, public `mint`), at the
 * next predicted address, which the factory takes as its USDT (ADR 0046), so USDT circles work
 * locally too. Installs Multicall3 first (the app batches reads through it; anvil starts
 * without it). Skips the deploys if the factory is already there.
 *
 * @param {string} rpcUrl the anvil node
 * @returns {Promise<{ factory: string, usdt: string, deployed: boolean }>}
 */
export async function deployLocalChain(rpcUrl) {
  const rpc = makeRpc(rpcUrl);
  await rpc("anvil_setCode", [MULTICALL3_ADDRESS, MULTICALL3_RUNTIME]);

  const vaultArtifact = readArtifact("CircleVault.sol", "CircleVault");
  const libraries = Object.entries(vaultArtifact.bytecode.linkReferences)
    .flatMap(([file, libs]) => Object.keys(libs).map((name) => ({ file, name })))
    .sort((a, b) => a.name.localeCompare(b.name));
  const usdt = predictedUsdt(libraries.length);

  const code = await rpc("eth_getCode", [FACTORY_ADDRESS, "latest"]);
  if (code && code !== "0x") return { factory: FACTORY_ADDRESS, usdt, deployed: false };

  const addresses = {};
  libraries.forEach((lib, i) => {
    addresses[lib.name] = getContractAddress({ from: DEPLOYER, nonce: BigInt(i + 1) });
  });

  const vault = link(vaultArtifact, addresses);
  const factory = readArtifact("CircleFactory.sol", "CircleFactory");
  const args = encodeAbiParameters([{ type: "bytes" }, { type: "address" }], [vault, usdt]);
  await deploy(rpc, `${link(factory, addresses)}${args.slice(2)}`, FACTORY_ADDRESS, "Factory");

  for (const lib of libraries) {
    const artifact = readArtifact(lib.file.split("/").pop(), lib.name);
    await deploy(rpc, link(artifact, addresses), addresses[lib.name], `${lib.name} library`);
  }

  await deploy(rpc, readArtifact("MockUSDT.sol", "MockUSDT").bytecode.object, usdt, "MockUSDT");
  return { factory: FACTORY_ADDRESS, usdt, deployed: true };
}

const mintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
];

/**
 * Gives local wallets fake money: sets their AVAX balance and mints test USDT from the faucet
 * token (at most 10,000 USDT per mint, the token's cap). Local chain only.
 *
 * @param {string} rpcUrl the anvil node
 * @param {string} usdt the faucet token
 * @param {string[]} wallets addresses to fund
 * @param {{ avax?: bigint, usdt?: bigint }} [amounts] wei and USDT units (6 decimals)
 */
export async function fundLocalWallets(rpcUrl, usdt, wallets, amounts = {}) {
  const rpc = makeRpc(rpcUrl);
  const avax = amounts.avax ?? 1000n * 10n ** 18n;
  const units = amounts.usdt ?? 1000n * 10n ** 6n;
  for (const to of wallets) {
    await rpc("anvil_setBalance", [to, `0x${avax.toString(16)}`]);
    if (units === 0n) continue;
    const data = encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [to, units] });
    const hash = await rpc("eth_sendTransaction", [{ from: DEPLOYER, to: usdt, data }]);
    const receipt = await waitForReceipt(rpc, hash);
    if (!receipt || receipt.status !== "0x1") throw new Error(`Test USDT mint to ${to} failed`);
  }
}
