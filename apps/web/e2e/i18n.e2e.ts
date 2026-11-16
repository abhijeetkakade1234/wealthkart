import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, type Page, test } from "@playwright/test";

import { hi } from "../src/i18n/hi";
import { mr } from "../src/i18n/mr";
import { warpToNextMonth } from "./support/chain";
import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";

/**
 * Hindi and Marathi (ADR 0057). Selectors come from the dictionaries, so a wording fix by a
 * reviewer doesn't break these tests. Set I18N_SHOTS=<folder> to also save screenshots at
 * 360px and 1440px of every checked screen.
 */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const before = (text: string, param: string) => text.split(param)[0];

type Dict = typeof hi;
const DICTS = { hi, mr } as Record<"hi" | "mr", Dict>;

async function useLocale(page: Page, locale: "en" | "hi" | "mr") {
  await page.addInitScript((l) => {
    try {
      window.localStorage.setItem("wk.locale", l);
    } catch {
      // Storage blocked: the test will fail on the language check.
    }
  }, locale);
}

function connectButton(page: Page, d: Dict) {
  const names = [d.wallet.connectCore, d.kit.accessNoWalletAction].map(esc).join("|");
  return page.getByRole("button", { name: new RegExp(`^(${names})$`) }).first();
}

async function noSidewaysScroll(page: Page) {
  const { overflow, culprits } = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // The deepest elements that stick out, to name the cause in the failure message.
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") return p !== document.body;
      }
      return false;
    };
    const wide = [...document.querySelectorAll("body *")].filter(
      (el) => el.getBoundingClientRect().right > width + 1,
    );
    const describe = (el: Element) =>
      `<${el.tagName.toLowerCase()} pos=${getComputedStyle(el).position} right=${Math.round(
        el.getBoundingClientRect().right,
      )} class="${String(el.className).slice(0, 80)}">${el.textContent?.slice(0, 40)}`;
    const scrollWidth = document.documentElement.scrollWidth;
    // Elements whose right edge is where the page's scroll width ends are the likely cause.
    const atEdge = wide.filter(
      (el) => Math.abs(el.getBoundingClientRect().right - scrollWidth) <= 2,
    );
    const unclipped = wide.filter((el) => !clipped(el));
    const culprits = (atEdge.length ? atEdge : unclipped.length ? unclipped : wide)
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
      .slice(0, 6)
      .map(describe);
    return { overflow: document.documentElement.scrollWidth - width, culprits };
  });
  expect.soft(overflow, [page.url(), ...culprits].join(" | ")).toBeLessThanOrEqual(0);
}

