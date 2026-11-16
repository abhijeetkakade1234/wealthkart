import { expect, test } from "@playwright/test";

/** Legal pages (ADR 0055): privacy, terms, risks. Scenario IDs in docs/testing.md (S-LEGAL). */
const LEGAL = [
  { path: "/privacy/", h1: /very little/, md: "/privacy.md" },
  { path: "/terms/", h1: /Terms of use/, md: "/terms.md" },
  { path: "/risks/", h1: /What can go wrong/, md: "/risks.md" },
] as const;

test.describe("legal pages", () => {
  test("S-LEGAL-05 each page renders with one h1, the draft note, a date, and stays indexable", async ({
    page,
    request,
  }) => {
    for (const l of LEGAL) {
      const res = await page.goto(l.path);
      expect(res?.status(), l.path).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(l.h1);
      await expect(page.getByRole("note")).toContainText("Draft, pending legal review");
      await expect(page.getByText(/^Updated \d{1,2} \w+ \d{4}$/)).toBeVisible();
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${l.path}$`),
      );
      const md = await request.get(l.md);
      expect(md.status(), l.md).toBe(200);
      expect(await md.text()).toContain("Draft, pending legal review");
    }
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const l of LEGAL) expect(sitemap).toContain(l.path);
    expect(await (await request.get("/llms.txt")).text()).toContain("## Legal");
  });

  test("S-LEGAL-06 the footer's legal links reach each page from home and from a help page", async ({
    page,
  }) => {
    for (const start of ["/", "/faq/"]) {
      for (const l of LEGAL) {
        await page.goto(start);
        await page
          .getByRole("navigation", { name: "Legal" })
          .locator(`a[href="${l.path}"]`)
          .click();
        await expect(page).toHaveURL(new RegExp(`${l.path}$`));
        await expect(page.locator("h1")).toHaveText(l.h1);
      }
    }
  });

  test("S-LEGAL-07 the sign-in page says connecting means agreeing, with working links", async ({
    page,
  }) => {
    await page.goto("/login/");
    const line = page.getByTestId("login-agreement");
    await expect(line).toContainText("By connecting you agree to the Terms");
    await expect(line).toContainText("have read the Risks");
    await line.getByRole("link", { name: "Terms" }).click();
    await expect(page).toHaveURL(/\/terms\/$/);
    await page.goto("/login/");
    await page.getByTestId("login-agreement").getByRole("link", { name: "Risks" }).click();
    await expect(page).toHaveURL(/\/risks\/$/);
    await page.goto("/login/");
    await page.getByTestId("login-agreement").getByRole("link", { name: "Privacy policy" }).click();
    await expect(page).toHaveURL(/\/privacy\/$/);
  });

  test("S-LEGAL-08 no sideways scroll on a 360px phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const l of LEGAL) {
      await page.goto(l.path);
      for (const y of [0, 1500, 3000, 6000, 20_000]) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        const wide = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(wide, `${l.path} at ${y}px`).toBeLessThanOrEqual(0);
      }
    }
  });
});
