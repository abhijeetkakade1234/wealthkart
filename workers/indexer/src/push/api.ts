import { type Db, isFull, isKnownCircle } from "../store";
import { type Action, newToken, sameHex, sha256Hex, verifySigned } from "./auth";
import { ALL_KINDS, isKinds } from "./kinds";
import { type Fetcher, sendPush, usableKey, type Vapid } from "./send";
import {
  addWatches,
  allow,
  deleteSub,
  saveSub,
  setWatch,
  subByEndpoint,
  type SubRow,
  useNonce,
  watchesOf,
} from "./store";
import { ADDRESS, circleList, MAX_BODY, subscriptionProblem } from "./validate";

/**
 * Push API (ADR 0052). All POST with a JSON body; CORS stays open because nothing here relies on
 * cookies: a wallet signature turns reminders on or off, and the device token it returns
 * (kept on that device) changes settings and sends a test.
 *
 *   POST /v1/push/subscribe    { message, signature, subscription, circles[] }      -> { token, circles }
 *   POST /v1/push/unsubscribe  { endpoint, token } or { endpoint, message, signature } -> { ok }
 *   POST /v1/push/settings     { endpoint, token }                                 -> { address, circles }
 *   POST /v1/push/circle       { endpoint, token, circle, kinds }                  -> { circle, kinds }
 *   POST /v1/push/test         { endpoint, token }                                 -> { sent }
 */

export interface PushConfig {
  chainId: number;
  /** VAPID keys; reminders are off (503) until the secret is set. */
  vapid: Vapid | null;
  /** Sites allowed in the signed message (`APP_DOMAINS`). */
  domains: string[];
  /** E2E only: endpoint prefixes accepted besides the known push services. */
  extraOrigins: string[];
  /**
   * Which of `circles` list `member` as an active member, read from the chain. Only those can
   * be watched, so a throwaway wallet can't make the cron read circles it isn't in. Without it
   * (tests), every known circle passes.
   */
  isMember?: (circles: string[], member: string) => Promise<boolean[]>;
  /**
   * Asks the factory's `isCircle` registry (RT-01) about circles the index hasn't reached yet,
   * e.g. one created a moment ago. Without it, only indexed circles count.
   */
  isCircle?: (circles: string[]) => Promise<boolean[]>;
}

/** Circles accepted in one subscribe call. */
export const MAX_CIRCLES_PER_CALL = 50;

/** Rate limits: [calls, window in seconds]. */
export const LIMITS = {
  subscribeIp: [30, 3600],
  subscribeAddress: [10, 3600],
  settingsAddress: [120, 3600],
  testEndpointBurst: [1, 30],
  testEndpointDay: [10, 86_400],
} as const;

type Json = (body: unknown, status?: number) => Response;

