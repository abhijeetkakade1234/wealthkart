import { type Browser, expect, type Page, test } from "@playwright/test";

import { increaseTime } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";

/**
 * Phase 1 membership, end to end (ADR 0028, 0029). One circle, four wallets, each in its own
 * browser context like four phones. Steps build on each other, so they run in order.
 */
test.describe.configure({ mode: "serial" });

const VOTING_WINDOW = 48 * 60 * 60;
let circle = "";

/**
 * A fresh browser (like a separate phone) with the test wallet, already connected once.
 * The connection is remembered, so later page loads reconnect on their own.
 */
async function asWallet(browser: Browser, account: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installFakeCore(page, account);
  await page.goto("/app/");
  await page.getByRole("button", { name: "Connect Core" }).first().click();
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  return page;
}

async function open(page: Page, path: string) {
  await page.goto(path);
}

test.describe("membership", () => {
  test("S-E2E-04 a founder named at creation accepts the invite and becomes a member", async ({
    browser,
  }) => {
    const alice = await asWallet(browser, ACCOUNTS.alice);
    await open(alice, "/app/new/");
    await alice.getByLabel("Circle name").fill(`Members E2E ${Date.now() % 100000}`);
    await alice.locator("#founders").fill(ACCOUNTS.bob);
    await alice.getByRole("button", { name: "Create circle" }).click();
    await alice.waitForURL(/\/app\/circle\/\?id=0x[0-9a-fA-F]{40}/);
    circle = new URL(alice.url()).searchParams.get("id")!;
    // Bob is only invited: the circle has one member until he accepts (RT-02).
    await expect(alice.getByText(/^1 members/)).toBeVisible();

    const bob = await asWallet(browser, ACCOUNTS.bob);
    await open(bob, `/app/join/?id=${circle}`);
    await expect(bob.getByText("You've been invited as a founder.")).toBeVisible();
    await bob.getByRole("button", { name: "Accept invite" }).click();
    await expect(bob.getByText(/You're a member of/)).toBeVisible();

    await alice.reload();
    await expect(alice.getByText(/^2 members/)).toBeVisible();
    await expect(alice.getByRole("cell", { name: /0x3C44…93BC/ })).toBeVisible();
  });

  test("S-E2E-05 a friend asks to join from an invite link and the members vote them in", async ({
    browser,
  }) => {
    const carol = await asWallet(browser, ACCOUNTS.carol);
    await open(carol, `/app/join/?id=${circle}&by=${ACCOUNTS.alice}`);
    await expect(carol.getByText("Invited by")).toBeVisible();
    await carol.getByLabel("Your name in this circle").fill("Carol_C");
    await expect(carol.getByText("That name is free.")).toBeVisible();
    await carol.getByRole("button", { name: "Ask to join" }).click();
    await expect(carol.getByTestId("join-status")).toContainText("Waiting for votes");

    // Two members, 66% yes needed: Alice's yes alone isn't enough, Bob's settles it.
    for (const account of [ACCOUNTS.alice, ACCOUNTS.bob]) {
      const voter = await asWallet(browser, account);
      await open(voter, `/app/circle/votes/?id=${circle}`);
      const card = voter.getByRole("article", { name: /Join request from Carol_C/ });
      await expect(card).toBeVisible();
      if (account === ACCOUNTS.alice)
        await expect(card.getByText("Not confirmed yet")).toBeVisible();
      await card.getByRole("button", { name: "Vote yes" }).click();
      await expect(voter.getByText("Vote counted: yes.")).toBeVisible();
    }

    await carol.reload();
    await expect(carol.getByTestId("join-result")).toContainText("You're in.");
    await open(carol, `/app/circle/?id=${circle}`);
    await expect(carol.getByTestId("my-name")).toHaveText("Carol_C");
    await expect(carol.getByRole("cell", { name: /Carol_C/ })).toBeVisible();
  });

  test("S-E2E-06 a request nobody votes on expires and anyone can settle it", async ({
    browser,
  }) => {
    const dave = await asWallet(browser, ACCOUNTS.dave);
    await open(dave, `/app/join/?id=${circle}`);
    await dave.getByLabel("Your name in this circle").fill("Dave_D");
    await expect(dave.getByText("That name is free.")).toBeVisible();
    await dave.getByRole("button", { name: "Ask to join" }).click();
    await expect(dave.getByTestId("join-status")).toBeVisible();

    await increaseTime(VOTING_WINDOW + 60);

    const alice = await asWallet(browser, ACCOUNTS.alice);
    await open(alice, `/app/circle/votes/?id=${circle}`);
    const card = alice.getByRole("article", { name: /Join request from Dave_D/ });
    await expect(card.getByText(/Voting time ran out/)).toBeVisible();
    await card.getByRole("button", { name: "Settle the vote" }).click();
    await expect(alice.getByText(/Settled: voting time ran out/)).toBeVisible();
    await expect(alice.getByText(/No one is waiting to join/)).toBeVisible();

    await dave.reload();
    await expect(dave.getByTestId("join-result")).toContainText("Voting time ran out");
  });

  test("S-E2E-07 picking a name already used in the circle (any letter case) is refused", async ({
    browser,
  }) => {
    const bob = await asWallet(browser, ACCOUNTS.bob);
    await open(bob, `/app/circle/?id=${circle}`);
    await bob.getByRole("button", { name: "Pick a name" }).click();
    const dialog = bob.getByRole("dialog");
    await dialog.getByLabel("Your name in this circle").fill("carol_c");
    await expect(dialog.getByText(/already uses that name/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save name" })).toBeDisabled();

    await dialog.getByLabel("Your name in this circle").fill("Bobby");
    await expect(dialog.getByText("That name is free.")).toBeVisible();
    await dialog.getByRole("button", { name: "Save name" }).click();
    await expect(bob.getByTestId("my-name")).toHaveText("Bobby");
    await expect(bob.getByRole("button", { name: "Change name" })).toBeDisabled();
  });
});
