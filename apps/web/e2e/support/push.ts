import { createServer, type Server } from "node:http";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

import type { Page } from "@playwright/test";

/**
 * Reminders in E2E (ADR 0052). Headless Chromium has no real push service, so the browser side
 * is mocked (notification permission and `PushManager.subscribe`), and the local indexer sends to
 * a fake push service on 127.0.0.1 that this file runs. The keys are real P-256 keys, so the
 * Worker's checks and encryption run exactly as in production.
 */

export interface FakePushService {
  /** Base URL, e.g. http://127.0.0.1:53211 */
  url: string;
  requests: Array<{
    path: string;
    headers: Record<string, string | string[] | undefined>;
    size: number;
  }>;
  /** Status the next pushes get (201 = delivered, 410 = device gone). */
  status: number;
  close: () => Promise<void>;
}

export async function startFakePushService(): Promise<FakePushService> {
  const svc = { requests: [], status: 201 } as unknown as FakePushService;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      svc.requests.push({
        path: req.url ?? "",
        headers: req.headers,
        size: Buffer.concat(chunks).length,
      });
      res.writeHead(svc.status);
      res.end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  svc.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  svc.close = () => new Promise<void>((ok) => server.close(() => ok()));
  return svc;
}

/** A device's push keys, as `PushSubscription.toJSON().keys` gives them. */
export function deviceKeys() {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x!, "base64url"),
    Buffer.from(jwk.y!, "base64url"),
  ]);
  return { p256dh: raw.toString("base64url"), auth: randomBytes(16).toString("base64url") };
}

export interface FakePushOptions {
  endpoint: string;
  /** What `Notification.permission` starts as. */
  permission?: NotificationPermission;
  /** What the permission prompt answers. */
  answer?: NotificationPermission;
  /** false = a browser without Web Push. */
  supported?: boolean;
}

/** Mocks the browser's notification and push APIs before any page script runs. */
export async function installFakePush(page: Page, opts: FakePushOptions) {
  const keys = deviceKeys();
  await page.addInitScript(
    ({ endpoint, permission, answer, supported, keys }) => {
      if (!supported) {
        // @ts-expect-error test-only removal
        delete window.PushManager;
        return;
      }
      // Survives reloads, like a real site permission and subscription.
      let state =
        (localStorage.getItem("e2e:notify") as NotificationPermission | null) ?? permission;
      Object.defineProperty(Notification, "permission", { get: () => state, configurable: true });
      Notification.requestPermission = async () => {
        state = answer;
        localStorage.setItem("e2e:notify", state);
        return state;
      };
      let current: PushSubscription | null = null;
      const make = () =>
        ({
          endpoint,
          expirationTime: null,
          options: {},
          getKey: () => null,
          toJSON: () => ({ endpoint, expirationTime: null, keys }),
          unsubscribe: async () => {
            current = null;
            localStorage.removeItem("e2e:subscribed");
            return true;
          },
        }) as unknown as PushSubscription;
      if (localStorage.getItem("e2e:subscribed") === "1") current = make();
      PushManager.prototype.subscribe = async function () {
        current = make();
        localStorage.setItem("e2e:subscribed", "1");
        return current;
      };
      PushManager.prototype.getSubscription = async function () {
        return current;
      };
    },
    {
      endpoint: opts.endpoint,
      permission: opts.permission ?? "default",
      answer: opts.answer ?? "granted",
      supported: opts.supported ?? true,
      keys,
    },
  );
}
