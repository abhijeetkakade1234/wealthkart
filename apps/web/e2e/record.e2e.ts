import { expect, test } from "@playwright/test";

import { ACCOUNTS } from "./support/env";
import { asWallet, paidCircleOfThree } from "./support/vault";

/**
 * The public repayment record (ADR 0042): circles write each payment to a soulbound record,
 * and anyone with the link can read it, without connecting a wallet.
 */
test("S-E2E-30 a wallet's repayment record shows its on-time payments to anyone with the link", async ({
  browser,
}) => {
  const alice = await asWallet(browser, ACCOUNTS.alice);
  await paidCircleOfThree(alice, "Record E2E");

  // A fresh browser with no wallet at all.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/record/?address=${ACCOUNTS.carol}`);
  await expect(visitor.getByRole("heading", { name: "Repayment record" })).toBeVisible();
  const record = visitor.getByTestId("record");
  // Carol pays in other test circles too (some late), so check the shape, not one number.
  await expect(record).toContainText(/\d+(\.\d)?% of \d+ months? paid on time/);
  await expect(record).not.toContainText("No record yet");
  await expect(record.getByText("Months on time")).toBeVisible();
  await expect(visitor.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);

  // A typo is caught before anything is read.
  await visitor.getByPlaceholder("Wallet address, 0x…").fill("0xnope");
  await expect(visitor.getByText("That isn't a wallet address.")).toBeVisible();
});
