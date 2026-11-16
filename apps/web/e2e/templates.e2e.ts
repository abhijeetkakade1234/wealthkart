import { expect, test } from "@playwright/test";
import { type Address, decodeFunctionResult, encodeFunctionData, parseEther } from "viem";

// The SDK package is ESM-only and Playwright loads tests as CommonJS, so read the ABI source.
import { circleVaultAbi } from "../../../packages/sdk/src/abi/CircleVault";
import { call } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";

/** Reads a no-argument view of the vault straight from the chain. */
async function view(
  circle: Address,
  functionName: "installment" | "fee1" | "holidaysPerYear" | "quorumPct" | "rules",
): Promise<unknown> {
  // One helper for several views with different return types, so viem's per-name typing is
  // switched off here; each caller checks the value it reads.
  const data = encodeFunctionData({ abi: circleVaultAbi, functionName } as never);
  return decodeFunctionResult({
    abi: circleVaultAbi,
    functionName,
    data: (await call(circle, data)) as `0x${string}`,
  } as never);
}

test.describe("circle templates (ADR 0054)", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeCore(page, ACCOUNTS.alice);
    await page.goto("/app/new/");
    await page.getByRole("button", { name: "Connect Core" }).first().click();
    await page.waitForURL("**/app/new/");
    await expect(page.getByLabel("Circle name")).toBeVisible();
  });

  test("S-TPL-04 Friends is picked first and matches today's defaults", async ({ page }) => {
    await expect(page.getByRole("radio", { name: "Friends" })).toBeChecked();
    await expect(page.getByLabel("Amount each month (AVAX)")).toHaveValue("0.5");
    await expect(page.getByLabel("Payment holidays per year")).toHaveValue("3");
    await expect(page.getByTestId("template-summary")).toContainText("What Friends means");
    await expect(page.getByTestId("template-summary")).toContainText(
      "Late fee after the due day: 0.01 AVAX (2% of the monthly amount)",
    );
  });

  test("S-TPL-05 pick Family, see the fields filled in, change one, create the circle", async ({
    page,
  }) => {
    await page.getByTestId("template-family").click();
    await expect(page.getByRole("radio", { name: "Family" })).toBeChecked();

    // Every rule field takes the Family values.
    await expect(page.getByLabel("Amount each month (AVAX)")).toHaveValue("0.25");
    await expect(page.getByLabel("Late fee after the due day (AVAX)")).toHaveValue("0.0025");
    await expect(page.getByLabel("Second fee starts after day")).toHaveValue("25");
    await expect(page.getByLabel("Payment holidays per year")).toHaveValue("6");
    await expect(page.getByLabel("Missed months before a dormant vote")).toHaveValue("6");
    await expect(page.getByLabel("Loan interest per month (%)")).toHaveValue("0.5");
    await expect(page.getByLabel("Loan limit vs savings")).toHaveValue("3");
    await expect(page.getByLabel("Notice to leave (days)")).toHaveValue("60");
    await expect(page.getByLabel("Most members the circle can have")).toHaveValue("10");
    const summary = page.getByTestId("template-summary");
    await expect(summary).toContainText("What Family means");
    await expect(summary).toContainText("0.0025 AVAX (1% of the monthly amount)");
    await expect(summary).toContainText("6 payment holidays a year");
    await expect(page.getByTestId("template-changed")).toHaveCount(0);

    // Still editable: one change, and the summary says so.
    await page.getByLabel("Payment holidays per year").fill("4");
    await expect(page.getByTestId("template-changed")).toHaveText("You changed 1 setting");

    const name = `Family Tpl ${Date.now() % 100000}`;
    await page.getByLabel("Circle name").fill(name);
    await page.getByRole("button", { name: "Create circle" }).click();
    await page.waitForURL(/\/app\/circle\/\?id=0x[0-9a-fA-F]{40}/);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // The chain holds the template's values plus the one edit.
    const circle = new URL(page.url()).searchParams.get("id") as Address;
    expect(await view(circle, "installment")).toBe(parseEther("0.25"));
    expect(await view(circle, "fee1")).toBe(parseEther("0.0025"));
    expect(Number(await view(circle, "holidaysPerYear"))).toBe(4);
    expect(Number(await view(circle, "quorumPct"))).toBe(50);
    const rules = (await view(circle, "rules")) as {
      interestBps: number;
      kMultiplier: number;
      exitNoticeDays: number;
      guarantorRequired: boolean;
    };
    expect(Number(rules.interestBps)).toBe(50);
    expect(Number(rules.kMultiplier)).toBe(3);
    expect(Number(rules.exitNoticeDays)).toBe(60);
    expect(rules.guarantorRequired).toBe(false);
  });

  test("S-TPL-06 Office asks for guarantors; a cap you typed survives switching", async ({
    page,
  }) => {
    await page.getByLabel("Most members the circle can have").fill("8");
    await page.getByTestId("template-office").click();
    await expect(page.getByLabel("Every loan needs a guarantor")).toBeChecked();
    await expect(page.getByLabel("Voters who must take part (%)")).toHaveValue("66");
    await expect(page.getByLabel("Most members the circle can have")).toHaveValue("8");
    await expect(page.getByTestId("template-summary")).toContainText(
      "Every loan needs a guarantor.",
    );
    // Out-of-bounds edits are caught before anything is sent.
    await page.getByLabel("Voters who must take part (%)").fill("10");
    await page.getByLabel("Circle name").fill("Office Bound Check");
    await page.getByRole("button", { name: "Create circle" }).click();
    await expect(page.getByText("Pick 20 to 100.")).toBeVisible();
    await expect(page).toHaveURL(/\/app\/new\/$/);
  });
});
