import { expect, test } from "@playwright/test";

import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";

const STEP_IDS = ["install-core", "create-wallet", "backup-wallet", "get-avax", "get-usdt", "join"];

test.describe("onboarding guide and first-run checklist (ADR 0054)", () => {
  test("S-ONB-04 /start renders every step, is indexable and its links work", async ({
    page,
    request,
  }) => {
    const res = await page.goto("/start/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("New to crypto? Start here");
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/start\/$/);
    for (const id of STEP_IDS) await expect(page.locator(`section#${id}`)).toBeVisible();

    // The phrase warning can't be missed, and E2E builds are on the test network.
    await expect(page.getByRole("note")).toContainText("WealthKart will never ask");
    await expect(page.getByTestId("start-network")).toContainText("Fuji test network");
    await expect(page.getByRole("link", { name: /Fuji faucet/ })).toHaveAttribute(
      "href",
      "https://core.app/tools/testnet-faucet/",
    );
    await expect(page.getByRole("link", { name: /core\.app/ })).toHaveAttribute(
      "href",
      "https://core.app/",
    );

    // HowTo JSON-LD lists every step.
    const ld = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? "{}")));
    const howTo = ld.flat().find((x: { "@type"?: string }) => x["@type"] === "HowTo");
    expect(howTo.step).toHaveLength(STEP_IDS.length);

    // Step chips jump to their section; in-site links open real pages.
    await page.getByRole("navigation", { name: "Steps" }).getByRole("link").nth(3).click();
    await expect(page).toHaveURL(/#get-avax$/);
    await expect(page.locator("section#get-avax")).toBeInViewport();
    await page
      .locator("section#join")
      .getByRole("link", { name: /How a circle works/ })
      .click();
    await expect(page).toHaveURL(/\/how-it-works\/$/);

    // Found by search engines and answer engines.
    expect(await (await request.get("/sitemap.xml")).text()).toContain("/start/");
    expect(await (await request.get("/llms.txt")).text()).toContain("/start.md");
    const md = await request.get("/start.md");
    expect(md.status()).toBe(200);
    expect(await md.text()).toContain(
      "## Step 2: Create a wallet and write down the recovery phrase",
    );
  });

  test("S-ONB-05 the login page, the landing page and the footer link to the guide", async ({
    page,
  }) => {
    await page.goto("/login/");
    await page.getByTestId("login-start-link").click();
    await expect(page).toHaveURL(/\/start\/$/);

    await page.goto("/");
    await page.getByTestId("hero-start-link").click();
    await expect(page).toHaveURL(/\/start\/$/);

    await page.goto("/faq/");
    await page
      .getByRole("navigation", { name: "Footer" })
      .getByRole("link", { name: "Get started" })
      .click();
    await expect(page).toHaveURL(/\/start\/$/);
  });

  test("S-ONB-06 no sideways scrolling on a 360px phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/start/");
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("S-ONB-07 a fresh wallet sees the checklist, ticks an item, and can hide it for good", async ({
    page,
  }) => {
    // Dave has test AVAX but, at this point in the run, no circle.
    await installFakeCore(page, ACCOUNTS.dave);
    await page.goto("/app/");
    await page.getByRole("button", { name: "Connect Core" }).first().click();
    const list = page.getByTestId("first-run-checklist");
    await expect(list).toBeVisible();
    await expect(page.getByTestId("checklist-gas")).toHaveAttribute("data-status", "done");
    await expect(page.getByTestId("checklist-phrase")).toHaveAttribute("data-status", "todo");
    await expect(page.getByTestId("checklist-circle")).not.toHaveAttribute(
      "data-status",
      "checking",
    );

    // Self-reported items tick and stay ticked after a reload.
    await page
      .getByTestId("checklist-phrase")
      .getByRole("button", { name: "I've done this" })
      .click();
    await expect(page.getByTestId("checklist-phrase")).toHaveAttribute("data-status", "done");
    await page.reload();
    await expect(page.getByTestId("checklist-phrase")).toHaveAttribute("data-status", "done");

    // Each open item links to its step in the guide.
    await expect(
      page.getByTestId("checklist-nominee").getByRole("link", { name: /How to/ }),
    ).toHaveAttribute("href", "/start/#backup-wallet");

    await page.getByRole("button", { name: "Hide this checklist" }).click();
    await expect(list).toHaveCount(0);
    await expect(page.getByText("Checklist hidden.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
    await expect(page.getByTestId("first-run-checklist")).toHaveCount(0);
  });
});
