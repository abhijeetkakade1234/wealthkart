/**
 * Input checks for the push API (ADR 0052). Everything a browser sends is treated as hostile:
 * the Worker only ever POSTs to well-known push services over https, so the subscribe API can't
 * be used to make the Worker call arbitrary URLs.
 */

/** Push services of the browsers that support Web Push (host, or a suffix starting with "."). */
export const PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Brave, Opera, Samsung Internet
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari and iOS home-screen apps
  ".push.apple.com",
  ".notify.windows.com", // Edge on Windows (WNS)
];

export const MAX_ENDPOINT = 1024;
export const MAX_BODY = 8 * 1024;

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

function b64urlBytes(s: string): number {
  const clean = s.replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
}

/**
 * Checks a push endpoint: https, a known push service, no credentials, a sane length.
 * `extraOrigins` (E2E only) lets a local fake push service through, e.g. "http://127.0.0.1:".
 */
export function endpointProblem(endpoint: unknown, extraOrigins: string[] = []): string | null {
  if (typeof endpoint !== "string" || endpoint.length === 0) return "Missing push endpoint.";
  if (endpoint.length > MAX_ENDPOINT) return "Push endpoint is too long.";
  if (extraOrigins.some((o) => o && endpoint.startsWith(o))) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "Push endpoint isn't a URL.";
  }
  if (url.protocol !== "https:") return "Push endpoint must use https.";
  if (url.username || url.password) return "Push endpoint can't carry a login.";
  if (url.port && url.port !== "443") return "Push endpoint must use the standard port.";
  const host = url.hostname.toLowerCase();
  const known = PUSH_HOSTS.some((h) =>
    h.startsWith(".") ? host.endsWith(h) && host.length > h.length : host === h,
  );
  if (!known) return "That push service isn't supported.";
  return null;
}

/** Checks the whole subscription: endpoint plus the device's public key (65 B) and secret (16 B). */
export function subscriptionProblem(sub: unknown, extraOrigins: string[] = []): string | null {
  if (!sub || typeof sub !== "object") return "Missing push subscription.";
  const s = sub as Partial<PushSubscriptionInput>;
  const bad = endpointProblem(s.endpoint, extraOrigins);
  if (bad) return bad;
  const k = s.keys;
  if (!k || typeof k !== "object") return "Missing push keys.";
  if (typeof k.p256dh !== "string" || !B64URL.test(k.p256dh) || b64urlBytes(k.p256dh) !== 65) {
    return "Push key has the wrong size.";
  }
  if (typeof k.auth !== "string" || !B64URL.test(k.auth) || b64urlBytes(k.auth) !== 16) {
    return "Push secret has the wrong size.";
  }
  return null;
}

export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Up to `max` distinct lowercase circle addresses; anything else is dropped. */
export function circleList(input: unknown, max: number): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const v of input) {
    if (typeof v === "string" && ADDRESS.test(v)) out.add(v.toLowerCase());
    if (out.size >= max) break;
  }
  return [...out];
}
