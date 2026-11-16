import { type Browser, expect, type Page } from "@playwright/test";
import { decodeFunctionResult, encodeFunctionData, type Address } from "viem";

// The SDK package is ESM-only and Playwright loads tests as CommonJS, so read the ABI source.
import { circleVaultAbi } from "../../../../packages/sdk/src/abi/CircleVault";
import { call, send, warpToNextMonth } from "./chain";
import { ACCOUNTS } from "./env";
import { installFakeCore } from "./fake-core";

/**
 * Shared E2E helpers: a wallet in its own browser (like a separate phone), and direct chain
 * calls for setup steps (accepting invites, paying) so each test's UI under test stays the
 * focus.
 */

/** A fresh browser context with the test wallet, connected once (the app remembers it). */
export async function asWallet(browser: Browser, account: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installFakeCore(page, account);
  await page.goto("/app/");
  await page.getByRole("button", { name: "Connect Core" }).first().click();
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  return page;
}

export async function vaultWrite(
  circle: Address,
  from: string,
  functionName: "acceptInvite" | "contribute" | "requestExit" | "pause",
  value?: bigint,
) {
  await send({
    from,
    to: circle,
    data: encodeFunctionData({ abi: circleVaultAbi, functionName }),
    value,
  });
}

/** Reads a no-argument uint view of the vault, e.g. `totalAssets`. */
export async function vaultUint(
  circle: Address,
  functionName: "totalAssets" | "totalShares" | "memberCount" | "pausedUntil",
): Promise<bigint> {
  const data = encodeFunctionData({ abi: circleVaultAbi, functionName });
  const out = decodeFunctionResult({
    abi: circleVaultAbi,
    functionName,
    data: (await call(circle, data)) as `0x${string}`,
  });
  return BigInt(out as bigint | number);
}

/** A circle of three founders (Alice creates; Bob and Carol accept) with month one paid. */
export async function paidCircleOfThree(page: Page, name: string): Promise<Address> {
  const circle = await createCircle(page, {
    name: `${name} ${Date.now() % 100000}`,
    founders: [ACCOUNTS.bob, ACCOUNTS.carol],
  });
  await vaultWrite(circle, ACCOUNTS.bob, "acceptInvite");
  await vaultWrite(circle, ACCOUNTS.carol, "acceptInvite");
  await warpToNextMonth(2);
  for (const who of [ACCOUNTS.alice, ACCOUNTS.bob, ACCOUNTS.carol]) await payAllDue(circle, who);
  return circle;
}

/** What `who` owes right now: [period, amount, fees, payable]. */
export async function amountDue(circle: Address, who: Address) {
  const data = encodeFunctionData({ abi: circleVaultAbi, functionName: "amountDue", args: [who] });
  return decodeFunctionResult({
    abi: circleVaultAbi,
    functionName: "amountDue",
    data: (await call(circle, data)) as `0x${string}`,
  });
}

/** Pays every installment `who` owes right now (bounded). */
export async function payAllDue(circle: Address, who: Address) {
  for (let i = 0; i < 6; i++) {
    const [, amount, , payable] = await amountDue(circle, who);
    if (!payable) return;
    await vaultWrite(circle, who, "contribute", amount);
  }
}

/** Creates a circle from the UI as `page`'s wallet and returns its address. */
export async function createCircle(
  page: Page,
  opts: { name: string; founders?: string[]; dormantAfter?: number },
): Promise<Address> {
  await page.goto("/app/new/");
  await page.getByLabel("Circle name").fill(opts.name);
  if (opts.dormantAfter !== undefined) {
    await page.getByLabel("Missed months before a dormant vote").fill(String(opts.dormantAfter));
  }
  if (opts.founders?.length) await page.locator("#founders").fill(opts.founders.join("\n"));
  await page.getByRole("button", { name: "Create circle" }).click();
  await page.waitForURL(/\/app\/circle\/\?id=0x[0-9a-fA-F]{40}/);
  return new URL(page.url()).searchParams.get("id")! as Address;
}

/** Any vault write with arguments, from an anvil dev account (setup steps only). */
export async function vaultSend(
  circle: Address,
  from: string,
  functionName:
    | "requestLoan"
    | "voteLoan"
    | "acceptGuarantee"
    | "proposeDormant"
    | "vote"
    | "setNominee"
    | "setDisplayName"
    | "requestNomineeClaim",
  args: readonly unknown[],
  value?: bigint,
) {
  await send({
    from,
    to: circle,
    data: encodeFunctionData({
      abi: circleVaultAbi,
      functionName,
      args,
    } as unknown as Parameters<typeof encodeFunctionData>[0]),
    value,
  });
}

/** The open dormant vote about `who` (0 = none). */
export async function openDormantOf(circle: Address, who: Address): Promise<bigint> {
  const data = encodeFunctionData({
    abi: circleVaultAbi,
    functionName: "openDormantOf",
    args: [who],
  });
  return decodeFunctionResult({
    abi: circleVaultAbi,
    functionName: "openDormantOf",
    data: (await call(circle, data)) as `0x${string}`,
  });
}

/** A backup-wallet claim about `member`: [open request id, payee once passed] (ADR 0056). */
export async function nomineeClaimOf(circle: Address, member: Address) {
  const data = encodeFunctionData({
    abi: circleVaultAbi,
    functionName: "nomineeClaimOf",
    args: [member],
  });
  return decodeFunctionResult({
    abi: circleVaultAbi,
    functionName: "nomineeClaimOf",
    data: (await call(circle, data)) as `0x${string}`,
  });
}

/** The open loan request id of `who` (0 = none). */
export async function pendingLoanOf(circle: Address, who: Address): Promise<bigint> {
  const data = encodeFunctionData({
    abi: circleVaultAbi,
    functionName: "pendingLoanOf",
    args: [who],
  });
  return decodeFunctionResult({
    abi: circleVaultAbi,
    functionName: "pendingLoanOf",
    data: (await call(circle, data)) as `0x${string}`,
  });
}

/**
 * Setup for loan tests: `borrower` asks for `amount` (no guarantor) and the two other founders
 * vote yes, so the AVAX goes out in the second vote.
 */
export async function loanFor(
  circle: Address,
  borrower: Address,
  voters: Address[],
  amount: bigint,
) {
  await vaultSend(circle, borrower, "requestLoan", [
    amount,
    false,
    "0x0000000000000000000000000000000000000000",
  ]);
  const id = await pendingLoanOf(circle, borrower);
  for (const v of voters) await vaultSend(circle, v, "voteLoan", [id, true]);
}
