import { type Browser, expect, type Page, test } from "@playwright/test";
// The SDK package is ESM-only and Playwright loads tests as CommonJS, so read the ABI source.
import { circleVaultAbi } from "../../../packages/sdk/src/abi/CircleVault";
import { decodeFunctionResult, encodeFunctionData, type Address } from "viem";

import { call, send, warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";

/**
 * Dormant members end to end (ADR 0010, ADR 0032, RT-11). Carol loses her wallet; Alice asks
 * the circle to pause her payments, Bob's vote settles it, and Carol comes back later.
 * Setup (accepting invites, paying) goes straight to the chain so the UI under test stays the
 * focus. Steps build on each other, so they run in order.
 */
test.describe.configure({ mode: "serial" });

let circle = "" as Address;
const CAROL_SHORT = /0x90F7…b906/;

async function asWallet(browser: Browser, account: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installFakeCore(page, account);
  await page.goto("/app/");
  await page.getByRole("button", { name: "Connect Core" }).first().click();
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  return page;
}

async function vaultWrite(
  from: string,
  functionName: "acceptInvite" | "contribute",
  value?: bigint,
) {
  await send({
    from,
    to: circle,
    data: encodeFunctionData({ abi: circleVaultAbi, functionName }),
    value,
  });
}

/** Pays every installment `who` owes right now. */
async function payAllDue(who: Address) {
  for (let i = 0; i < 6; i++) {
    const data = encodeFunctionData({
      abi: circleVaultAbi,
      functionName: "amountDue",
      args: [who],
    });
    const [, amount, , payable] = decodeFunctionResult({
      abi: circleVaultAbi,
      functionName: "amountDue",
      data: (await call(circle, data)) as `0x${string}`,
    });
    if (!payable) return;
    await vaultWrite(who, "contribute", amount);
  }
}

test.describe("dormant members", () => {
  test("S-E2E-11 a member who stops paying can be voted dormant, and the vote pauses her dues", async ({
    browser,
  }) => {
    const alice = await asWallet(browser, ACCOUNTS.alice);
    await alice.goto("/app/new/");
    await alice.getByLabel("Circle name").fill(`Dormant E2E ${Date.now() % 100000}`);
    await alice.getByLabel("Missed months before a dormant vote").fill("1");
    await alice.locator("#founders").fill(`${ACCOUNTS.bob}\n${ACCOUNTS.carol}`);
    await alice.getByRole("button", { name: "Create circle" }).click();
    await alice.waitForURL(/\/app\/circle\/\?id=0x[0-9a-fA-F]{40}/);
    circle = new URL(alice.url()).searchParams.get("id")! as Address;

    await vaultWrite(ACCOUNTS.bob, "acceptInvite");
    await vaultWrite(ACCOUNTS.carol, "acceptInvite");

    // A month later, past the due day. Alice and Bob pay; Carol has lost her wallet.
    await warpToNextMonth(15);
    await payAllDue(ACCOUNTS.alice);
    await payAllDue(ACCOUNTS.bob);

    await alice.reload();
    const carolRow = alice.getByRole("row", { name: CAROL_SHORT });
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
