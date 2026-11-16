// `pnpm e2e:isolated [playwright args]`: the E2E suite on free ports (ADR 0053), so it can run
// next to another E2E run (another worktree, another agent) without sharing anvil, the indexer
// or the web server. Ports already set in E2E_ANVIL_PORT / E2E_WEB_PORT / E2E_INDEXER_PORT win.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findFreePorts } from "./support/ports.mjs";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const names = ["E2E_ANVIL_PORT", "E2E_WEB_PORT", "E2E_INDEXER_PORT"];
const ports = await findFreePorts(names.length);
const env = { ...process.env, E2E_PORTS: "auto" };
names.forEach((name, i) => (env[name] ||= String(ports[i])));
console.log(
  `E2E on anvil :${env.E2E_ANVIL_PORT}, web :${env.E2E_WEB_PORT}, indexer :${env.E2E_INDEXER_PORT}`,
);

// On Windows pnpm is a .cmd, so it runs through a shell: quote arguments with spaces or
// shell characters (e.g. -g "S-E2E-31|S-E2E-40").
const shell = process.platform === "win32";
const args = process.argv.slice(2).map((a) => (shell && /[^\w\-./:=@]/.test(a) ? `"${a}"` : a));
const child = spawn("pnpm", ["exec", "playwright", "test", ...args], {
  cwd: web,
  env,
  stdio: "inherit",
  shell,
});
child.on("exit", (code) => process.exit(code ?? 1));
