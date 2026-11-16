import type { Db, Stmt } from "../store";

/**
 * D1 access for reminders (ADR 0052). Parameterised queries only; addresses lowercase.
 */

export interface SubRow {
  endpoint: string;
  address: string;
  p256dh: string;
  auth: string;
  token_hash: string;
  created_at: number;
}

export interface WatchRow {
  address: string;
  circle: string;
  kinds: number;
  next_at: number;
}

/** Devices per wallet. Subscribing an extra one drops the oldest. */
export const MAX_DEVICES = 5;
/** Circles per wallet the cron will watch. */
export const MAX_WATCHES = 100;
/** Sent-reminder rows older than this are pruned. */
export const SENT_KEEP_SEC = 120 * 86_400;

export async function subByEndpoint(db: Db, endpoint: string): Promise<SubRow | null> {
  return db.prepare("SELECT * FROM push_subs WHERE endpoint = ?").bind(endpoint).first<SubRow>();
}

export async function subsOf(db: Db, address: string): Promise<SubRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM push_subs WHERE address = ? ORDER BY created_at")
    .bind(address.toLowerCase())
    .all<SubRow>();
  return results;
}

/** Saves a device. If the endpoint belonged to another wallet, that wallet is tidied up. */
export async function saveSub(db: Db, row: SubRow): Promise<void> {
  const before = await subByEndpoint(db, row.endpoint);
  await db
    .prepare(
      `INSERT INTO push_subs (endpoint, address, p256dh, auth, token_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET address = excluded.address, p256dh = excluded.p256dh,
         auth = excluded.auth, token_hash = excluded.token_hash, created_at = excluded.created_at`,
    )
    .bind(row.endpoint, row.address, row.p256dh, row.auth, row.token_hash, row.created_at)
    .run();
  if (before && before.address !== row.address) await dropIfNoDevices(db, before.address);
  const subs = await subsOf(db, row.address);
  for (const old of subs.slice(0, Math.max(0, subs.length - MAX_DEVICES))) {
    await db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(old.endpoint).run();
  }
}

/** Removes a device; when it was the wallet's last one, its settings and history go too. */
export async function deleteSub(db: Db, endpoint: string): Promise<void> {
  const row = await subByEndpoint(db, endpoint);
  await db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(endpoint).run();
  if (row) await dropIfNoDevices(db, row.address);
}

async function dropIfNoDevices(db: Db, address: string) {
  const left = await db
    .prepare("SELECT 1 AS ok FROM push_subs WHERE address = ? LIMIT 1")
    .bind(address)
    .first<{ ok: number }>();
  if (left) return;
  await db.batch([
    db.prepare("DELETE FROM push_watch WHERE address = ?").bind(address),
    db.prepare("DELETE FROM push_sent WHERE address = ?").bind(address),
  ]);
}

export async function watchesOf(db: Db, address: string): Promise<WatchRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM push_watch WHERE address = ? ORDER BY circle")
    .bind(address.toLowerCase())
    .all<WatchRow>();
  return results;
}

/** Adds circles with `kinds` unless the wallet already has a setting for them. */
export async function addWatches(
  db: Db,
  address: string,
  circles: string[],
  kinds: number,
  nowSec: number,
): Promise<void> {
  const have = await watchesOf(db, address);
  const room = Math.max(0, MAX_WATCHES - have.length);
  const known = new Set(have.map((w) => w.circle));
  const add = circles.filter((c) => !known.has(c)).slice(0, room);
  const stmts: Stmt[] = add.map((c) =>
    db
      .prepare(
        "INSERT OR IGNORE INTO push_watch (address, circle, kinds, next_at) VALUES (?, ?, ?, ?)",
      )
      .bind(address, c, kinds, nowSec),
  );
  if (stmts.length > 0) await db.batch(stmts);
}

