import { expect, test } from "@playwright/test";
import type { Address } from "viem";

import { warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";
import { USDT_UNIT, usdtBalanceOf } from "./support/usdt";
import { amountDue } from "./support/vault";

/**
 * "Get test USDT" (ADR 0053). The local chain pretends to be Fuji and its factory USDT is the
 * faucet MockUSDT, so a test network build shows the button. Mainnet builds never do (unit test
 * S-USDT-11).
 */
test.describe("test USDT faucet", () => {
  test("S-E2E-40 a new wallet gets test USDT from the empty dashboard, then again on a USDT circle's Pay page", async ({
    page,
  }) => {
    const frank = ACCOUNTS.frank as Address;
    await installFakeCore(page, frank);
    await page.goto("/login/?next=%2Fapp%2F");
    await page.getByRole("button", { name: "Connect Core" }).click();
    await page.waitForURL(/\/app\/$/);

    // Empty dashboard: the faucet says plainly that test USDT has no value.
    await expect(page.getByText(/You're not in any circle yet/)).toBeVisible();
    const faucet = page.getByTestId("test-usdt-faucet");
    await expect(faucet).toContainText("Test USDT has no value");
    await expect(faucet).toContainText("1,000.00 USDT");

    const start = await usdtBalanceOf(frank);
    await faucet.getByRole("button", { name: "Get test USDT" }).click();
    await expect(page.getByText(/Added 1,000\.00 test USDT to your wallet/)).toBeVisible();
    await expect.poll(() => usdtBalanceOf(frank)).toBe(start + 1_000n * USDT_UNIT);

    // A USDT circle's Pay page offers it too, and the wallet can pay right after.
    await page.goto("/app/new/");
    const name = `Faucet Circle ${Date.now() % 100000}`;
    await page.getByLabel("Circle name").fill(name);
    await page.getByRole("radio", { name: "USDT" }).check();
    await page.getByRole("button", { name: "Create circle" }).click();
    await page.waitForURL(/\/app\/circle\/\?id=0x[0-9a-fA-F]{40}/);
    const circle = new URL(page.url()).searchParams.get("id") as Address;

    const [, , , payableNow] = await amountDue(circle, frank);
    if (!payableNow) await warpToNextMonth();
    await page.goto(`/app/circle/pay/?id=${circle}`);
    await expect(page.getByTestId("pay-amount")).toContainText("USDT");
    const payFaucet = page.getByTestId("test-usdt-faucet");
    await expect(payFaucet).toContainText("no value");
    // Right after a page load the wallet reconnects and may swallow one click (see S-E2E-03).
    // Click again only while the second mint hasn't landed, so a retry never mints twice.
    await expect(async () => {
      const button = payFaucet.getByRole("button", { name: "Get test USDT" });
      const minted = (await usdtBalanceOf(frank)) > start + 1_000n * USDT_UNIT;
      if (!minted && (await button.isEnabled())) await button.click();
      await expect(page.getByText(/Added 1,000\.00 test USDT/)).toBeVisible({ timeout: 8000 });
    }).toPass({ timeout: 40_000 });
    await expect.poll(() => usdtBalanceOf(frank)).toBe(start + 2_000n * USDT_UNIT);
    await expect(page.getByRole("button", { name: /^Pay \d/ })).toBeEnabled();
  });
});
