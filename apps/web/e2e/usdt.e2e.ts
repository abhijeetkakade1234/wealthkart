import { expect, test } from "@playwright/test";
import type { Address } from "viem";

import { warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";
import { amountDue } from "./support/vault";
import {
  USDT_UNIT,
  factoryUsdt,
  mintUsdt,
  usdtAllowance,
  usdtBalanceOf,
  vaultView,
} from "./support/usdt";

/**
 * Circles in USDT and the member cap (ADR 0045, 0046). The local chain's factory has the faucet
 * MockUSDT (global-setup.ts), so the create form offers USDT and payments go approve-then-pay.
 */

async function openCreateForm(page: import("@playwright/test").Page) {
  await page.goto("/app/new/");
  await page.getByRole("button", { name: "Connect Core" }).first().click();
  await page.waitForURL("**/app/new/");
  await expect(page.getByLabel("Circle name")).toBeVisible();
}

test.describe("USDT circles and the member cap", () => {
  test("S-E2E-31 start a USDT circle, see the warning, get test USDT and pay an installment in two steps", async ({
    page,
  }) => {
    const erin = ACCOUNTS.erin as Address;
    await installFakeCore(page, erin);
    await openCreateForm(page);

    const name = `Dollar Circle ${Date.now() % 100000}`;
    await page.getByLabel("Circle name").fill(name);
    const usdtRadio = page.getByRole("radio", { name: "USDT" });
    await expect(usdtRadio).toBeEnabled();
    await usdtRadio.check();
    // Plain warning about freezes and AVAX for gas, and every amount in USDT.
    await expect(page.getByTestId("usdt-warning")).toContainText("can freeze any wallet");
    await expect(page.getByTestId("usdt-warning")).toContainText("little AVAX");
    await expect(page.getByLabel("Amount each month (USDT)")).toHaveValue("50");
    await expect(page.getByText(/each pays 50\.00 USDT a month/)).toBeVisible();
    await page.getByRole("button", { name: "Create circle" }).click();

    await page.waitForURL(/\/app\/circle\/\?id=0x[0-9a-fA-F]{40}/);
    const circle = new URL(page.url()).searchParams.get("id") as Address;
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByTestId("asset-badge").first()).toHaveText("USDT");
    expect(String(await vaultView(circle, "asset")).toLowerCase()).toBe(
      (await factoryUsdt()).toLowerCase(),
    );

    // Created on or before the due day, this month is payable now; otherwise the first
    // installment is next month (RT-09). Either way she pays on time, with no late fee.
    const [, , , payableNow] = await amountDue(circle, erin);
    if (!payableNow) await warpToNextMonth();
    // Before getting any USDT the Pay page says so.
    await page.goto(`/app/circle/pay/?id=${circle}`);
    await expect(page.getByTestId("pay-amount")).toContainText("50.00");
    await expect(page.getByTestId("pay-amount")).toContainText("USDT");
    const before = await usdtBalanceOf(erin);
    if (before < 50n * USDT_UNIT) {
      await expect(page.getByText(/this payment needs 50\.00 USDT/)).toBeVisible();
      await mintUsdt(erin, 100n * USDT_UNIT);
      await page.reload();
    }
    const start = await usdtBalanceOf(erin);
    expect(start).toBeGreaterThanOrEqual(50n * USDT_UNIT);

    await expect(page.getByRole("list", { name: "Payment steps" })).toBeVisible();
    await expect(page.getByTestId("step-approve")).toHaveAttribute("data-status", "upcoming");
    // Right after a reload the wallet reconnects and may swallow one click (see S-E2E-03).
    await expect(async () => {
      const pay = page.getByRole("button", { name: "Pay 50.00 USDT" });
      if ((await pay.isVisible()) && (await pay.isEnabled())) await pay.click();
      await expect(page.getByText(/You're all paid up/)).toBeVisible({ timeout: 8000 });
    }).toPass({ timeout: 40_000 });
    await expect(page.getByText(/installment of 50\.00 USDT is in/)).toBeVisible();

    // Exactly the installment left the wallet; the approval covered installment plus both late
    // fees, so 2 USDT of allowance is left and nothing more was taken.
    expect(start - (await usdtBalanceOf(erin))).toBe(50n * USDT_UNIT);
    expect(await usdtAllowance(erin, circle)).toBe(2n * USDT_UNIT);

    // The overview shows money in USDT with the right decimals.
    await page.goto(`/app/circle/?id=${circle}`);
    await expect(page.getByText(/USDT a month/)).toBeVisible();
    await expect(page.getByText("50.00").first()).toBeVisible();
  });

  test("S-E2E-32 the member cap must be 3 to 50: 2 and 51 are refused before sending, 50 is created", async ({
    page,
  }) => {
    await installFakeCore(page, ACCOUNTS.alice);
    await openCreateForm(page);
    await page.getByLabel("Circle name").fill(`Big Circle ${Date.now() % 100000}`);
    const cap = page.getByLabel("Most members the circle can have");
    await expect(cap).toHaveValue("12");

    await cap.fill("2");
    await page.getByRole("button", { name: "Create circle" }).click();
    await expect(page.getByText(/room for at least 3 members/)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/new\/$/);

    await cap.fill("51");
    await expect(page.getByText(/at most 50 members/)).toBeVisible();
    await expect(page.getByTestId("big-circle-note")).toHaveCount(0);

    await cap.fill("50");
    await expect(page.getByTestId("big-circle-note")).toContainText("slower votes");
    await page.getByRole("button", { name: "Create circle" }).click();
    await page.waitForURL(/\/app\/circle\/\?id=0x[0-9a-fA-F]{40}/);
    const circle = new URL(page.url()).searchParams.get("id") as Address;
    expect(Number(await vaultView(circle, "maxMembers"))).toBe(50);
    expect(String(await vaultView(circle, "asset"))).toBe(
      "0x0000000000000000000000000000000000000000",
    );
    await expect(page.getByTestId("asset-badge").first()).toHaveText("AVAX");
  });
});
