import { expect, test } from "@playwright/test";

import { warpToDayThisMonth, warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { asWallet, createCircle, payAllDue, vaultWrite } from "./support/vault";

/**
 * Circle charts, payments heatmap and portfolio totals (PLAN.md D7), from real events on the
 * local chain. Alice pays on time, Bob pays after the due day with a late fee.
 */
test("S-E2E-15 the circle page charts the money and shows who paid on time, late or not yet", async ({
  browser,
}) => {
  const alice = await asWallet(browser, ACCOUNTS.alice);
  const circle = await createCircle(alice, {
    name: `Charts E2E ${Date.now() % 100000}`,
    founders: [ACCOUNTS.bob],
  });
  await vaultWrite(circle, ACCOUNTS.bob, "acceptInvite");

  // Next month: Alice pays before the due day (10th), Bob after it.
  await warpToNextMonth(2);
  await payAllDue(circle, ACCOUNTS.alice);
  await warpToDayThisMonth(15);
  await payAllDue(circle, ACCOUNTS.bob);

  await alice.goto(`/app/circle/?id=${circle}`);
  await expect(alice.getByRole("heading", { name: "How the circle is doing" })).toBeVisible();
  await expect(alice.getByTestId("analytics-summary")).toContainText(
    "2 payments so far · 1 paid late",
  );

  // Every chart can be read as a table too.
  const value = alice.getByRole("region", { name: "Circle value" });
  await expect(value.locator(".recharts-surface")).toBeVisible();
  await value.getByRole("button", { name: "Table" }).click();
  await expect(value.getByText("Value (AVAX)")).toBeVisible();
  await expect(alice.getByRole("region", { name: "Money in each month" })).toBeVisible();
  await expect(alice.getByRole("region", { name: "Value of one share" })).toBeVisible();

  // The heatmap: one square on time, one late, each with words, not just colour.
  await expect(alice.locator('[data-state-cell="on-time"]')).toHaveCount(1);
  await expect(alice.locator('[data-state-cell="late"]')).toHaveCount(1);
  await expect(alice.getByRole("img", { name: /· Paid late$/ })).toBeVisible();

  // Portfolio totals across circles.
  await alice.goto("/app/");
  await expect(alice.getByText("Your money in circles")).toBeVisible();
  await expect(alice.getByText(/% of the circle/).first()).toBeVisible();
});
