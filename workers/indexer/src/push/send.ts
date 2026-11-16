import { buildPushPayload } from "@block65/webcrypto-web-push";

import { sha256Hex } from "./auth";

/**
 * Sends one Web Push message (RFC 8030) with VAPID (RFC 8292) and aes128gcm encryption
 * (RFC 8291), using WebCrypto through `@block65/webcrypto-web-push` (pinned, no Node APIs).
 */

export interface Vapid {
  /** Uncompressed P-256 public key, base64url (65 bytes). Public; the app has it too. */
  publicKey: string;
  /** Private scalar `d`, base64url. A Worker secret, never in the repo. */
  privateKey: string;
  /** Contact for push services: a URL, so no email address is needed (RFC 8292 §2.1). */
  subject: string;
}

export interface Device {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** What the service worker reads (`apps/web/public/sw.js`). Keep it small: < 3 KB. */
export interface PushData {
  title: string;
  body: string;
  /** Same-origin app path, e.g. `/app/circle/pay/?id=0x…`. */
  url: string;
  /** Replaces an earlier notification with the same tag. */
  tag: string;
  /** A deadline in unix seconds; the device adds it in local time (ADR 0014). */
  at?: number;
}

export type SendResult = "sent" | "gone" | "failed";

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** One day: a reminder that can't be delivered within a day is no longer useful. */
const TTL_SEC = 86_400;

export async function sendPush(
  device: Device,
  data: PushData,
  vapid: Vapid,
  fetcher: Fetcher = fetch,
): Promise<SendResult> {
  let payload: Awaited<ReturnType<typeof buildPushPayload>>;
  try {
    payload = await buildPushPayload(
      {
        data: data as unknown as Record<string, string | number>,
        // RFC 8030 topic: at most 32 base64url characters; a newer message with the same topic
        // replaces one the device hasn't received yet.
        options: {
          ttl: TTL_SEC,
          urgency: "normal",
          topic: (await sha256Hex(data.tag)).slice(0, 32),
        },
      },
      {
        endpoint: headerEndpoint(device.endpoint),
        expirationTime: null,
        keys: { p256dh: device.p256dh, auth: device.auth },
      },
      vapid,
    );
  } catch {
    // Drop the device only when its own key is broken (checked at subscribe time, so rare).
    // A bad VAPID key on our side must never delete everyone's subscriptions.
    return (await usableKey(device.p256dh)) ? "failed" : "gone";
  }
  try {
    const res = await fetcher(device.endpoint, {
      method: "POST",
      headers: payload.headers,
      body: payload.body,
      // A push service never redirects; following one could reach any URL.
      redirect: "manual",
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    // Network trouble: try again on a later run.
    return "failed";
  }
}

/**
 * The library builds the VAPID audience only from https endpoints. A local fake push service
 * (E2E only; `validate.ts` never accepts http otherwise) is signed as its https twin.
 */
function headerEndpoint(endpoint: string): string {
  return /^http:\/\/(127\.0\.0\.1|localhost):/.test(endpoint)
    ? endpoint.replace(/^http:/, "https:")
    : endpoint;
}

/** True when `p256dh` is a real P-256 point, so encryption will work later. */
export async function usableKey(p256dh: string): Promise<boolean> {
  try {
    const b64 = p256dh.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    const raw = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    await crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return true;
  } catch {
    return false;
  }
}
