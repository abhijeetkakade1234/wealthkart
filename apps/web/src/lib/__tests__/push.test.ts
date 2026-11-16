import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseSiweMessage } from "viem/siwe";
import { describe, expect, it } from "vitest";

import {
  ALL_KINDS,
  type BrowserFacts,
  endpointId,
  hasKind,
  KIND,
  KIND_ROWS,
  keyBytes,
  pushSupport,
  signInMessage,
  STATEMENT,
  toggleKind,
} from "@/lib/push";
import { reminderError } from "@/lib/use-reminders";
import { PushApiError } from "@/lib/push";
import { messages } from "@/lib/messages";

const chrome: BrowserFacts = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0",
  maxTouchPoints: 0,
  standalone: false,
};
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15";

const workerAuth = readFileSync(
  resolve(process.cwd(), "../../workers/indexer/src/push/auth.ts"),
  "utf8",
);
const workerKinds = readFileSync(
  resolve(process.cwd(), "../../workers/indexer/src/push/kinds.ts"),
  "utf8",
);

describe("reminders in the app (ADR 0052)", () => {
  it("S-REM-40 browser support: ready, unsupported, and iPhone/iPad outside the Home Screen", () => {
    expect(pushSupport(chrome)).toBe("ready");
    expect(pushSupport({ ...chrome, hasPushManager: false })).toBe("unsupported");
    expect(pushSupport({ ...chrome, hasServiceWorker: false })).toBe("unsupported");
    expect(pushSupport({ ...chrome, userAgent: iphone })).toBe("ios-install");
    expect(pushSupport({ ...chrome, userAgent: iphone, standalone: true })).toBe("ready");
    // iPadOS says "Macintosh" but has touch.
    expect(pushSupport({ ...chrome, userAgent: ipad, maxTouchPoints: 5 })).toBe("ios-install");
    expect(pushSupport({ ...chrome, userAgent: ipad, maxTouchPoints: 0 })).toBe("ready");
    // Old iOS home-screen app without push.
    expect(
      pushSupport({ ...chrome, userAgent: iphone, standalone: true, hasPushManager: false }),
    ).toBe("unsupported");
  });

  it("S-REM-41 kinds match the Worker's bitmask; switches flip one kind each", () => {
    for (const [k, v] of Object.entries(KIND)) expect(workerKinds).toContain(`${k}: ${v},`);
    expect(ALL_KINDS).toBe(Object.values(KIND).reduce((a, b) => a | b, 0));
    expect(KIND_ROWS.map((r) => r.kind)).toEqual(Object.keys(KIND));
    let k = 0;
    k = toggleKind(k, "votes", true);
    expect(hasKind(k, "votes")).toBe(true);
    expect(hasKind(k, "due")).toBe(false);
    k = toggleKind(ALL_KINDS, "late", false);
    expect(k).toBe(ALL_KINDS - KIND.late);
  });

  it("S-REM-42 the signed message is standard SIWE with this site, the action and this device", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    const now = new Date("2026-12-01T10:00:00Z");
    const msg = await signInMessage({
      address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      action: "on",
      endpoint,
      chainId: 43113,
      origin: "https://wealthkart.pages.dev",
      now,
    });
    const m = parseSiweMessage(msg);
    expect(m.domain).toBe("wealthkart.pages.dev");
    expect(m.uri).toBe("https://wealthkart.pages.dev/app/settings/");
    expect(m.statement).toBe(STATEMENT.on);
    expect(m.chainId).toBe(43113);
    expect(m.requestId).toBe(`push-on:${await endpointId(endpoint)}`);
    expect(m.expirationTime!.getTime() - now.getTime()).toBe(5 * 60_000);
    expect(m.nonce).toMatch(/^[A-Za-z0-9]{16,64}$/);
    // Word for word what the Worker expects.
    expect(workerAuth).toContain(STATEMENT.on);
    expect(workerAuth).toContain(STATEMENT.off);
    // Local dev keeps the port in the domain.
    const local = parseSiweMessage(
      await signInMessage({
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        action: "off",
        endpoint,
        chainId: 43113,
        origin: "http://127.0.0.1:4310",
      }),
    );
    expect(local.domain).toBe("127.0.0.1:4310");
  });

  it("S-REM-43 VAPID key bytes and plain error messages", () => {
    expect(keyBytes("BAEC").length).toBe(3);
    expect([...keyBytes("_-8")]).toEqual([255, 239]);
    expect(reminderError(new PushApiError(429, "x"))).toBe(messages.remindersBusy());
    expect(reminderError(new PushApiError(0, "network"))).toBe(messages.remindersFailed());
    expect(reminderError(new PushApiError(404, "x"))).toBe(messages.remindersCircleUnknown());
    expect(reminderError({ code: 4001 })).toBe(messages.userRejected());
    expect(reminderError(Object.assign(new Error("x"), { name: "NotAllowedError" }))).toBe(
      messages.remindersDenied(),
    );
  });
});

describe("S-REM-44 service worker notifications", () => {
  const src = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  const O = "https://wealthkart.pages.dev";
  const sw = new Function("self", "caches", `${src}; return { notificationFrom, safeAppPath };`)(
    { addEventListener: () => {}, location: { origin: O } },
    {},
  ) as {
    notificationFrom: (d: unknown) => {
      title: string;
      options: { body: string; tag?: string; data: { url: string } };
    };
    safeAppPath: (u: unknown) => string;
  };

  it("opens only app pages on this site", () => {
    expect(sw.safeAppPath("/app/circle/pay/?id=0xabc")).toBe("/app/circle/pay/?id=0xabc");
    expect(sw.safeAppPath(`${O}/app/circle/?id=0x1`)).toBe("/app/circle/?id=0x1");
    for (const bad of [
      "https://evil.example/app/",
      "//evil.example/app/",
      "javascript:alert(1)",
      "/",
      null,
    ]) {
      expect(sw.safeAppPath(bad)).toBe("/app/");
    }
  });

  it("adds the deadline in device time and falls back safely on odd data", () => {
    const n = sw.notificationFrom({
      title: "Sunday Savers",
      body: "Due today, by 10 Dec 23:59 UTC.",
      url: "/app/circle/pay/?id=0x1",
      tag: "0x1:due",
      at: Date.parse("2026-12-10T23:59:59Z") / 1000,
    });
    expect(n.title).toBe("Sunday Savers");
    expect(n.options.body).toMatch(/^Due today, by 10 Dec 23:59 UTC\. Your time: .+\.$/);
    expect(n.options.tag).toBe("0x1:due");
    expect(n.options.data.url).toBe("/app/circle/pay/?id=0x1");
    const odd = sw.notificationFrom("not an object");
    expect(odd.title).toBe("WealthKart");
    expect(odd.options.data.url).toBe("/app/");
  });
});
