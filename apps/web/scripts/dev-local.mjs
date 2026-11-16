// `pnpm dev:local`: the whole app on your PC against a local chain (ADR 0053).
//
// Starts anvil (chain id 43113, so the app treats it as Fuji), deploys the factory, its
// libraries and the faucet test USDT exactly like the E2E setup (e2e/support/local-chain.mjs),
// gives the anvil test wallets test USDT, writes apps/web/.env.local and runs `next dev`.
// Ctrl+C stops everything and removes the generated .env.local (restoring yours if you had one).
//
// Options:
//   --indexer           also run the indexer Worker locally (wrangler dev), like E2E
//   --fund <address>    give this wallet 1,000 AVAX and 1,000 test USDT (repeatable;
//                       DEV_FUND=addr1,addr2 works too)
//   --no-fund           skip the test USDT for the anvil test wallets
// Ports: DEV_ANVIL_PORT (8545), DEV_WEB_PORT (3000), DEV_INDEXER_PORT (8788). A busy one is
// swapped for a free one and the script says so.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isAddress } from "viem";
import { mnemonicToAccount } from "viem/accounts";

import {
  CHAIN_ID,
  CONTRACTS_OUT,
  REPO_ROOT,
  deployLocalChain,
  foundryBin,
  fundLocalWallets,
  waitForRpc,
} from "../e2e/support/local-chain.mjs";
import { portOr } from "../e2e/support/ports.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(WEB, ".env.local");
const ENV_BACKUP = join(WEB, ".env.local.before-dev-local");
const MARKER = "# Written by pnpm dev:local";
/** Anvil's public test mnemonic: every key it makes is public, so its wallets hold fake money. */
const TEST_MNEMONIC = "test test test test test test test test test test test junk";
const isWindows = process.platform === "win32";

const children = [];
let stopping = false;

// ---- options ----
const argv = process.argv.slice(2);
const withIndexer = argv.includes("--indexer");
const fundTestWallets = !argv.includes("--no-fund");
const extraWallets = [
  ...(process.env.DEV_FUND ?? "").split(",").map((s) => s.trim()),
  ...argv.flatMap((a, i) => (a === "--fund" ? [argv[i + 1] ?? ""] : [])),
].filter(Boolean);
for (const a of extraWallets) {
  if (!isAddress(a)) fail(`"${a}" isn't a wallet address. Use --fund 0x... (40 hex characters).`);
}

function log(msg) {
  console.log(`[dev:local] ${msg}`);
}

function fail(msg) {
  console.error(`[dev:local] ${msg}`);
  stop(1);
}

/** Kills a child and everything it started (pnpm and wrangler start their own processes). */
function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

function restoreEnvFile() {
  try {
    if (existsSync(ENV_FILE) && readFileSync(ENV_FILE, "utf8").startsWith(MARKER)) {
      rmSync(ENV_FILE);
    }
    if (existsSync(ENV_BACKUP) && !existsSync(ENV_FILE)) renameSync(ENV_BACKUP, ENV_FILE);
  } catch (e) {
    console.error(`[dev:local] Couldn't tidy apps/web/.env.local: ${String(e)}`);
  }
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children.reverse()) killTree(c);
  restoreEnvFile();
  process.exit(code);
}

process.on("SIGINT", () => {
  log("Stopping...");
  stop(0);
});
process.on("SIGTERM", () => stop(0));
// Windows: closing the terminal window.
process.on("SIGHUP", () => stop(0));
process.on("SIGBREAK", () => stop(0));
// Typing q and Enter also stops everything (handy where Ctrl+C doesn't reach node).
process.stdin.setEncoding("utf8");
process.stdin.on("data", (text) => {
  if (String(text).trim().toLowerCase() === "q") {
    log("Stopping...");
    stop(0);
  }
});

/** Starts a long-running child we own; if it dies on its own, everything stops. */
function start(label, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    // stdin stays with this script (for "q"); output goes straight to the terminal.
    stdio: ["ignore", "inherit", "inherit"],
    // pnpm is a .cmd on Windows, so it needs a shell; posix children get their own group so
    // killTree can stop their children too.
    shell: isWindows && opts.shell !== false,
    detached: !isWindows,
    ...opts,
  });
  child.on("exit", (code) => {
    // On Windows Ctrl+C reaches the children too; give our own SIGINT handler a moment first.
    setTimeout(() => {
      if (!stopping) fail(`${label} stopped (exit code ${code}). Stopping everything.`);
    }, 500);
  });
  children.push(child);
  return child;
}

/** Runs a setup step to completion, or stops with its exit code. */
function run(label, cmd, args, cwd) {
  log(label);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWindows });
  if (r.status !== 0) fail(`${label} failed (exit code ${r.status}).`);
}

