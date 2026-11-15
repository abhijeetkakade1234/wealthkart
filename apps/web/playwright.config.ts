import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { ANVIL_PORT, ANVIL_URL, CHAIN_ID, FACTORY_ADDRESS, WEB_PORT } from "./e2e/support/env";

/** anvil from FOUNDRY_DIR (e.g. D:/tools/foundry) or ~/.foundry, else PATH. */
function anvilBin() {
  const exe = process.platform === "win32" ? "anvil.exe" : "anvil";
  for (const dir of [process.env.FOUNDRY_DIR, join(homedir(), ".foundry")]) {
    if (!dir) continue;
    const d =
      process.platform === "win32" && /^\/[a-zA-Z]\//.test(dir) ? `${dir[1]}:${dir.slice(2)}` : dir;
    const p = join(d, "bin", exe);
    if (existsSync(p)) return `"${p}"`;
  }
  return "anvil";
}

/**
 * E2E (CLAUDE.md: every user-facing feature ships with one). Runs the real static export
 * against a local anvil chain that pretends to be Fuji, with a test wallet that announces
 * itself as Core. Tests share one chain and run in order, so each creates its own circle.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/support/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `${anvilBin()} --port ${ANVIL_PORT} --chain-id ${CHAIN_ID} --silent`,
      port: ANVIL_PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm build && node e2e/serve.mjs",
      port: WEB_PORT,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(WEB_PORT),
        NEXT_PUBLIC_RPC_URL: ANVIL_URL,
        NEXT_PUBLIC_FACTORY_OVERRIDE: FACTORY_ADDRESS,
      },
    },
  ],
});
