import { type Browser, expect, type Page } from "@playwright/test";
import { decodeFunctionResult, encodeFunctionData, type Address } from "viem";

// The SDK package is ESM-only and Playwright loads tests as CommonJS, so read the ABI source.
import { circleVaultAbi } from "../../../../packages/sdk/src/abi/CircleVault";
import { call, send } from "./chain";
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
