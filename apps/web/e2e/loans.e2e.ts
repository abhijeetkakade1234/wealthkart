import { expect, test } from "@playwright/test";
import type { Address } from "viem";

import { balanceOf, warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { asWallet, loanFor, paidCircleOfThree, pendingLoanOf, vaultSend } from "./support/vault";

/**
 * Loans (ADR 0038): ask, vote, payout, interest, repayment, guarantors and defaults. Each test
 * builds its own circle of three founders with month one paid (1.5 AVAX, so the biggest loan is
 * 40% = 0.60 AVAX); setup goes straight to the chain so the UI under test stays the focus.
 */
const AVAX = 10n ** 18n;
const alice = ACCOUNTS.alice as Address;
const bob = ACCOUNTS.bob as Address;
const carol = ACCOUNTS.carol as Address;

test.describe("loans", () => {
  test("S-E2E-23 a member asks for a loan, two others vote yes in their own browsers, and the AVAX arrives", async ({
    browser,
  }) => {
    const a = await asWallet(browser, alice);
    const circle = await paidCircleOfThree(a, "Loan E2E");

    // Loans is in the nav now.
    await a.getByRole("link", { name: "Loans" }).first().click();
    await a.waitForURL(/\/app\/circle\/loans\/\?id=/);
    await expect(a.getByTestId("no-loan")).toBeVisible();

    await a.getByRole("button", { name: "Ask for a loan" }).click();
    const dialog = a.getByRole("dialog", { name: "Ask for a loan" });
    await expect(dialog.getByText("You can ask for up to 0.60 AVAX right now.")).toBeVisible();
    await expect(dialog.getByText("Biggest loan the circle allows")).toBeVisible();
    await expect(dialog.getByText("Cash free to lend")).toBeVisible();

    // Too much is refused before anything is sent.
    await dialog.getByLabel("Amount in AVAX").fill("0.9");
    await expect(dialog.getByText(/That's more than you can ask for right now/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Ask the circle" })).toBeDisabled();

    await dialog.getByLabel("Amount in AVAX").fill("0.5");
    await expect(dialog.getByText("0.0050 AVAX a month")).toBeVisible();
    await dialog.getByRole("button", { name: "Ask the circle" }).click();
    await expect(a.getByText(/Loan request sent/)).toBeVisible();
    const mine = a.getByTestId("my-request");
    await expect(mine.getByText("AVAX asked for")).toBeVisible();
    await expect(mine.getByTestId("my-request-tally")).toContainText("0 yes, 0 no");

    const before = await balanceOf(alice);

    // Bob and Carol vote yes from the Votes page; the second yes pays out.
    for (const who of [bob, carol]) {
      const p = await asWallet(browser, who);
      await p.goto(`/app/circle/votes/?id=${circle}`);
      const card = p.getByTestId("loan-request-card");
      await expect(card.getByRole("heading", { name: /0\.50 AVAX for/ })).toBeVisible();
      await expect(card.getByTestId("guarantor-state")).toHaveText("None");
      await card.getByRole("button", { name: "Vote yes" }).click();
      await expect(p.getByText("Vote counted: yes.")).toBeVisible();
      await p.context().close();
    }

    expect((await balanceOf(alice)) - before).toBe(AVAX / 2n);

    await a.reload();
    const panel = a.getByTestId("my-loan");
    await expect(panel.getByTestId("loan-outstanding")).toContainText("0.50");
    await expect(panel.getByText(/Interest starts in/)).toBeVisible();
    await expect(panel.getByLabel("Loan terms")).toBeVisible();
    const rows = a.getByTestId("loan-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-status", "active");

    // The overview charts show the loan.
    await a.goto(`/app/circle/?id=${circle}`);
    const owed = a.getByRole("region", { name: "Loans outstanding per member" });
    await expect(owed).toBeVisible();
    await owed.getByRole("button", { name: "Table" }).click();
    await expect(owed.getByRole("cell", { name: "0.50" })).toBeVisible();
    const money = a.getByRole("region", { name: "Where the money is" });
    await expect(money.getByText("Lent out to members")).toBeVisible();
  });

  test("S-E2E-24 a month later the borrower pays interest from the UI, then repays in full", async ({
    browser,
  }) => {
    const a = await asWallet(browser, alice);
    const circle = await paidCircleOfThree(a, "Repay E2E");
    await loanFor(circle, alice, [bob, carol], AVAX / 2n);
    await warpToNextMonth(2);

    await a.goto(`/app/circle/loans/?id=${circle}`);
    const panel = a.getByTestId("my-loan");
    await expect(panel.getByTestId("interest-now")).toHaveText("0.0050 AVAX");
    await panel.getByRole("button", { name: "Pay interest 0.0050 AVAX" }).click();
    await expect(a.getByText("Interest paid: 0.0050 AVAX. Thank you.")).toBeVisible();
    await expect(panel.getByTestId("interest-now")).toHaveText("0.00 AVAX");

    await panel.getByRole("button", { name: "Repay", exact: true }).click();
    const dialog = a.getByRole("dialog", { name: "Repay your loan" });
    await dialog.getByRole("button", { name: "Repay 0.50 AVAX" }).click();
    await expect(a.getByText(/Loan repaid in full/)).toBeVisible();
    await expect(a.getByTestId("no-loan")).toBeVisible();

    // The activity feed tells the story under the Loans filter.
    await a.goto(`/app/circle/activity/?id=${circle}`);
    await a.getByRole("button", { name: "Loans" }).click();
    await expect(a).toHaveURL(/type=loan/);
    await expect(a.getByText(/repaid their loan in full: 0\.50 AVAX/)).toBeVisible();
    await expect(a.getByText(/paid 0\.0050 AVAX of loan interest/)).toBeVisible();
  });

  test("S-E2E-25 a borrower names a guarantor; the vote passes and the AVAX goes out once the guarantor accepts", async ({
    browser,
  }) => {
    const a = await asWallet(browser, alice);
    const circle = await paidCircleOfThree(a, "Guarantor E2E");

    const b = await asWallet(browser, bob);
    await b.goto(`/app/circle/loans/?id=${circle}`);
    await b.getByRole("button", { name: "Ask for a loan" }).click();
    const dialog = b.getByRole("dialog", { name: "Ask for a loan" });
    await dialog.getByLabel("Guarantor (optional)").selectOption({ value: carol });
    await expect(dialog.getByText(/2 times your savings plus your guarantor's/)).toBeVisible();
    await dialog.getByLabel("Amount in AVAX").fill("0.3");
    await dialog.getByRole("button", { name: "Ask the circle" }).click();
    await expect(b.getByText(/Loan request sent/)).toBeVisible();
    await expect(b.getByTestId("my-request").getByText(/Hasn't agreed yet/)).toBeVisible();

    // Alice votes yes in the UI and sees the guarantor hasn't agreed; Carol votes on-chain.
    await a.goto(`/app/circle/votes/?id=${circle}`);
    const card = a.getByTestId("loan-request-card");
    await expect(card.getByTestId("guarantor-state")).toContainText("not agreed yet");
    await card.getByRole("button", { name: "Vote yes" }).click();
    await expect(a.getByText("Vote counted: yes.")).toBeVisible();
    await vaultSend(circle, carol, "voteLoan", [await pendingLoanOf(circle, bob), true]);
    await a.reload();
    await expect(card.getByText(/as soon as the guarantor agrees/)).toBeVisible();

    const before = await balanceOf(bob);
    const c = await asWallet(browser, carol);
    await c.goto(`/app/circle/loans/?id=${circle}`);
    const notice = c.getByTestId("guarantor-notice");
    await expect(notice.getByText(/asked you to back a loan of 0\.30 AVAX/)).toBeVisible();
    await expect(notice.getByText(/you're frozen too/)).toBeVisible();
    await notice.getByRole("button", { name: "Back this loan" }).click();
    await expect(c.getByText(/You're backing .*'s loan\./).first()).toBeVisible();

    expect((await balanceOf(bob)) - before).toBe((3n * AVAX) / 10n);
    await c.reload();
    await expect(c.getByText(/You're backing .*'s loan/)).toBeVisible();
    await expect(c.getByTestId("guarantor-notice")).toHaveCount(0);

    await b.reload();
    await expect(b.getByTestId("my-loan").getByTestId("loan-outstanding")).toContainText("0.30");
  });

  test("S-E2E-26 an overdue loan is marked as defaulted from the list and the borrower sees the frozen notice", async ({
    browser,
  }) => {
    const a = await asWallet(browser, alice);
    const circle = await paidCircleOfThree(a, "Default E2E");
    await loanFor(circle, alice, [bob, carol], AVAX / 2n);
    // Two months of interest go unpaid past their due day (10th).
    await warpToNextMonth(12);
    await warpToNextMonth(12);

    const b = await asWallet(browser, bob);
    await b.goto(`/app/circle/loans/?id=${circle}`);
    const row = b.getByTestId("loan-row").first();
    await expect(row.getByText("Interest 2 months late")).toBeVisible();
    await row.getByRole("button", { name: "Mark as defaulted" }).click();
    const dialog = b.getByRole("dialog", { name: /Mark .*'s loan as defaulted\?/ });
    await expect(dialog.getByText(/will be frozen/)).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, mark as defaulted" }).click();
    await expect(b.getByText(/loan is marked as defaulted\./)).toBeVisible();
    await expect(b.getByTestId("loan-row").first()).toHaveAttribute("data-status", "default");
    await expect(
      b.getByTestId("loan-row").first().getByRole("button", { name: "Ask the circle to settle" }),
    ).toBeVisible();

    await a.goto(`/app/circle/loans/?id=${circle}`);
    const frozen = a.getByTestId("frozen-notice");
    await expect(frozen).toBeVisible();
    await expect(a.getByText("Your loan is in default, so you're frozen")).toBeVisible();
    await expect(frozen).toContainText(
      /AVAX of interest and late fees you owe and the freeze lifts/,
    );
  });
});
