import { expect, type Page, test } from "@playwright/test";

import { increaseTime, warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { amountDue, asWallet, paidCircleOfThree, payAllDue, vaultUint } from "./support/vault";
import type { Address } from "viem";

/**
 * Circle proposals end to end (ADR 0040, 0019, 0021): rule changes, fee waivers and closing
 * the circle, each proposed from the UI and voted through by members in their own browsers.
 * Every test builds its own circle of three founders with month one paid.
 */

async function openNewProposal(page: Page, circle: Address) {
  await page.goto(`/app/circle/votes/?id=${circle}`);
  await page.getByRole("button", { name: "New proposal" }).click();
  return page.getByRole("dialog", { name: "New proposal" });
}

async function voteYes(page: Page, circle: Address, title: string) {
  await page.goto(`/app/circle/votes/?id=${circle}`);
  const card = page.getByRole("article", { name: `Proposal: ${title}` });
  await card.getByRole("button", { name: "Vote yes" }).click();
  await expect(page.getByText("Vote counted: yes.")).toBeVisible();
}

test.describe("circle proposals", () => {
  test("S-E2E-20 a rule change is proposed, voted through, applied after the wait, and shows on the circle", async ({
    browser,
  }) => {
    const alice = await asWallet(browser, ACCOUNTS.alice);
    const circle = await paidCircleOfThree(alice, "Rules E2E");

    const dialog = await openNewProposal(alice, circle);
    await dialog.getByLabel("Notice to leave").fill("14");
    await expect(dialog.getByTestId("rule-diff")).toContainText("30 days");
    await expect(dialog.getByTestId("rule-diff")).toContainText("14 days");
    // Out of bounds is refused before anything is sent.
    await dialog.getByLabel("Leaving fee").fill("12");
    await expect(dialog.getByText("The leaving fee must be 0 to 10%.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Propose these rules" })).toBeDisabled();
    await dialog.getByLabel("Leaving fee").fill("0");
    await dialog.getByRole("button", { name: "Propose these rules" }).click();
    await expect(alice.getByText(/Proposal sent\. Your yes is counted/)).toBeVisible();

    const card = alice.getByRole("article", { name: "Proposal: Change the rules" });
    await expect(card.getByTestId("tally")).toContainText("1 yes, 0 no");
    await expect(card.getByText("Notice to leave")).toBeVisible();

    const bob = await asWallet(browser, ACCOUNTS.bob);
    await voteYes(bob, circle, "Change the rules");
    await bob.reload();
    const banner = bob.getByTestId("rule-change-banner");
    await expect(banner.getByText(/New rules apply on \d+ \w+ \d{4}/)).toBeVisible();
    await expect(banner.getByRole("button", { name: "Apply new rules" })).toHaveCount(0);

    // Until the change applies, members may leave with no notice (rage-quit, ADR 0019).
    await bob.goto(`/app/circle/?id=${circle}`);
    await expect(bob.getByText("You can leave with no notice right now")).toBeVisible();

    // The wait (7 days, then the 1st of the next month) passes.
    await increaseTime(40 * 86_400);
    await alice.goto(`/app/circle/?id=${circle}`);
    const due = alice.getByTestId("rule-change-banner");
    await expect(due.getByText("New rules are ready to apply")).toBeVisible();
    await due.getByRole("button", { name: "Apply new rules" }).click();
    await expect(alice.getByText("The new rules are in force.")).toBeVisible();
    await alice.reload();
    const rules = alice.getByTestId("rules-list");
    await expect(rules.getByText("Notice to leave")).toBeVisible();
    await expect(rules.getByText("14 days")).toBeVisible();
    await expect(alice.getByTestId("rule-change-banner")).toHaveCount(0);
  });

  test("S-E2E-21 a fee waiver passes and the member then pays her late month with no late fee", async ({
    browser,
  }) => {
    const alice = await asWallet(browser, ACCOUNTS.alice);
    const circle = await paidCircleOfThree(alice, "Waiver E2E");

    // Next month, past the due day: Alice and Bob pay, Carol is late.
    await warpToNextMonth(15);
    await payAllDue(circle, ACCOUNTS.alice);
    await payAllDue(circle, ACCOUNTS.bob);
    const [, , feesBefore] = await amountDue(circle, ACCOUNTS.carol);
    expect(feesBefore).toBeGreaterThan(0n);

    const dialog = await openNewProposal(alice, circle);
    await dialog.getByRole("tab", { name: "Fee waiver" }).click();
    await dialog.getByLabel("Member").selectOption({ label: "0x90F7…b906" });
    await dialog.getByLabel("Reason").selectOption({ label: "Medical" });
    await dialog.getByRole("button", { name: "Propose the waiver" }).click();
    await expect(alice.getByText(/Proposal sent\. The others can vote/)).toBeVisible();

    const card = alice.getByRole("article", { name: "Proposal: Waive late fees" });
    await expect(card.getByTestId("waiver-member")).toHaveText("0x90F7…b906");
    await expect(card.getByText("Medical")).toBeVisible();

    // Carol can see it but can't vote on her own waiver; Bob's yes passes it.
    const carol = await asWallet(browser, ACCOUNTS.carol);
    await carol.goto(`/app/circle/votes/?id=${circle}`);
    await expect(
      carol
        .getByRole("article", { name: "Proposal: Waive late fees" })
        .getByText("This one is about you, so you can't vote on it."),
    ).toBeVisible();
    const bob = await asWallet(browser, ACCOUNTS.bob);
    await voteYes(bob, circle, "Waive late fees");

    const [, amount, fees] = await amountDue(circle, ACCOUNTS.carol);
    expect(fees).toBe(0n);
    await carol.goto(`/app/circle/pay/?id=${circle}`);
    await expect(carol.getByText(/in late fees/)).toHaveCount(0);
    await carol.getByRole("button", { name: /^Pay / }).click();
    await expect(carol.getByText(/^Paid\./)).toBeVisible();
    const [, , , payable] = await amountDue(circle, ACCOUNTS.carol);
    expect(payable).toBe(false);
    expect(amount).toBeGreaterThan(0n);
  });

  test("S-E2E-22 the circle votes to close and a member claims her share", async ({ browser }) => {
    const alice = await asWallet(browser, ACCOUNTS.alice);
    const circle = await paidCircleOfThree(alice, "Dissolve E2E");

    const dialog = await openNewProposal(alice, circle);
    await dialog.getByRole("tab", { name: "Close" }).click();
    await expect(dialog.getByText("Closing is for good")).toBeVisible();
    await dialog.getByRole("button", { name: "Propose closing the circle" }).click();
    await expect(alice.getByText(/The members will vote on closing the circle/)).toBeVisible();

    const bob = await asWallet(browser, ACCOUNTS.bob);
    await bob.goto(`/app/circle/votes/?id=${circle}`);
    const card = bob.getByRole("article", { name: "Proposal: Close the circle" });
    await expect(card.getByText("This closes the circle for good.")).toBeVisible();
    await expect(card.getByTestId("tally")).toContainText("needs 66% yes");
    await voteYes(bob, circle, "Close the circle");

    const before = await vaultUint(circle, "totalAssets");
    const carol = await asWallet(browser, ACCOUNTS.carol);
    await carol.goto(`/app/circle/?id=${circle}`);
    const notice = carol.getByTestId("dissolved-notice");
    await expect(notice.getByText("This circle has voted to close")).toBeVisible();
    await expect(carol.getByRole("button", { name: "Leave this circle" })).toHaveCount(0);
    await notice.getByRole("button", { name: "Claim your share" }).click();
    await expect(carol.getByText(/AVAX was sent to your wallet\. Thank you/)).toBeVisible();

    expect(await vaultUint(circle, "totalAssets")).toBeLessThan(before);
    expect(await vaultUint(circle, "memberCount")).toBe(2n);
  });
});
