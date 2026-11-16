import { expect, test, type Page } from "@playwright/test";

const SECTIONS = [
  "how-it-works",
  "one-month",
  "what-you-can-do",
  "safety",
  "who-its-for",
  "questions",
  "start",
];

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test.describe("landing page", () => {
  test("S-LAND-01 loads with one h1, every section, and stays indexable", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("Save together.");
    for (const id of SECTIONS) await expect(page.locator(`section#${id}`), id).toHaveCount(1);
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.join(" ")).toContain("SoftwareApplication");
    // Motion starts after idle and the page is scrolled end to end without errors.
    await expect(page.locator("[data-landing]")).toHaveAttribute("data-motion", "on");
    await page.mouse.wheel(0, 20_000);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test("S-LAND-02 the hero call to action opens sign-in", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("cta-open-app").first().click();
    await expect(page).toHaveURL(/\/login\/?$/);
  });

  test("S-LAND-03 footer links reach every public page", async ({ page }) => {
    for (const path of ["/how-it-works/", "/faq/", "/rules/", "/security/"]) {
      await page.goto("/");
      const footer = page.getByRole("navigation", { name: "Footer" });
      await footer.locator(`a[href="${path}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator("h1")).toBeVisible();
    }
  });

  test("S-LAND-04 no sideways scroll on a 360px phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await expect(page.locator("[data-landing]")).toHaveAttribute("data-motion", "on");
    for (const y of [0, 2000, 4000, 6000, 9000, 20_000]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      const wide = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(wide, `at ${y}px`).toBeLessThanOrEqual(0);
    }
  });

  test("S-LAND-05 reduced motion shows everything still, with no motion layer", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(1500);
    await expect(page.locator("[data-landing]")).not.toHaveAttribute("data-motion", "on");
    // Every reveal target and all four month steps are fully visible, untransformed.
    const hidden = await page.$$eval(
      "[data-reveal], [data-step]",
      (els) =>
        els.filter((el) => {
          const s = getComputedStyle(el);
          return s.opacity !== "1" || s.visibility === "hidden" || s.transform !== "none";
        }).length,
    );
    expect(hidden).toBe(0);
    await expect(page.locator("[data-step]")).toHaveCount(4);
    // The diagram shows the end of the story; the hero has no entrance animation.
    await expect(page.locator("[data-tally-text]")).toHaveText("3 of 4 said yes");
    const anim = await page.locator("h1").evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("none");
    expect(errors).toEqual([]);
  });

  test("S-LAND-06 scrolling the month scene plays the story in order", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("[data-landing]")).toHaveAttribute("data-motion", "on");
    const track = page.locator("[data-month-track]");
    const box = await track.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    expect(box.height).toBeGreaterThan(800 * 2);
    const active = () => page.locator("[data-step][data-active]").getAttribute("data-step");
    await page.evaluate((y) => window.scrollTo(0, y), box.top + 10);
    await expect.poll(active).toBe("0");
    await page.evaluate((y) => window.scrollTo(0, y), box.top + (box.height - 800) * 0.97);
    await expect.poll(active).toBe("3");
    await expect(page.locator("[data-tally-text]")).toHaveText("3 of 4 said yes");
  });
});
