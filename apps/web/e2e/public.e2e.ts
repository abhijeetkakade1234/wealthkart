import { expect, test } from "@playwright/test";

test.describe("public site", () => {
  test("S-E2E-01 public pages load and stay indexable (S-WEB-18)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/WealthKart/);
    for (const path of ["/how-it-works/", "/rules/", "/security/", "/faq/"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    }
  });

  test("S-E2E-01 app pages are noindex and robots.txt blocks them (S-WEB-19)", async ({
    page,
    request,
  }) => {
    await page.goto("/app/");
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /app/");
    expect((await request.get("/llms.txt")).status()).toBe(200);
  });
});
