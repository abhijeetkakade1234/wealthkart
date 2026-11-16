import { generateKeyPairSync } from "node:crypto";

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
 * A VAPID key pair for this run only (ADR 0052): the web build gets the public key, the local
 * indexer both. Made fresh each time, so no push key ever sits in the repo.
 */
function vapidPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });
  const raw = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(pub.x!, "base64url"),
    Buffer.from(pub.y!, "base64url"),
  ]);
  return { publicKey: raw.toString("base64url"), privateKey: priv.d! };
}
// Playwright loads this file again in each test worker; only the first load starts servers, so
// keep the pair stable across loads through the environment.
process.env.E2E_VAPID_PUBLIC ??= "";
if (!process.env.E2E_VAPID_PUBLIC) {
  const v = vapidPair();
  process.env.E2E_VAPID_PUBLIC = v.publicKey;
  process.env.E2E_VAPID_PRIVATE = v.privateKey;
}
const VAPID = {
  publicKey: process.env.E2E_VAPID_PUBLIC,
  privateKey: process.env.E2E_VAPID_PRIVATE ?? "",
};

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
      env: {
        INDEXER_PORT: String(INDEXER_PORT),
        INDEXER_RPC_URL: ANVIL_URL,
        // Reminders (ADR 0052): the configured web port is the only site allowed to sign.
        WEB_PORT: String(WEB_PORT),
        VAPID_PUBLIC_KEY: VAPID.publicKey,
        VAPID_PRIVATE_KEY: VAPID.privateKey,
      },
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
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID.publicKey,
      },
    },
  ],
});
