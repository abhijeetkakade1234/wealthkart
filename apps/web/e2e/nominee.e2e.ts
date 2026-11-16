import { expect, test } from "@playwright/test";
import type { Address } from "viem";

import { balanceOf, increaseTime, warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import {
  asWallet,
  createCircle,
  nomineeClaimOf,
  openDormantOf,
  payAllDue,
  vaultSend,
  vaultUint,
  vaultWrite,
} from "./support/vault";

/**
 * Backup wallet (nominee) end to end (ADR 0016, 0056). Carol names Gina, an outsider, as her
 * backup wallet; Carol stops paying and is voted dormant; Gina asks for her share; the circle
 * votes; after the notice Gina is paid. A second circle shows Carol cancelling a claim.
 * Setup steps go straight to the chain so the UI under test stays the focus.
 */
test.describe.configure({ mode: "serial" });

/** Alice creates (dormant vote after 1 missed month), Bob and Carol accept, Carol picks a name. */
async function circleWithCarol(
  alice: Awaited<ReturnType<typeof asWallet>>,
  label: string,
): Promise<Address> {
  const circle = await createCircle(alice, {
    name: `${label} ${Date.now() % 100000}`,
    dormantAfter: 1,
    founders: [ACCOUNTS.bob, ACCOUNTS.carol],
  });
  await vaultWrite(circle, ACCOUNTS.bob, "acceptInvite");
  await vaultWrite(circle, ACCOUNTS.carol, "acceptInvite");
  await vaultSend(circle, ACCOUNTS.carol, "setDisplayName", ["CarolK"]);
  return circle;
}

/**
 * Everyone pays one month (so Carol has savings); a month on, Alice and Bob pay, Carol doesn't,
 * and the circle votes her dormant.
 */
async function carolGoesDormant(circle: Address) {
  await warpToNextMonth(2);
  for (const who of [ACCOUNTS.alice, ACCOUNTS.bob, ACCOUNTS.carol]) {
    await payAllDue(circle, who as Address);
  }
  await warpToNextMonth(15);
  await payAllDue(circle, ACCOUNTS.alice);
  await payAllDue(circle, ACCOUNTS.bob);
  await vaultSend(circle, ACCOUNTS.alice, "proposeDormant", [ACCOUNTS.carol]);
  const id = await openDormantOf(circle, ACCOUNTS.carol as Address);
  await vaultSend(circle, ACCOUNTS.bob, "vote", [id, true]);
}

test.describe("backup wallet", () => {
  test("S-E2E-50 a member names a backup wallet, goes dormant, and the circle pays her share to it", async ({
    browser,
  }) => {
    // Gina has no circle yet: the checklist explains where a backup wallet is set, read from
    // the chain, with no "I've done this" tick.
    const gina = await asWallet(browser, ACCOUNTS.gina);
    const row = gina.getByTestId("checklist-nominee");
    await expect(row).toHaveAttribute("data-status", "todo");
    await expect(row.getByText(/on the circle's page/)).toBeVisible();
    await expect(row.getByRole("button", { name: "I've done this" })).toHaveCount(0);

    const alice = await asWallet(browser, ACCOUNTS.alice);
    const circle = await circleWithCarol(alice, "Backup E2E");

    // Carol adds Gina from the circle page. Her own address is refused before anything is sent.
    const carol = await asWallet(browser, ACCOUNTS.carol);
    await carol.goto(`/app/circle/?id=${circle}`);
    const card = carol.getByTestId("backup-wallet-card");
    await expect(card.getByTestId("backup-wallet-empty")).toBeVisible();
    await card.getByRole("button", { name: "Add a backup wallet" }).click();
    const dialog = carol.getByRole("dialog", { name: "Your backup wallet" });
    await expect(dialog.getByText(/only if the circle has marked you dormant/)).toBeVisible();
    await dialog.getByLabel("Backup wallet address").fill(ACCOUNTS.carol);
    await dialog.getByRole("button", { name: "Save backup wallet" }).click();
    await expect(dialog.getByText(/That's your own wallet/)).toBeVisible();
    await dialog.getByLabel("Backup wallet address").fill(ACCOUNTS.gina);
    await dialog.getByRole("button", { name: "Save backup wallet" }).click();
    await expect(carol.getByText(/Saved\. This wallet can ask for your share only/)).toBeVisible();
    await expect(card.getByTestId("backup-wallet-set")).toContainText("0x14dC…9955");

    // Gina opens the circle link: nothing to do while Carol is active.
    await gina.goto(`/app/circle/?id=${circle}`);
    const forCarol = gina.getByRole("region", { name: "You are the backup wallet for CarolK" });
    await expect(forCarol.getByText(/CarolK is active in this circle/)).toBeVisible();

    // Carol stops paying and is voted dormant; Gina asks for her share.
    await carolGoesDormant(circle);
    await gina.reload();
    await forCarol.getByRole("button", { name: "Ask the circle for CarolK's share" }).click();
    await expect(gina.getByText(/You asked for the share/)).toBeVisible();
    await expect(forCarol.getByText(/The members are voting now/)).toBeVisible();

    // The vote shows with the other requests. Alice votes from the chain; Bob settles it here.
    const [requestId] = await nomineeClaimOf(circle, ACCOUNTS.carol as Address);
    expect(requestId).toBeGreaterThan(0n);
    await vaultSend(circle, ACCOUNTS.alice, "vote", [requestId, true]);
    const bob = await asWallet(browser, ACCOUNTS.bob);
    await bob.goto(`/app/circle/votes/?id=${circle}`);
    const vote = bob.getByRole("article", { name: "Backup wallet claim for CarolK" });
    await expect(vote.getByText(/is the backup wallet CarolK named/)).toBeVisible();
    await expect(vote.getByTestId("tally")).toContainText("needs 66% yes");
    await vote.getByRole("button", { name: "Vote yes" }).click();
    await expect(bob.getByText("Vote counted: yes.")).toBeVisible();

    // Carol, if she were around, would see the claim and could cancel.
    await carol.reload();
    const alert = carol.getByTestId("nominee-claim-alert");
    await expect(alert.getByText("Your share will be paid out soon")).toBeVisible();
    await expect(alert.getByRole("button", { name: "Cancel the claim" })).toBeVisible();

    // Notice period, then Gina pays it out to her own wallet.
    await gina.reload();
    const status = forCarol.getByTestId("backup-for-status");
    await expect(status.getByText(/The circle voted yes/)).toBeVisible();
    await expect(status.getByRole("button", { name: "Pay out to my wallet" })).toHaveCount(0);
    await increaseTime(31 * 86_400);
    await gina.reload();
    const before = await balanceOf(ACCOUNTS.gina);
    const members = await vaultUint(circle, "memberCount");
    await status.getByRole("button", { name: "Pay out to my wallet" }).click();
    await expect(gina.getByText(/CarolK's share was sent to your wallet/)).toBeVisible();
    // Her installment came to Gina (less the gas Gina paid for the payout).
    expect(await balanceOf(ACCOUNTS.gina)).toBeGreaterThan(before + 400_000_000_000_000_000n);
    expect(await vaultUint(circle, "memberCount")).toBe(members - 1n);
  });

  test("S-E2E-51 a member who is fine cancels a claim and comes back", async ({ browser }) => {
    const alice = await asWallet(browser, ACCOUNTS.alice);
    const circle = await circleWithCarol(alice, "Cancel E2E");
    await vaultSend(circle, ACCOUNTS.carol, "setNominee", [ACCOUNTS.gina]);
    await carolGoesDormant(circle);
    await vaultSend(circle, ACCOUNTS.gina, "requestNomineeClaim", [ACCOUNTS.carol]);

    const carol = await asWallet(browser, ACCOUNTS.carol);
    await carol.goto(`/app/circle/?id=${circle}`);
    const alert = carol.getByTestId("nominee-claim-alert");
    await expect(alert.getByText("Someone asked for your share")).toBeVisible();
    // While the claim runs her backup wallet can't be swapped from the card.
    await expect(
      carol.getByTestId("backup-wallet-card").getByRole("button", { name: "Change backup wallet" }),
    ).toBeDisabled();
    await alert.getByRole("button", { name: "Cancel the claim" }).click();
    await expect(carol.getByText(/Claim cancelled\. Your share stays yours/)).toBeVisible();
    await carol.reload();
    await expect(carol.getByTestId("nominee-claim-alert")).toHaveCount(0);
    await expect(carol.getByText("Your payments are paused")).toHaveCount(0);
    const [open, payTo] = await nomineeClaimOf(circle, ACCOUNTS.carol as Address);
    expect(open).toBe(0n);
    expect(payTo).toBe("0x0000000000000000000000000000000000000000");
  });
});
