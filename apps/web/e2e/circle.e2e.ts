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
    // Signed-out visitors go through /login and come back here (S-E2E-08).
    await page.waitForURL("**/app/new/");
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
    // Right after a reload the wallet reconnects and React may swap the button node, which can
    // swallow one click (seen 2 in 4 runs). Retry until the payment starts; a second payment is
    // impossible because the button disappears and advance payments revert.
    await expect(async () => {
      const pay = page.getByRole("button", { name: /^Pay .* AVAX$/ });
      if (await pay.isVisible()) await pay.click();
      await expect(page.getByText(/You're all paid up/)).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 20_000 });
  });

  test("S-E2E-14 a circle name that looks like a web address is refused before anything is sent", async ({
    page,
  }) => {
    await page.goto("/app/new/");
    await page.getByRole("button", { name: "Connect Core" }).first().click();
    await page.waitForURL("**/app/new/");
    await page.getByLabel("Circle name").fill("Claim refund: wealthkart-help.app");
    await page.getByRole("button", { name: "Create circle" }).click();
    await expect(page.getByText(/can't contain web addresses or dots/)).toBeVisible();
    await expect(page).toHaveURL(/\/app\/new\/$/);
  });
});
