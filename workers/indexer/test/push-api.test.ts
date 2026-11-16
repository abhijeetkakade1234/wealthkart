import { webcrypto } from "node:crypto";

import { describe, expect, it } from "vitest";

import { handle } from "../src/api";
import type { ChainReader, Config } from "../src/indexer";
import type { PushConfig } from "../src/push/api";
import { ALL_KINDS, KIND } from "../src/push/kinds";
import type { ReminderReader } from "../src/push/reader";
import type { CircleFacts, MemberFacts } from "../src/push/schedule";
import { sendPush } from "../src/push/send";
import { reminderStep } from "../src/push/step";
import { markFull, saveRange } from "../src/store";
import { memoryDb } from "./sqlite-d1";
import {
  CHAIN,
  decryptPush,
  deviceKeys,
  DOMAIN,
  ENDPOINT,
  fakePushService,
  signedMessage,
  vapidKeys,
  wallet,
} from "./push-helpers";

const CIRCLE = "0xc1c1000000000000000000000000000000000001";
const FAKE = "0xbad0000000000000000000000000000000000bad";
const cfg: Config = {
  chainId: CHAIN,
  factory: "0xf",
  fromBlock: 0n,
  chunk: 10n,
  confirmations: 0n,
};
const idle: ChainReader = {
  latestBlock: async () => 0n,
  circlesCreated: async () => [],
  circleLogs: async () => [],
};
const ME = wallet.address.toLowerCase();

