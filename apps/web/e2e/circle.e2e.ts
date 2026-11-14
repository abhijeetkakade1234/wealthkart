import { expect, test } from "@playwright/test";

import { warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";

test.describe("create a circle and pay", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeCore(page, ACCOUNTS.alice);
  });

  test("S-E2E-02 connect Core and see the portfolio", async ({ page }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: "Connect Core" }).first().click();
    await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  });

  test("S-E2E-03 start a circle, first month rule, pay the installment", async ({ page }) => {
    const name = `E2E Circle ${Date.now() % 100000}`;
    await page.goto("/app/new/");
    await page.getByRole("button", { name: "Connect Core" }).first().click();
    await page.getByLabel("Circle name").fill(name);
    await page.getByRole("button", { name: "Create circle" }).click();

    await page.waitForURL(/\/app\/circle\/\?id=0x[0-9a-fA-F]{40}/);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page
      .getByRole("navigation", { name: "Main" })
      .first()
      .getByRole("link", { name: "Pay" })
      .click();
    // Started after this month's due moment, so the first installment is next month (RT-09).
    // Chain time may already be past the due day; either way, next month is payable after a warp.
    await warpToNextMonth();
    await page.reload();
    await page.getByRole("button", { name: /^Pay .* AVAX$/ }).click();
    await expect(page.getByText(/You're all paid up/)).toBeVisible();
  });
});
