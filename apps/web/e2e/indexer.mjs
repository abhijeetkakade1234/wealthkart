// Starts the indexer Worker locally for E2E (ADR 0036): fresh local D1, migrations, then
// `wrangler dev --env e2e`, which reads the anvil chain. The D1 folder is wiped on every start
// because anvil starts from block 0 each run, and old rows would describe a chain that's gone.
// Env (ADR 0053): INDEXER_PORT, INDEXER_RPC_URL (the anvil node; overrides the e2e env's
// RPC_URL), INDEXER_PERSIST (D1 folder name under workers/indexer, default .wrangler-e2e, so
// `pnpm dev:local` keeps its own). wrangler picks a free inspector port by itself.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = join(here, "..", "..", "..", "workers", "indexer");
const persist = join(worker, process.env.INDEXER_PERSIST || ".wrangler-e2e");
const port = process.env.INDEXER_PORT || "8787";
const rpcUrl = process.env.INDEXER_RPC_URL || "http://127.0.0.1:8546";
// WEB_PORT is the configured or auto-picked web port (ADR 0053), passed by playwright.config.ts.
const webPort = process.env.WEB_PORT || "4310";
// Reminders (ADR 0052): a VAPID pair made for this run by playwright.config.ts, the local site as
// the only domain allowed in signed messages, and a fake push service on 127.0.0.1 (the tests
// start it). Local test values only; Fuji and mainnet never set PUSH_EXTRA_ORIGINS.
const pushVars = [
  `VAPID_PUBLIC_KEY:${process.env.VAPID_PUBLIC_KEY ?? ""}`,
  `VAPID_PRIVATE_KEY:${process.env.VAPID_PRIVATE_KEY ?? ""}`,
  `APP_DOMAINS:127.0.0.1:${webPort},localhost:${webPort}`,
  "PUSH_EXTRA_ORIGINS:http://127.0.0.1:",
].flatMap((v) => ["--var", v]);
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: process.env.CI ?? "1" };
const shell = process.platform === "win32";

rmSync(persist, { recursive: true, force: true });

// The Worker imports @wealthkart/sdk's built output; a fresh checkout (CI) hasn't built it yet,
// and this server starts before the web build that would.
const sdk = spawnSync("pnpm", ["--filter", "@wealthkart/sdk", "build"], {
  cwd: join(here, "..", "..", ".."),
  env,
  stdio: "inherit",
  shell,
});
if (sdk.status !== 0) process.exit(sdk.status ?? 1);

const migrate = spawnSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--env",
    "e2e",
    "--persist-to",
    persist,
  ],
  { cwd: worker, env, stdio: "inherit", shell },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const dev = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "--env",
    "e2e",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    port,
    "--persist-to",
    persist,
    "--var",
    `RPC_URL:${rpcUrl}`,
    "--show-interactive-dev-session=false",
    ...pushVars,
  ],
  { cwd: worker, env, stdio: "inherit", shell },
);
const stop = () => dev.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
dev.on("exit", (code) => process.exit(code ?? 0));
