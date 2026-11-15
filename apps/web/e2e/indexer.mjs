// Starts the indexer Worker locally for E2E (ADR 0036): fresh local D1, migrations, then
// `wrangler dev --env e2e`, which reads the anvil chain. The D1 folder is wiped on every start
// because anvil starts from block 0 each run, and old rows would describe a chain that's gone.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worker = join(here, "..", "..", "..", "workers", "indexer");
const persist = join(worker, ".wrangler-e2e");
const port = process.env.INDEXER_PORT || "8787";
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
    "--show-interactive-dev-session=false",
  ],
  { cwd: worker, env, stdio: "inherit", shell },
);
const stop = () => dev.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
dev.on("exit", (code) => process.exit(code ?? 0));