async function shot(page: Page, name: string) {
  const dir = process.env.I18N_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

test.describe.serial("Hindi and Marathi (ADR 0057)", () => {
  let circleUrl = "";

  test("S-I18N-20 switching to Hindi on the app home translates the nav and the empty state", async ({
    page,
  }) => {
    // Frank has no circle, so his home shows the empty state.
    await installFakeCore(page, ACCOUNTS.frank);
    await page.goto("/app/");
    await page.getByRole("button", { name: "Connect Core" }).first().click();
    await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();

    await page.getByTestId("language-menu").selectOption("hi");
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(page.getByText(hi.nav.languageChanged)).toBeVisible();
    await expect(page.getByRole("heading", { name: hi.home.title })).toBeVisible();
    const nav = page.getByRole("navigation", { name: hi.nav.main }).first();
    for (const label of [hi.nav.home, hi.nav.settings]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(page.getByText(hi.home.empty)).toBeVisible();
  });

  test("S-I18N-21 the language survives a reload and can be changed back in Settings", async ({
    page,
  }) => {
    await installFakeCore(page, ACCOUNTS.frank);
    await page.goto("/app/");
    await page.getByRole("button", { name: "Connect Core" }).first().click();
    await page.getByTestId("language-menu").selectOption("hi");
    await expect(page.getByRole("heading", { name: hi.home.title })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(page.getByRole("heading", { name: hi.home.title })).toBeVisible();

    await page.goto("/app/settings/");
    const card = page.getByTestId("language-card");
    await expect(card.getByRole("radio", { name: "हिन्दी" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await card.getByRole("radio", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeVisible();
  });

  test("S-I18N-22 start a circle and pay, all in Marathi", async ({ page }) => {
    await useLocale(page, "mr");
    await installFakeCore(page, ACCOUNTS.alice);
    const name = `Marathi ${Date.now() % 100000}`;
    await page.goto("/app/new/");
    await connectButton(page, mr).click();
    await page.waitForURL("**/app/new/");
    await expect(page.locator("html")).toHaveAttribute("lang", "mr");
    await page.getByLabel(mr.create.field.name).fill(name);
    await page.getByRole("button", { name: mr.create.submit }).click();

    await page.waitForURL(/\/app\/circle\/\?id=0x[0-9a-fA-F]{40}/);
    circleUrl = page.url();
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page
      .getByRole("navigation", { name: mr.nav.main })
      .first()
      .getByRole("link", { name: mr.nav.pay })
      .click();
    await page.waitForURL(/\/app\/circle\/pay\/\?id=/);
    await warpToNextMonth();
    await page.reload();
    // Same reconnect retry as S-E2E-03.
    // Marathi puts the verb last: "0.50 AVAX भरा".
    const pay = new RegExp(`^[0-9].* AVAX ${esc(mr.pay.payVerb)}$`);
    await expect(async () => {
      const button = page.getByRole("button", { name: pay });
      if (await button.isVisible()) await button.click();
      await expect(page.getByText(before(mr.pay.allPaid, "{month}"))).toBeVisible({
        timeout: 4000,
      });
    }).toPass({ timeout: 20_000 });
  });

  test("S-I18N-23 localized public pages render in their language with hreflang links", async ({
    page,
  }) => {
    for (const [path, lang] of [
      ["/hi/", "hi"],
      ["/mr/", "mr"],
      ["/hi/start/", "hi"],
      ["/mr/start/", "mr"],
      ["/hi/how-it-works/", "hi"],
      ["/mr/how-it-works/", "mr"],
    ] as const) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("h1")).toBeVisible();
      for (const alt of ["en", "hi", "mr", "x-default"]) {
        await expect(page.locator(`link[rel="alternate"][hreflang="${alt}"]`)).toHaveCount(1);
      }
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new RegExp(`${esc(path)}$`),
      );
    }
    // English pages point at their translations too, and the footer switches language.
    await page.goto("/start/");
    await expect(page.locator('link[rel="alternate"][hreflang="hi"]')).toHaveAttribute(
      "href",
      /\/hi\/start\/$/,
    );
    await page.getByRole("contentinfo").getByRole("link", { name: "मराठी" }).click();
    await expect(page).toHaveURL(/\/mr\/start\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "mr");
    // The localized page remembers the language for the app.
    expect(await page.evaluate(() => window.localStorage.getItem("wk.locale"))).toBe("mr");
  });

  for (const locale of ["hi", "mr"] as const) {
    test(`S-I18N-24 no sideways scroll at 360px in ${locale} on the busiest screens`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const d = DICTS[locale];
      await useLocale(page, locale);
      await installFakeCore(page, ACCOUNTS.alice);
      const id = new URL(circleUrl || "http://x/?id=").searchParams.get("id");
      expect(id, "S-I18N-22 must run first and create a circle").toBeTruthy();
      const appPages: Array<[string, string]> = [
        ["home", "/app/"],
        ["new", "/app/new/"],
        ["circle", `/app/circle/?id=${id}`],
        ["pay", `/app/circle/pay/?id=${id}`],
        ["loans", `/app/circle/loans/?id=${id}`],
        ["votes", `/app/circle/votes/?id=${id}`],
        ["activity", `/app/circle/activity/?id=${id}`],
        ["settings", "/app/settings/"],
      ];
      const publicPages: Array<[string, string]> = [
        ["landing", `/${locale}/`],
        ["start", `/${locale}/start/`],
        ["how-it-works", `/${locale}/how-it-works/`],
        ["login", "/login/"],
      ];

      const check = async (name: string, path: string, width: number) => {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.locator("h1").first()).toBeVisible();
        // Let charts, lists and the dictionary settle before measuring.
        await page.waitForTimeout(1200);
        if (width === 360) await noSidewaysScroll(page);
        await shot(page, `${locale}-${width}-${name}`);
      };
      const sizes = [
        { width: 360, height: 780 },
        { width: 1440, height: 900 },
      ];

      // Signed out first: public pages and the sign-in page.
      for (const size of sizes) {
        await page.setViewportSize(size);
        for (const [name, path] of publicPages) await check(name, path, size.width);
      }

      await page.setViewportSize(sizes[0]);
      await page.goto("/app/");
      await connectButton(page, d).click();
      await expect(page.getByRole("heading", { name: d.home.title })).toBeVisible();
      for (const size of sizes) {
        await page.setViewportSize(size);
        for (const [name, path] of appPages) await check(name, path, size.width);
      }
    });
  }
});
