import { defineConfig, devices } from "@playwright/test";

import {
  ANVIL_PORT,
  ANVIL_URL,
  CHAIN_ID,
  FACTORY_ADDRESS,
  INDEXER_PORT,
  INDEXER_URL,
  WEB_PORT,
} from "./e2e/support/env";
import { foundryBin } from "./e2e/support/local-chain.cjs";

/**
 * E2E (CLAUDE.md: every user-facing feature ships with one). Runs the real static export
 * against a local anvil chain that pretends to be Fuji, with a test wallet that announces
 * itself as Core. Tests share one chain and run in order, so each creates its own circle.
 * Ports come from E2E_ANVIL_PORT / E2E_WEB_PORT / E2E_INDEXER_PORT, or are picked free with
 * E2E_PORTS=auto (`pnpm e2e:isolated`), so parallel runs never share servers (ADR 0053).
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
      command: `"${foundryBin("anvil")}" --port ${ANVIL_PORT} --chain-id ${CHAIN_ID} --silent`,
      port: ANVIL_PORT,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Charts and the activity feed read history through the indexer, like production.
      command: "node e2e/indexer.mjs",
      url: `${INDEXER_URL}/v1/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { INDEXER_PORT: String(INDEXER_PORT), INDEXER_RPC_URL: ANVIL_URL },
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
        NEXT_PUBLIC_INDEXER_URL: INDEXER_URL,
      },
    },
  ],
});
