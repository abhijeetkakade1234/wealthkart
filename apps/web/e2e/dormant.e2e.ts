import { expect, test } from "@playwright/test";
import type { Address } from "viem";

import { warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { asWallet, createCircle, payAllDue, vaultWrite } from "./support/vault";

/**
 * Dormant members end to end (ADR 0010, ADR 0032, RT-11). Carol loses her wallet; Alice asks
 * the circle to pause her payments, Bob's vote settles it, and Carol comes back later.
 * Setup (accepting invites, paying) goes straight to the chain so the UI under test stays the
 * focus. Steps build on each other, so they run in order.
 */
test.describe.configure({ mode: "serial" });

let circle = "" as Address;
const CAROL_SHORT = /0x90F7…b906/;

test.describe("dormant members", () => {
  test("S-E2E-11 a member who stops paying can be voted dormant, and the vote pauses her dues", async ({
    browser,
  }) => {
    const alice = await asWallet(browser, ACCOUNTS.alice);
    circle = await createCircle(alice, {
      name: `Dormant E2E ${Date.now() % 100000}`,
      dormantAfter: 1,
      founders: [ACCOUNTS.bob, ACCOUNTS.carol],
    });

    await vaultWrite(circle, ACCOUNTS.bob, "acceptInvite");
    await vaultWrite(circle, ACCOUNTS.carol, "acceptInvite");

    // A month later, past the due day. Alice and Bob pay; Carol has lost her wallet.
    await warpToNextMonth(15);
    await payAllDue(circle, ACCOUNTS.alice);
    await payAllDue(circle, ACCOUNTS.bob);

    await alice.reload();
    const carolRow = alice
      .getByRole("table", { name: "Members" })
      .getByRole("row", { name: CAROL_SHORT });
    await expect(carolRow.getByText(/Missed \d+ months?/)).toBeVisible();
    await carolRow.getByRole("button", { name: /Ask the circle to pause/ }).click();
    await expect(alice.getByText(/Vote started/)).toBeVisible();
    await expect(carolRow.getByRole("link", { name: "Vote open" })).toBeVisible();

    // Two possible voters (Carol can't vote on herself): Alice's yes is counted, Bob settles it.
    const bob = await asWallet(browser, ACCOUNTS.bob);
    await bob.goto(`/app/circle/votes/?id=${circle}`);
    const card = bob.getByRole("article", { name: /Dormant vote about/ });
    await expect(card.getByText("Pause payments")).toBeVisible();
    await expect(card.getByTestId("tally")).toContainText("needs more than 50% yes");
    await card.getByRole("button", { name: "Vote yes" }).click();
    await expect(bob.getByText("Vote counted: yes.")).toBeVisible();

    await alice.reload();
    await expect(carolRow.getByText("Dormant, payments paused")).toBeVisible();
  });

  test("S-E2E-12 the dormant member sees her savings are safe and comes back with one tap", async ({
    browser,
  }) => {
    const carol = await asWallet(browser, ACCOUNTS.carol);
    await carol.goto(`/app/circle/?id=${circle}`);
    await expect(carol.getByText("Your payments are paused")).toBeVisible();

    // The Pay page explains that paying would also bring her back (RT-11).
    await carol.goto(`/app/circle/pay/?id=${circle}`);
    await expect(carol.getByText("Paying brings you back")).toBeVisible();

    await carol.goto(`/app/circle/?id=${circle}`);
    await carol.getByRole("button", { name: "I'm back" }).click();
    await expect(carol.getByText(/Welcome back/)).toBeVisible();
    await carol.reload();
    await expect(carol.getByText("Your payments are paused")).toHaveCount(0);
  });
});
