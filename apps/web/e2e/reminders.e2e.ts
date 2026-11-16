import { type Browser, expect, type Page, test } from "@playwright/test";

import { ACCOUNTS } from "./support/env";
import { installFakeCore } from "./support/fake-core";
import {
  type FakePushOptions,
  type FakePushService,
  installFakePush,
  startFakePushService,
} from "./support/push";
import { createCircle } from "./support/vault";

/**
 * Reminders (Phase 4, ADR 0052). The browser's permission prompt and push subscription are
 * mocked; everything after that is real: Core signs the message on anvil, the local indexer
 * Worker checks it, stores the device, and sends an encrypted test push to a fake push service.
 */
test.describe.configure({ mode: "serial" });

let push: FakePushService;
let circle = "";
let seq = 0;

test.beforeAll(async () => {
  push = await startFakePushService();
});
test.afterAll(async () => {
  await push?.close();
});

/** A fresh phone with the wallet connected and the browser's push APIs mocked. */
async function phone(
  browser: Browser,
  account: string,
  opts: Partial<FakePushOptions> = {},
  contextOpts: Parameters<Browser["newContext"]>[0] = {},
): Promise<Page> {
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  await installFakeCore(page, account);
  seq += 1;
  await installFakePush(page, { endpoint: `${push.url}/push/device-${seq}`, ...opts });
  await page.goto("/app/");
  await page.getByRole("button", { name: "Connect Core" }).first().click();
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  return page;
}

const deviceCard = (page: Page) => page.getByRole("region", { name: "Reminders on this device" });
const circleCard = (page: Page) => page.getByRole("region", { name: "Reminders for this circle" });

test.describe("reminders", () => {
  test("S-E2E-33 turn reminders on from Settings with one signature, choose per circle, send a test, turn off", async ({
    browser,
  }) => {
    const fay = await phone(browser, ACCOUNTS.fay);
    circle = await createCircle(fay, { name: `Reminders E2E ${Date.now() % 100000}` });

    await fay.getByRole("link", { name: "Settings" }).first().click();
    await expect(fay.getByRole("heading", { name: "Settings" })).toBeVisible();
    const card = deviceCard(fay);
    await expect(card.getByText("Signing is free and moves no money")).toBeVisible();
    await card.getByRole("button", { name: "Turn on reminders" }).click();
    await expect(fay.getByText("Reminders are on for this device.")).toBeVisible();
    await expect(card.getByTestId("reminders-on")).toContainText("0x14dC…9955");

    // The new circle is switched on; switching it off sticks after a reload.
    const name = new RegExp("^Reminders E2E");
    const row = fay.getByRole("switch", { name });
    await expect(row).toHaveAttribute("aria-checked", "true");
    await expect(fay.getByText("All reminders on")).toBeVisible();
    await row.click();
    await expect(row).toHaveAttribute("aria-checked", "false");
    await fay.reload();
    await expect(fay.getByRole("switch", { name })).toHaveAttribute("aria-checked", "false");
    await fay.getByRole("switch", { name }).click();
    await expect(fay.getByRole("switch", { name })).toHaveAttribute("aria-checked", "true");

    // A test push reaches the push service, encrypted and signed with VAPID.
    const before = push.requests.length;
    await deviceCard(fay).getByRole("button", { name: "Send a test" }).click();
    await expect(fay.getByText(/Test sent/)).toBeVisible();
    expect(push.requests.length).toBe(before + 1);
    const sent = push.requests.at(-1)!;
    expect(sent.headers["content-encoding"]).toBe("aes128gcm");
    expect(String(sent.headers.authorization)).toMatch(/^vapid t=.+, k=.+/);
    expect(sent.size).toBeGreaterThan(100);

    await deviceCard(fay).getByRole("button", { name: "Turn off on this device" }).click();
    await expect(fay.getByText("Reminders are off for this device.")).toBeVisible();
    await expect(deviceCard(fay).getByRole("button", { name: "Turn on reminders" })).toBeVisible();
  });

  test("S-E2E-34 the circle page turns reminders on for that circle and keeps each switch", async ({
    browser,
  }) => {
    const fay = await phone(browser, ACCOUNTS.fay);
    await fay.goto(`/app/circle/?id=${circle}`);
    const card = circleCard(fay);
    await card.getByRole("button", { name: "Turn on reminders" }).click();
    const votes = card.getByRole("switch", { name: "Votes waiting for you" });
    await expect(votes).toHaveAttribute("aria-checked", "true");
    await expect(card.getByText("All on for this circle.")).toBeVisible();
    await votes.click();
    await expect(votes).toHaveAttribute("aria-checked", "false");
    await expect(card.getByText("Some on for this circle.")).toBeVisible();
    await fay.reload();
    await expect(
      circleCard(fay).getByRole("switch", { name: "Votes waiting for you" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(circleCard(fay).getByRole("switch", { name: "Installment due" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(
      circleCard(fay).getByRole("link", { name: "All reminder settings" }),
    ).toBeVisible();
  });

  test("S-E2E-35 blocked notifications, a browser without push and iPhone Safari each explain what to do", async ({
    browser,
  }) => {
    const denied = await phone(browser, ACCOUNTS.bob, { permission: "denied" });
    await denied.goto("/app/settings/");
    await expect(
      deviceCard(denied).getByText("Notifications are blocked", { exact: true }),
    ).toBeVisible();
    await expect(deviceCard(denied).getByRole("button", { name: /Turn on/ })).toHaveCount(0);

    const old = await phone(browser, ACCOUNTS.bob, { supported: false });
    await old.goto("/app/settings/");
    await expect(deviceCard(old).getByText(/This browser can't show reminders/)).toBeVisible();

    const iphone = await phone(
      browser,
      ACCOUNTS.bob,
      {},
      {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      },
    );
    await iphone.goto("/app/settings/");
    await expect(deviceCard(iphone).getByText("Add WealthKart to your Home Screen")).toBeVisible();

    // Saying no at the browser's prompt leaves reminders off and says why.
    const no = await phone(browser, ACCOUNTS.bob, { answer: "denied" });
    await no.goto("/app/settings/");
    await deviceCard(no).getByRole("button", { name: "Turn on reminders" }).click();
    await expect(no.getByText(/Notifications are blocked for this site/).first()).toBeVisible();
  });

  test("S-E2E-36 a device the push service no longer knows is turned off with a plain note", async ({
    browser,
  }) => {
    const carol = await phone(browser, ACCOUNTS.carol);
    await carol.goto("/app/settings/");
    await deviceCard(carol).getByRole("button", { name: "Turn on reminders" }).click();
    await expect(deviceCard(carol).getByTestId("reminders-on")).toBeVisible();
    push.status = 410;
    try {
      await deviceCard(carol).getByRole("button", { name: "Send a test" }).click();
      await expect(carol.getByText(/This device stopped accepting reminders/)).toBeVisible();
    } finally {
      push.status = 201;
    }
    await carol.reload();
    await expect(
      deviceCard(carol).getByRole("button", { name: "Turn on reminders" }),
    ).toBeVisible();
  });
});
