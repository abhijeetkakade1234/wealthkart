import { expect, test } from "@playwright/test";
import type { Address } from "viem";

import { warpToDayThisMonth, warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { asWallet, createCircle, payAllDue, vaultWrite } from "./support/vault";

/**
 * Circle charts, payments heatmap and portfolio totals (PLAN.md D7), from real events on the
 * local chain. Alice pays on time, Bob pays after the due day with a late fee.
 */
test.describe.configure({ mode: "serial" });

let circle = "" as Address;

test("S-E2E-15 the circle page charts the money and shows who paid on time, late or not yet", async ({
  browser,
}) => {
  const alice = await asWallet(browser, ACCOUNTS.alice);
  circle = await createCircle(alice, {
    name: `Charts E2E ${Date.now() % 100000}`,
    founders: [ACCOUNTS.bob],
  });
  await vaultWrite(circle, ACCOUNTS.bob, "acceptInvite");

  // Next month: Alice pays before the due day (10th), Bob after it.
  await warpToNextMonth(2);
  await payAllDue(circle, ACCOUNTS.alice);
  await warpToDayThisMonth(15);
  await payAllDue(circle, ACCOUNTS.bob);

  // History comes through the indexer Worker, like production (ADR 0036).
  const indexed = alice.waitForResponse(
    (r) => r.url().includes(`/v1/circles/${circle}/logs`) && r.ok(),
  );
  await alice.goto(`/app/circle/?id=${circle}`);
  const body = (await (await indexed).json()) as { known: boolean; logs: unknown[] };
  expect(body.known).toBe(true);
  expect(body.logs.length).toBeGreaterThan(0);
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

test("S-E2E-16 the activity page lists every payment and change, with filters, search and Snowtrace links", async ({
  browser,
}) => {
  const alice = await asWallet(browser, ACCOUNTS.alice);
  await alice.goto(`/app/circle/?id=${circle}`);
  await alice
    .getByRole("navigation", { name: "Main" })
    .first()
    .getByRole("link", { name: "Activity" })
    .click();
  await alice.waitForURL(/\/app\/circle\/activity\/\?id=/);
  await expect(alice.getByRole("heading", { name: "Activity" })).toBeVisible();

  const items = alice.getByTestId("activity-item");
  await expect(items.filter({ hasText: /on time\./ })).toHaveCount(1);
  await expect(items.filter({ hasText: /in late fees\./ })).toHaveCount(1);
  await expect(items.filter({ hasText: "joined the circle." })).toHaveCount(2);
  await expect(items.first().getByRole("link", { name: /Snowtrace/ })).toHaveAttribute(
    "href",
    /snowtrace\.io\/tx\/0x/,
  );

  await alice.getByRole("button", { name: "Payments" }).click();
  await expect(alice).toHaveURL(/type=payment/);
  await expect(items).toHaveCount(2);

  await alice.getByRole("searchbox").fill("nobody-here");
  await expect(alice.getByText("Nothing matches.", { exact: false })).toBeVisible();
  await expect(alice).toHaveURL(/q=nobody-here/);
});

test("S-E2E-17 your returns: annual return, a labelled projection and your history as CSV", async ({
  browser,
}) => {
  const alice = await asWallet(browser, ACCOUNTS.alice);
  await alice.goto(`/app/circle/?id=${circle}`);
  const card = alice.getByRole("region", { name: "Your returns" });
  await expect(card).toBeVisible();
  // One month of history: too short for a fair annual rate.
  await expect(card.getByTestId("my-return")).toHaveText("Not enough history yet");
  await expect(card.getByText("An illustration, not a promise.", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "30 years" }).click();
  await expect(card.getByRole("button", { name: "30 years" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const download = alice.waitForEvent("download");
  await card.getByRole("button", { name: "Download my history (CSV)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/-my-history\.csv$/);
  const path = await file.path();
  const text = (await import("node:fs")).readFileSync(path!, "utf8");
  expect(text.split("\r\n")[0]).toBe(
    "Type,Month,Installment (AVAX),Late fees (AVAX),Total (AVAX),Block,Transaction",
  );
  expect(text).toContain("Payment,");
});