/** Sets one circle's kinds; false when the wallet already watches the maximum. */
export async function setWatch(
  db: Db,
  address: string,
  circle: string,
  kinds: number,
  nowSec: number,
): Promise<boolean> {
  const existing = await db
    .prepare("SELECT 1 AS ok FROM push_watch WHERE address = ? AND circle = ?")
    .bind(address, circle)
    .first<{ ok: number }>();
  if (!existing) {
    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM push_watch WHERE address = ?")
      .bind(address)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_WATCHES) return false;
  }
  await db
    .prepare(
      `INSERT INTO push_watch (address, circle, kinds, next_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(address, circle) DO UPDATE SET kinds = excluded.kinds, next_at = excluded.next_at`,
    )
    .bind(address, circle, kinds, nowSec)
    .run();
  return true;
}

/** Watches the cron should look at now, oldest first. Kinds 0 (switched off) are skipped. */
export async function dueWatches(db: Db, nowSec: number, limit: number): Promise<WatchRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM push_watch WHERE next_at <= ? AND kinds != 0 ORDER BY next_at LIMIT ?")
    .bind(nowSec, limit)
    .all<WatchRow>();
  return results;
}

export async function setNextAt(db: Db, address: string, circle: string, nextAt: number) {
  await db
    .prepare("UPDATE push_watch SET next_at = ? WHERE address = ? AND circle = ?")
    .bind(nextAt, address, circle)
    .run();
}

export async function dropWatch(db: Db, address: string, circle: string) {
  await db.batch([
    db.prepare("DELETE FROM push_watch WHERE address = ? AND circle = ?").bind(address, circle),
    db.prepare("DELETE FROM push_sent WHERE address = ? AND circle = ?").bind(address, circle),
  ]);
}

export async function sentStages(
  db: Db,
  address: string,
  circle: string,
): Promise<Map<string, number>> {
  const { results } = await db
    .prepare("SELECT topic, stage FROM push_sent WHERE address = ? AND circle = ?")
    .bind(address, circle)
    .all<{ topic: string; stage: number }>();
  return new Map(results.map((r) => [r.topic, r.stage]));
}

export async function markSent(
  db: Db,
  address: string,
  circle: string,
  topics: Array<{ topic: string; stage: number }>,
  nowSec: number,
) {
  if (topics.length === 0) return;
  await db.batch(
    topics.map((t) =>
      db
        .prepare(
          `INSERT INTO push_sent (address, circle, topic, stage, at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(address, circle, topic) DO UPDATE SET
             stage = MAX(push_sent.stage, excluded.stage), at = excluded.at`,
        )
        .bind(address, circle, t.topic, t.stage, nowSec),
    ),
  );
}

/** Records a nonce; false if it was used before (replay). */
export async function useNonce(db: Db, nonce: string, expires: number): Promise<boolean> {
  const seen = await db
    .prepare("SELECT 1 AS ok FROM push_nonces WHERE nonce = ?")
    .bind(nonce)
    .first<{ ok: number }>();
  if (seen) return false;
  await db
    .prepare("INSERT OR IGNORE INTO push_nonces (nonce, expires) VALUES (?, ?)")
    .bind(nonce, expires)
    .run();
  return true;
}

/**
 * Fixed-window counter. Returns true while `key` has made fewer than `limit` calls in the
 * current window of `windowSec`, and counts this call.
 */
export async function allow(
  db: Db,
  key: string,
  limit: number,
  windowSec: number,
  nowSec: number,
): Promise<boolean> {
  const start = nowSec - (nowSec % windowSec);
  const row = await db
    .prepare("SELECT window_start, count FROM push_rate WHERE key = ?")
    .bind(key)
    .first<{ window_start: number; count: number }>();
  const count = row && row.window_start === start ? row.count : 0;
  if (count >= limit) return false;
  await db
    .prepare(
      `INSERT INTO push_rate (key, window_start, count) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`,
    )
    .bind(key, start, count + 1)
    .run();
  return true;
}

/** Deletes expired nonces, old rate windows and old sent rows. Cheap; run by the cron. */
export async function prune(db: Db, nowSec: number) {
  await db.batch([
    db.prepare("DELETE FROM push_nonces WHERE expires < ?").bind(nowSec),
    db.prepare("DELETE FROM push_rate WHERE window_start < ?").bind(nowSec - 2 * 86_400),
    db.prepare("DELETE FROM push_sent WHERE at < ?").bind(nowSec - SENT_KEEP_SEC),
  ]);
}
