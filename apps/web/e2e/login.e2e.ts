import { expect, test } from "@playwright/test";

import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";

test.describe("sign in", () => {
  test("S-E2E-08 a wallet page sends you to sign in and back to where you were", async ({
    page,
  }) => {
    await installFakeCore(page, ACCOUNTS.alice);
    await page.goto("/app/new/");
    await page.waitForURL(/\/login\/\?next=%2Fapp%2Fnew%2F/);
    await expect(page.getByRole("heading", { name: "Sign in with Core" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Connect Core" }).click();
    await page.waitForURL(/\/app\/new\/$/);
    await expect(page.getByRole("heading", { name: "Start a circle" })).toBeVisible();
  });

  test("S-E2E-09 without Core installed, sign-in offers the download", async ({ page }) => {
    await page.goto("/login/");
    await expect(page.getByRole("link", { name: "Get Core wallet" })).toBeVisible();
  });

  test("S-E2E-10 a crafted next link can't send you off the app", async ({ page }) => {
    await installFakeCore(page, ACCOUNTS.bob);
    await page.goto("/login/?next=https%3A%2F%2Fevil.example");
    await page.getByRole("button", { name: "Connect Core" }).click();
    await page.waitForURL(/\/app\/$/);
  });

  test("S-E2E-13 the sign-in page fits one screen without scrolling, and Back goes home", async ({
    page,
  }) => {
    // A small phone, a laptop and a desktop.
    for (const size of [
      { width: 375, height: 667 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/login/");
      await expect(page.getByRole("heading", { name: "Sign in with Core" })).toBeVisible();
      const { scroll, view } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollHeight,
        view: window.innerHeight,
      }));
      expect(scroll, `${size.width}x${size.height}`).toBeLessThanOrEqual(view);
      await expect(page.getByRole("link", { name: "Get Core wallet" })).toBeInViewport();
    }

    // Opened directly, Back has no page on this site to return to, so it goes home.
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(/\/$/);
  });
});