async function setup() {
  const db = memoryDb();
  await saveRange(db, [{ address: CIRCLE, block: 1n }], [], 1n);
  const vapid = await vapidKeys();
  const push: PushConfig = { chainId: CHAIN, vapid, domains: [DOMAIN], extraOrigins: [] };
  const service = fakePushService();
  const call = async (path: string, body: unknown, nowMs = Date.now(), headers = {}) => {
    const res = await handle(
      new Request(`https://idx${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      db,
      idle,
      cfg,
      nowMs,
      push,
      service.fetcher,
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown>, res };
  };
  return { db, vapid, push, service, call };
}

async function subscribe(
  call: Awaited<ReturnType<typeof setup>>["call"],
  device: Awaited<ReturnType<typeof deviceKeys>>,
  endpoint = ENDPOINT,
  circles = [CIRCLE],
) {
  const s = await signedMessage({ endpoint });
  return call("/v1/push/subscribe", {
    ...s,
    subscription: { endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
    circles,
  });
}

describe("push API on the D1 shim (ADR 0052)", () => {
  it("S-REM-20 subscribe with a signature, get a device token, read and change settings, unsubscribe", async () => {
    const { call, db } = await setup();
    const device = await deviceKeys();
    const r = await subscribe(call, device, ENDPOINT, [CIRCLE, FAKE]);
    expect(r.status).toBe(200);
    expect(r.res.headers.get("access-control-allow-origin")).toBe("*");
    const token = r.body.token as string;
    expect(token.length).toBeGreaterThan(30);
    // Only circles the factory created are watched.
    expect(r.body.circles).toEqual([{ circle: CIRCLE, kinds: ALL_KINDS }]);

    // The token is stored only as a hash.
    const row = await db.prepare("SELECT * FROM push_subs").first<Record<string, unknown>>();
    expect(row?.address).toBe(ME);
    expect(JSON.stringify(row)).not.toContain(token);

    const set = await call("/v1/push/circle", {
      endpoint: ENDPOINT,
      token,
      circle: CIRCLE.toUpperCase().replace("0X", "0x"),
      kinds: KIND.due | KIND.votes,
    });
    expect(set.status).toBe(200);
    const read = await call("/v1/push/settings", { endpoint: ENDPOINT, token });
    expect(read.body).toEqual({
      address: ME,
      circles: [{ circle: CIRCLE, kinds: KIND.due | KIND.votes }],
    });

    expect(
      (await call("/v1/push/circle", { endpoint: ENDPOINT, token, circle: FAKE, kinds: 1 })).status,
    ).toBe(404);
    expect(
      (await call("/v1/push/circle", { endpoint: ENDPOINT, token, circle: CIRCLE, kinds: 99 }))
        .status,
    ).toBe(400);

    const off = await call("/v1/push/unsubscribe", { endpoint: ENDPOINT, token });
    expect(off.body).toEqual({ ok: true });
    // Last device gone: settings and history go too.
    expect(await db.prepare("SELECT COUNT(*) AS n FROM push_watch").first()).toEqual({ n: 0 });
    expect((await call("/v1/push/settings", { endpoint: ENDPOINT, token })).status).toBe(401);
  });

  it("S-REM-21 refuses replayed messages, wrong tokens, bad endpoints and oversized bodies", async () => {
    const { call } = await setup();
    const device = await deviceKeys();
    const s = await signedMessage();
    const body = {
      ...s,
      subscription: { endpoint: ENDPOINT, keys: { p256dh: device.p256dh, auth: device.auth } },
      circles: [CIRCLE],
    };
    expect((await call("/v1/push/subscribe", body)).status).toBe(200);
    // The same signed message again: replay.
    expect((await call("/v1/push/subscribe", body)).status).toBe(401);

    const evil = {
      ...(await signedMessage({ endpoint: "https://example.com/hook" })),
      subscription: { endpoint: "https://example.com/hook", keys: body.subscription.keys },
    };
    expect((await call("/v1/push/subscribe", evil)).status).toBe(400);

    // A valid-size key that isn't a curve point.
    const junk = Buffer.from(new Uint8Array(65).fill(4)).toString("base64url");
    const badKey = {
      ...(await signedMessage()),
      subscription: { endpoint: ENDPOINT, keys: { p256dh: junk, auth: device.auth } },
    };
    expect((await call("/v1/push/subscribe", badKey)).status).toBe(400);

    expect(
      (await call("/v1/push/settings", { endpoint: ENDPOINT, token: "x".repeat(43) })).status,
    ).toBe(401);
    expect(
      (
        await call("/v1/push/settings", {
          endpoint: "https://fcm.googleapis.com/none",
          token: "x".repeat(43),
        })
      ).status,
    ).toBe(401);
    expect((await call("/v1/push/subscribe", "{not json")).status).toBe(400);
    expect((await call("/v1/push/subscribe", { pad: "x".repeat(9000) })).status).toBe(413);
    // A body streamed without a length is cut off at 8 KB too.
    const big = new ReadableStream({
      start(c) {
        for (let i = 0; i < 20; i += 1) c.enqueue(new TextEncoder().encode("x".repeat(1000)));
        c.close();
      },
    });
    const streamed = await handle(
      new Request("https://idx/v1/push/subscribe", {
        method: "POST",
        body: big,
        duplex: "half",
      } as RequestInit),
      memoryDb(),
      idle,
      cfg,
      0,
      { chainId: CHAIN, vapid: await vapidKeys(), domains: [DOMAIN], extraOrigins: [] },
    );
    expect(streamed.status).toBe(413);
    const get = await handle(new Request("https://idx/v1/push/settings"), memoryDb(), idle, cfg, 0);
    expect(get.status).toBe(405);
  });

  it("S-REM-22 rate limits: subscribe per wallet per hour, test pushes per device", async () => {
    const { call } = await setup();
    const device = await deviceKeys();
    let last = 0;
    for (let i = 0; i < 11; i += 1) last = (await subscribe(call, device)).status;
    expect(last).toBe(429);

    const { call: call2 } = await setup();
    const token = (await subscribe(call2, device)).body.token as string;
    const t0 = Date.now();
    expect((await call2("/v1/push/test", { endpoint: ENDPOINT, token }, t0)).body).toEqual({
      sent: true,
    });
    expect((await call2("/v1/push/test", { endpoint: ENDPOINT, token }, t0 + 1000)).status).toBe(
      429,
    );
    expect((await call2("/v1/push/test", { endpoint: ENDPOINT, token }, t0 + 31_000)).status).toBe(
      200,
    );
  });

  it("S-REM-23 off until the VAPID secret is set; no new devices once D1 is full (ADR 0047)", async () => {
    const db = memoryDb();
    const health = await handle(new Request("https://idx/v1/health"), db, idle, cfg, 0);
    expect(((await health.json()) as { push: boolean }).push).toBe(false);
    const off = await handle(
      new Request("https://idx/v1/push/subscribe", { method: "POST", body: "{}" }),
      db,
      idle,
      cfg,
      0,
    );
    expect(off.status).toBe(503);

    const { call, db: db2 } = await setup();
    await markFull(db2);
    expect((await subscribe(call, await deviceKeys())).status).toBe(503);
  });

  it("S-REM-24 a wallet keeps at most 5 devices; a 6th replaces the oldest", async () => {
    const { call, db } = await setup();
    const device = await deviceKeys();
    for (let i = 0; i < 6; i += 1) {
      const r = await subscribe(call, device, `${ENDPOINT}-${i}`);
      expect(r.status).toBe(200);
    }
    const { results } = await db
      .prepare("SELECT endpoint FROM push_subs")
      .all<{ endpoint: string }>();
    expect(results).toHaveLength(5);
  });
});

describe("membership check", () => {
  it("S-REM-31 only circles the wallet is a member of are watched; RPC trouble falls back to the cron's check", async () => {
    const s = await setup();
    const OTHER = "0xc1c1000000000000000000000000000000000002";
    await saveRange(s.db, [{ address: OTHER, block: 2n }], [], 2n);
    s.push.isMember = async (circles) => circles.map((c) => c === CIRCLE);
    const r = await subscribe(s.call, await deviceKeys(), ENDPOINT, [CIRCLE, OTHER]);
    expect(r.body.circles).toEqual([{ circle: CIRCLE, kinds: ALL_KINDS }]);
    const token = r.body.token as string;
    const denied = await s.call("/v1/push/circle", {
      endpoint: ENDPOINT,
      token,
      circle: OTHER,
      kinds: KIND.due,
    });
    expect(denied.status).toBe(403);
    // Switching off never needs the check.
    expect(
      (await s.call("/v1/push/circle", { endpoint: ENDPOINT, token, circle: OTHER, kinds: 0 }))
        .status,
    ).toBe(200);
    s.push.isMember = async () => {
      throw new Error("rpc down");
    };
    expect(
      (await s.call("/v1/push/circle", { endpoint: ENDPOINT, token, circle: OTHER, kinds: 1 }))
        .status,
    ).toBe(200);
  });
});

describe("Web Push sending (RFC 8291/8292)", () => {
  it("S-REM-25 the body decrypts on the device; VAPID JWT is signed for the push service origin", async () => {
    const vapid = await vapidKeys();
    const device = await deviceKeys();
    const service = fakePushService();
    const res = await sendPush(
      { endpoint: ENDPOINT, p256dh: device.p256dh, auth: device.auth },
      { title: "Sunday Savers", body: "Due today.", url: "/app/", tag: "t", at: 1 },
      vapid,
      service.fetcher,
    );
    expect(res).toBe("sent");
    const call = service.calls[0]!;
    expect(call.headers["content-encoding"]).toBe("aes128gcm");
    expect(call.headers.ttl).toBe("86400");
    expect(call.headers.topic).toMatch(/^[0-9a-f]{32}$/);
    const text = await decryptPush(call.body, device);
    expect(JSON.parse(text)).toEqual({
      title: "Sunday Savers",
      body: "Due today.",
      url: "/app/",
      tag: "t",
      at: 1,
    });

    const m = call.headers.authorization!.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(m[2]).toBe(vapid.publicKey);
    const [h, p, sig] = m[1]!.split(".");
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("https://wealthkart.pages.dev");
    expect(claims.exp - Date.now() / 1000).toBeLessThanOrEqual(24 * 3600);
    const ok = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      vapid.verifyKey,
      Buffer.from(sig!, "base64url"),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });

  it("S-REM-26 404/410 means the device is gone; other errors are retried later", async () => {
    const vapid = await vapidKeys();
    const device = await deviceKeys();
    const d = { endpoint: ENDPOINT, p256dh: device.p256dh, auth: device.auth };
    const data = { title: "t", body: "b", url: "/app/", tag: "x" };
    for (const [status, want] of [
      [410, "gone"],
      [404, "gone"],
      [429, "failed"],
      [500, "failed"],
      [201, "sent"],
    ] as const) {
      expect(await sendPush(d, data, vapid, fakePushService(status).fetcher)).toBe(want);
    }
    const throwing = async () => {
      throw new Error("network");
    };
    expect(await sendPush(d, data, vapid, throwing)).toBe("failed");
    // A broken VAPID key on our side never reports devices as gone.
    expect(
      await sendPush(d, data, { ...vapid, privateKey: "AAAA" }, fakePushService().fetcher),
    ).toBe("failed");
  });
});

describe("reminder cron step", () => {
  const DEC = 24323;
  const now = Date.parse("2026-12-09T03:00:00Z");
  const facts: CircleFacts = {
    address: CIRCLE,
    name: "Sunday Savers",
    asset: { symbol: "AVAX", decimals: 18 },
    dueDay: 10,
    secondFeeDay: 20,
    fee1: 10n ** 17n,
    fee2: 10n ** 17n,
    dissolved: false,
    votes: [{ key: "m:1", deadline: now / 1000 + 86_400 * 2 }],
  };
  const unpaid: MemberFacts = {
    active: true,
    dormant: false,
    due: { period: DEC, amount: 4n * 10n ** 18n, fees: 0n, payable: true },
    holiday: false,
    interest: null,
    exit: null,
    withdrawable: 0n,
    canVote: ["m:1"],
  };
  const reader = (m: MemberFacts | "fail"): ReminderReader & { reads: number } => {
    const r = {
      reads: 0,
      circle: async () => facts,
      member: async () => {
        r.reads += 1;
        if (m === "fail") throw new Error("rpc");
        return m;
      },
    };
    return r;
  };

  it("S-REM-27 sends each reminder once per stage, groups votes, and waits an hour before looking again", async () => {
    const s = await setup();
    const device = await deviceKeys();
    await subscribe(s.call, device);
    const r = reader(unpaid);
    const first = await reminderStep(s.db, r, s.vapid, now, undefined, s.service.fetcher);
    expect(first).toEqual({ checked: 1, sent: 2, dropped: 0 });
    const texts = await Promise.all(s.service.calls.map((c) => decryptPush(c.body, device)));
    expect(texts.map((t) => JSON.parse(t).body)).toEqual([
      "Your 4.00 AVAX for December is due tomorrow, by 10 Dec 23:59 UTC.",
      "A vote is waiting for you. It closes 11 Dec 03:00 UTC.",
    ]);
    expect(JSON.parse(texts[0]!).url).toBe(`/app/circle/pay/?id=${CIRCLE}`);

    // Within the hour: not even read.
    await reminderStep(s.db, r, s.vapid, now + 30 * 60_000, undefined, s.service.fetcher);
    expect(r.reads).toBe(1);
    // An hour later: read again, same stage, nothing sent.
    await reminderStep(s.db, r, s.vapid, now + 61 * 60_000, undefined, s.service.fetcher);
    expect(r.reads).toBe(2);
    expect(s.service.calls).toHaveLength(2);
    // Next UTC day: "due today" goes out once.
    const nextDay = Date.parse("2026-12-10T01:00:00Z");
    await reminderStep(s.db, r, s.vapid, nextDay, undefined, s.service.fetcher);
    expect(s.service.calls).toHaveLength(3);
    await reminderStep(s.db, r, s.vapid, nextDay + 3_700_000, undefined, s.service.fetcher);
    expect(s.service.calls).toHaveLength(3);
  });

  it("S-REM-28 a device the push service says is gone is removed; leaving the circle stops the watch", async () => {
    const s = await setup();
    await subscribe(s.call, await deviceKeys());
    s.service.setStatus(410);
    await reminderStep(s.db, reader(unpaid), s.vapid, now, undefined, s.service.fetcher);
    expect(await s.db.prepare("SELECT COUNT(*) AS n FROM push_subs").first()).toEqual({ n: 0 });
    expect(await s.db.prepare("SELECT COUNT(*) AS n FROM push_watch").first()).toEqual({ n: 0 });

    const t = await setup();
    await subscribe(t.call, await deviceKeys());
    const left = { ...unpaid, active: false, due: null, canVote: [] };
    const rep = await reminderStep(t.db, reader(left), t.vapid, now, undefined, t.service.fetcher);
    expect(rep.dropped).toBe(1);
    expect(t.service.calls).toHaveLength(0);
  });

  it("S-REM-29 RPC trouble retries in 15 minutes; a small push budget carries over to the next run", async () => {
    const s = await setup();
    await subscribe(s.call, await deviceKeys());
    const failing = reader("fail");
    await reminderStep(s.db, failing, s.vapid, now, undefined, s.service.fetcher);
    await reminderStep(s.db, failing, s.vapid, now + 14 * 60_000, undefined, s.service.fetcher);
    expect(failing.reads).toBe(1);
    await reminderStep(s.db, failing, s.vapid, now + 16 * 60_000, undefined, s.service.fetcher);
    expect(failing.reads).toBe(2);

    const t = await setup();
    await subscribe(t.call, await deviceKeys());
    const opts = { batch: 10, pushBudget: 1, every: 3600 };
    const ok = reader(unpaid);
    await reminderStep(t.db, ok, t.vapid, now, opts, t.service.fetcher);
    expect(t.service.calls).toHaveLength(1);
    await reminderStep(t.db, ok, t.vapid, now + 60_000, opts, t.service.fetcher);
    expect(t.service.calls).toHaveLength(2);
    await reminderStep(t.db, ok, t.vapid, now + 120_000, opts, t.service.fetcher);
    expect(t.service.calls).toHaveLength(2);
  });

  it("S-REM-30 a circle switched off is never read", async () => {
    const s = await setup();
    const token = (await subscribe(s.call, await deviceKeys())).body.token as string;
    await s.call("/v1/push/circle", { endpoint: ENDPOINT, token, circle: CIRCLE, kinds: 0 });
    const r = reader(unpaid);
    await reminderStep(s.db, r, s.vapid, now, undefined, s.service.fetcher);
    expect(r.reads).toBe(0);
  });
});