export async function handlePush(
  request: Request,
  path: string,
  db: Db,
  cfg: PushConfig,
  nowMs: number,
  json: Json,
  fetcher?: Fetcher,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!cfg.vapid) return json({ error: "Reminders aren't switched on for this server yet." }, 503);
  const now = Math.floor(nowMs / 1000);

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY) return json({ error: "Request is too large." }, 413);
  let body: Record<string, unknown>;
  try {
    const text = await readCapped(request, MAX_BODY);
    if (text === null) return json({ error: "Request is too large." }, 413);
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Request isn't valid JSON." }, 400);
  }

  const limited = () => json({ error: "Too many requests. Try again in a little while." }, 429);

  if (path === "/v1/push/subscribe") {
    // Only a hash of the IP is kept, and only as a rate-limit counter (pruned within 2 days).
    const ip = (await sha256Hex(request.headers.get("cf-connecting-ip") ?? "local")).slice(0, 32);
    const [ipMax, ipWin] = LIMITS.subscribeIp;
    if (!(await allow(db, `ip:${ip}`, ipMax, ipWin, now))) return limited();
    const sub = body.subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
    const bad = subscriptionProblem(sub, cfg.extraOrigins);
    if (bad) return json({ error: bad }, 400);
    if (!(await usableKey(sub.keys.p256dh))) return json({ error: "Push key isn't valid." }, 400);
    const v = await verify(body, "on", sub.endpoint, cfg, now);
    if (!v.ok) return json({ error: v.reason }, 401);
    const address = v.value.address;
    const [aMax, aWin] = LIMITS.subscribeAddress;
    if (!(await allow(db, `sub:${address}`, aMax, aWin, now))) return limited();
    if (!(await useNonce(db, v.value.nonce, v.value.expires))) {
      return json({ error: "This signed message was already used. Try again." }, 401);
    }
    // ADR 0047: once D1 is near its free-tier limit, no new devices.
    const existing = await subByEndpoint(db, sub.endpoint);
    if (!existing && (await isFull(db))) {
      return json({ error: "Reminders are full right now. Try again later." }, 503);
    }
    const { token, hash } = await newToken();
    await saveSub(db, {
      endpoint: sub.endpoint,
      address,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      token_hash: hash,
      created_at: now,
    });
    const known = await knownCircles(db, cfg, circleList(body.circles, MAX_CIRCLES_PER_CALL));
    const circles = await membersOnly(cfg, known, address);
    await addWatches(db, address, circles, ALL_KINDS, now);
    return json({ token, address, circles: await settingsOf(db, address) });
  }

  if (path === "/v1/push/unsubscribe") {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const row = endpoint ? await subByEndpoint(db, endpoint) : null;
    if (!row) return json({ ok: true });
    if (typeof body.token === "string") {
      if (!(await tokenMatches(row, body.token))) return json({ error: "Not allowed." }, 401);
    } else {
      const v = await verify(body, "off", endpoint, cfg, now);
      if (!v.ok) return json({ error: v.reason }, 401);
      if (v.value.address !== row.address) return json({ error: "Not allowed." }, 401);
      if (!(await useNonce(db, v.value.nonce, v.value.expires))) {
        return json({ error: "This signed message was already used. Try again." }, 401);
      }
    }
    await deleteSub(db, endpoint);
    return json({ ok: true });
  }

  // The rest act on one device with its token.
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const row = endpoint ? await subByEndpoint(db, endpoint) : null;
  if (!row || typeof body.token !== "string" || !(await tokenMatches(row, body.token))) {
    // Same answer for "no such device" and "wrong token": nothing to learn by probing.
    return json({ error: "Reminders aren't on for this device." }, 401);
  }

  if (path === "/v1/push/settings") {
    return json({ address: row.address, circles: await settingsOf(db, row.address) });
  }

  if (path === "/v1/push/circle") {
    const [sMax, sWin] = LIMITS.settingsAddress;
    if (!(await allow(db, `set:${row.address}`, sMax, sWin, now))) return limited();
    const circle = typeof body.circle === "string" ? body.circle : "";
    if (!ADDRESS.test(circle)) return json({ error: "That isn't a circle address." }, 400);
    if (!isKinds(body.kinds)) return json({ error: "Unknown reminder settings." }, 400);
    const c = circle.toLowerCase();
    if ((await knownCircles(db, cfg, [c])).length === 0) {
      return json({ error: "That circle isn't known yet. Try again in a minute." }, 404);
    }
    if (body.kinds !== 0 && (await membersOnly(cfg, [c], row.address)).length === 0) {
      return json({ error: "This wallet isn't a member of that circle." }, 403);
    }
    if (!(await setWatch(db, row.address, c, body.kinds, now))) {
      return json({ error: "Reminders are on for the most circles allowed." }, 409);
    }
    return json({ circle: c, kinds: body.kinds });
  }

  if (path === "/v1/push/test") {
    const id = (await sha256Hex(row.endpoint)).slice(0, 32);
    const [bMax, bWin] = LIMITS.testEndpointBurst;
    const [dMax, dWin] = LIMITS.testEndpointDay;
    if (!(await allow(db, `test:${id}`, bMax, bWin, now))) return limited();
    if (!(await allow(db, `testday:${id}`, dMax, dWin, now))) return limited();
    const res = await sendPush(
      row,
      {
        title: "WealthKart",
        body: "Reminders work on this device. We'll only write when something needs you.",
        url: "/app/settings/",
        tag: "test",
      },
      cfg.vapid,
      fetcher,
    );
    if (res === "gone") {
      await deleteSub(db, row.endpoint);
      return json({ sent: false, gone: true });
    }
    return json({ sent: res === "sent" }, res === "sent" ? 200 : 502);
  }

  return json({ error: "Not found." }, 404);
}

/** Reads at most `max` bytes of the body; null when it is longer. */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

async function verify(
  body: Record<string, unknown>,
  action: Action,
  endpoint: string,
  cfg: PushConfig,
  now: number,
) {
  return verifySigned({
    message: body.message,
    signature: body.signature,
    action,
    endpoint,
    chainId: cfg.chainId,
    domains: cfg.domains,
    nowSec: now,
  });
}

async function tokenMatches(row: SubRow, token: string): Promise<boolean> {
  if (token.length < 20 || token.length > 100) return false;
  return sameHex(await sha256Hex(token), row.token_hash);
}

/** Factory circles only: from the index, else from the factory registry by RPC. */
async function knownCircles(db: Db, cfg: PushConfig, circles: string[]): Promise<string[]> {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const c of circles) ((await isKnownCircle(db, c)) ? known : unknown).push(c);
  if (unknown.length > 0 && cfg.isCircle) {
    try {
      const ok = await cfg.isCircle(unknown);
      known.push(...unknown.filter((_, i) => ok[i] === true));
    } catch {
      // RPC trouble: only indexed circles this time.
    }
  }
  return known;
}

/** Keeps circles the chain says `address` is a member of. RPC trouble keeps them all. */
async function membersOnly(cfg: PushConfig, circles: string[], address: string) {
  if (!cfg.isMember || circles.length === 0) return circles;
  try {
    const ok = await cfg.isMember(circles, address);
    return circles.filter((_, i) => ok[i] === true);
  } catch {
    // The cron drops non-members on its first look anyway.
    return circles;
  }
}

async function settingsOf(db: Db, address: string) {
  return (await watchesOf(db, address)).map((w) => ({ circle: w.circle, kinds: w.kinds }));
}
