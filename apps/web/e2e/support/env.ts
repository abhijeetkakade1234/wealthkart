/** Shared constants for E2E runs. Everything here is local-only test data. */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { CHAIN_ID as LOCAL_CHAIN_ID, FACTORY_ADDRESS as LOCAL_FACTORY } from "./local-chain.cjs";

/**
 * Ports (ADR 0053). Each comes from its env var, else the fixed default. With `E2E_PORTS=auto`
 * any port not set explicitly is picked free on first load and written back to `process.env`,
 * so Playwright's worker processes (which inherit the runner's env) agree on the same ports.
 * Two runs (two worktrees, two agents) then never share an anvil, indexer or web server.
 */
const DEFAULT_PORTS = { E2E_ANVIL_PORT: 8546, E2E_WEB_PORT: 4310, E2E_INDEXER_PORT: 8787 };
type PortVar = keyof typeof DEFAULT_PORTS;

if (process.env.E2E_PORTS === "auto") {
  const missing = (Object.keys(DEFAULT_PORTS) as PortVar[]).filter((k) => !process.env[k]);
  if (missing.length) {
    const out = spawnSync(
      process.execPath,
      [join(__dirname, "ports.mjs"), String(missing.length)],
      {
        encoding: "utf8",
      },
    );
    if (out.status !== 0) throw new Error(`Couldn't pick free E2E ports: ${out.stderr}`);
    const ports = JSON.parse(out.stdout) as number[];
    missing.forEach((k, i) => (process.env[k] = String(ports[i])));
  }
}

function port(name: PortVar): number {
  const raw = process.env[name];
  if (!raw) return DEFAULT_PORTS[name];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name}=${raw} isn't a port`);
  return n;
}

export const ANVIL_PORT = port("E2E_ANVIL_PORT");
export const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;
export const WEB_PORT = port("E2E_WEB_PORT");
/** Local indexer Worker (wrangler dev) reading the anvil chain (ADR 0036). */
export const INDEXER_PORT = port("E2E_INDEXER_PORT");
export const INDEXER_URL = `http://127.0.0.1:${INDEXER_PORT}`;
/** Fuji's chain id, so the app treats the local chain as its target network. */
export const CHAIN_ID = LOCAL_CHAIN_ID;

/**
 * Anvil's well-known dev accounts (from the public test mnemonic). They hold fake AVAX
 * on the local chain only. Account 0 deploys the factory, so its address is deterministic.
 */
export const ACCOUNTS = {
  deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  alice: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  bob: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  carol: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  dave: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  /** Only the USDT tests use her, so her test USDT balance starts at zero on a fresh chain. */
  erin: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  /** Only the faucet test uses him: no circles and no test USDT on a fresh chain. */
  frank: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  /** Only the reminder tests use her (anvil account 7), so her circle list stays short. */
  fay: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  /** Only the backup wallet tests use her: anvil account 8, an outsider named as a member's nominee. */
  gina: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
} as const;

/**
 * The deployer's first contract (nonce 0): CircleFactory. Linked libraries are deployed after it
 * at predicted addresses (local-chain.cjs), so this address never moves.
 */
export const FACTORY_ADDRESS = LOCAL_FACTORY;
