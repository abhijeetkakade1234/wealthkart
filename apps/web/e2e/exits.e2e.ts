import { expect, test } from "@playwright/test";

import { increaseTime } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { asWallet, paidCircleOfThree, vaultUint } from "./support/vault";

/**
 * Leaving a circle and the guardian pause (ADR 0039, 0020). Each test builds its own circle of
 * three founders with month one paid; setup goes straight to the chain so the UI under test
 * stays the focus.
 */
test.describe("leaving a circle", () => {
  test("S-E2E-18 a member asks to leave, sees the notice, and collects their share once it ends", async ({
    browser,
  }) => {
    const alice = await asWallet(browser, ACCOUNTS.alice);
    const circle = await paidCircleOfThree(alice, "Exit E2E");

    const bob = await asWallet(browser, ACCOUNTS.bob);
    await bob.goto(`/app/circle/?id=${circle}`);
    const leave = bob.getByRole("region", { name: "Leaving the circle" });
    await expect(leave.getByText("30 days")).toBeVisible();
    await leave.getByRole("button", { name: "Leave this circle" }).click();

    const dialog = bob.getByRole("dialog", { name: "Leave this circle?" });
    await expect(dialog.getByText(/You give 30 days notice/)).toBeVisible();
    await expect(dialog.getByText("If you left today you'd get")).toBeVisible();
    await expect(dialog.getByText(/0\.50 AVAX/)).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, ask to leave" }).click();
    await expect(
      bob.getByText(/You asked to leave\. Your share is ready to collect after/),
    ).toBeVisible();

    const status = bob.getByTestId("exit-status");
    await expect(status.getByText("Notice period")).toBeVisible();
    await expect(status.getByText(/You can collect from/)).toBeVisible();
    await expect(status.getByRole("button", { name: "Stay in the circle" })).toBeVisible();
    await expect(status.getByRole("button", { name: "Collect my share" })).toHaveCount(0);

    // The notice runs out.
    const before = await vaultUint(circle, "totalAssets");
    await increaseTime(31 * 86_400);
    await bob.reload();
    await expect(status.getByText("Ready to collect")).toBeVisible();
    await status.getByRole("button", { name: "Collect my share" }).click();
    await expect(
      bob.getByText(/AVAX was sent to your wallet\. You've left the circle\./),
    ).toBeVisible();

    const after = await vaultUint(circle, "totalAssets");
    expect(after).toBeLessThan(before);
    expect(await vaultUint(circle, "memberCount")).toBe(2n);
  });

  test("S-E2E-19 the guardian pauses the circle; everyone sees the banner and leaving still works", async ({
    browser,
  }) => {
    const alice = await asWallet(browser, ACCOUNTS.alice);
    const circle = await paidCircleOfThree(alice, "Pause E2E");

    await alice.reload();
    await alice.getByRole("button", { name: "Pause the circle" }).click();
    const dialog = alice.getByRole("dialog", { name: "Pause new members and loans?" });
    await expect(dialog.getByText(/lasts 14 days at most/)).toBeVisible();
    await expect(dialog.getByText(/once every 90 days/)).toBeVisible();
    await dialog.getByRole("button", { name: "Pause for 14 days" }).click();
    await expect(alice.getByText(/Paused for 14 days/)).toBeVisible();
    const banner = alice.getByTestId("pause-banner");
    await expect(banner.getByText(/New members and loans are paused until/)).toBeVisible();
    await expect(banner.getByRole("button", { name: "Unpause" })).toBeVisible();

    // Bob sees the banner (without Unpause) on the overview and on Pay, and can still leave.
    const bob = await asWallet(browser, ACCOUNTS.bob);
    await bob.goto(`/app/circle/pay/?id=${circle}`);
    await expect(bob.getByText(/New members and loans are paused until/)).toBeVisible();
    await bob.goto(`/app/circle/?id=${circle}`);
    const bobBanner = bob.getByTestId("pause-banner");
    await expect(bobBanner.getByText(/Leaving and paying still work/)).toBeVisible();
    await expect(bobBanner.getByRole("button", { name: "Unpause" })).toHaveCount(0);

    await bob.getByRole("button", { name: "Leave this circle" }).click();
    await bob
      .getByRole("dialog", { name: "Leave this circle?" })
      .getByRole("button", { name: "Yes, ask to leave" })
      .click();
    await expect(bob.getByTestId("exit-status").getByText("Notice period")).toBeVisible();

    // The guardian ends the pause early.
    await alice.reload();
    await alice.getByTestId("pause-banner").getByRole("button", { name: "Unpause" }).click();
    await expect(alice.getByText(/The pause is over/)).toBeVisible();
    await expect(alice.getByTestId("pause-banner")).toHaveCount(0);
  });
});