async function waitForUrl(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  // 1. Contracts and the packages the app imports.
  const forge = foundryBin("forge");
  if (forge === "forge" && spawnSync("forge", ["--version"], { shell: isWindows }).status !== 0) {
    if (!existsSync(CONTRACTS_OUT)) {
      fail("Foundry isn't installed. Install it (getfoundry.sh) or set FOUNDRY_DIR.");
    }
    log("forge not found; using the contracts already built in packages/contracts/out.");
  } else {
    run(
      "Building contracts (forge build)",
      isWindows ? `"${forge}"` : forge,
      ["build"],
      join(REPO_ROOT, "packages", "contracts"),
    );
  }
  run(
    "Building the rules and sdk packages",
    "pnpm",
    ["--filter", "@wealthkart/rules", "--filter", "@wealthkart/sdk", "build"],
    REPO_ROOT,
  );

  // 2. Ports.
  const pick = async (what, envVar, fallback) => {
    const wanted = Number(process.env[envVar] ?? fallback);
    const got = await portOr(wanted);
    if (got !== wanted) log(`Port ${wanted} (${what}) is busy, so using ${got} instead.`);
    return got;
  };
  const anvilPort = await pick("chain", "DEV_ANVIL_PORT", 8545);
  const webPort = await pick("app", "DEV_WEB_PORT", 3000);
  const indexerPort = withIndexer ? await pick("indexer", "DEV_INDEXER_PORT", 8788) : 0;
  const rpcUrl = `http://127.0.0.1:${anvilPort}`;

  // 3. Chain.
  log(`Starting anvil on ${rpcUrl} (chain id ${CHAIN_ID})`);
  start(
    "anvil",
    foundryBin("anvil"),
    ["--port", String(anvilPort), "--chain-id", String(CHAIN_ID), "--silent"],
    {
      shell: false,
    },
  );
  await waitForRpc(rpcUrl);
  const { factory, usdt } = await deployLocalChain(rpcUrl);
  log(`Factory ${factory}, test USDT ${usdt}`);

  const testWallets = Array.from(
    { length: 5 },
    (_, i) => mnemonicToAccount(TEST_MNEMONIC, { addressIndex: i + 1 }).address,
  );
  if (fundTestWallets) {
    await fundLocalWallets(rpcUrl, usdt, testWallets, { avax: 10_000n * 10n ** 18n });
  }
  if (extraWallets.length) await fundLocalWallets(rpcUrl, usdt, extraWallets);

  // 4. Indexer (optional).
  let indexerUrl = "";
  if (withIndexer) {
    indexerUrl = `http://127.0.0.1:${indexerPort}`;
    log(`Starting the indexer on ${indexerUrl}`);
    start("indexer", process.execPath, [join(WEB, "e2e", "indexer.mjs")], {
      shell: false,
      env: {
        ...process.env,
        INDEXER_PORT: String(indexerPort),
        INDEXER_RPC_URL: rpcUrl,
        INDEXER_PERSIST: ".wrangler-local",
      },
    });
    if (!(await waitForUrl(`${indexerUrl}/v1/health`, 180_000))) {
      fail("The indexer didn't start within 3 minutes.");
    }
  }

  // 5. .env.local (yours is kept aside and put back on exit).
  if (existsSync(ENV_FILE) && !readFileSync(ENV_FILE, "utf8").startsWith(MARKER)) {
    renameSync(ENV_FILE, ENV_BACKUP);
    log("Moved your apps/web/.env.local aside; it comes back when you press Ctrl+C.");
  }
  writeFileSync(
    ENV_FILE,
    [
      `${MARKER}. Removed when it stops; don't edit (ADR 0053).`,
      "NEXT_PUBLIC_NETWORK=fuji",
      `NEXT_PUBLIC_RPC_URL=${rpcUrl}`,
      `NEXT_PUBLIC_FACTORY_OVERRIDE=${factory}`,
      `NEXT_PUBLIC_INDEXER_URL=${indexerUrl}`,
      "",
    ].join("\n"),
  );

  // 6. The app.
  start("next dev", "pnpm", ["exec", "next", "dev", "--port", String(webPort)], { cwd: WEB });

  console.log(
    [
      "",
      "WealthKart is running on your PC (fake money only):",
      `  App       http://127.0.0.1:${webPort}`,
      `  Chain     ${rpcUrl}  (chain id ${CHAIN_ID}, looks like Fuji to the app)`,
      `  Factory   ${factory}`,
      `  Test USDT ${usdt}`,
      withIndexer
        ? `  Indexer   ${indexerUrl}`
        : "  Indexer   off (add --indexer); the app reads the chain directly",
      "",
      `Test wallets (anvil's public keys, mnemonic "${TEST_MNEMONIC}"):`,
      ...testWallets.map(
        (a, i) => `  #${i + 1} ${a}${fundTestWallets ? "  10,000 AVAX, 1,000 test USDT" : ""}`,
      ),
      ...extraWallets.map((a) => `  +  ${a}  1,000 AVAX, 1,000 test USDT`),
      "",
      "In Core, add a custom network with this RPC URL and chain id 43113.",
      "Ctrl+C (or q and Enter) stops everything.",
      "",
    ].join("\n"),
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
