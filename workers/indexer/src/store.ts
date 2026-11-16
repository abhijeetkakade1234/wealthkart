/**
 * D1 access (ADR 0036). Every query is parameterised; addresses are stored lowercase.
 * Only the subset of the D1 API used here, so tests can run it on node:sqlite.
 */

export interface Stmt {
  bind(...values: unknown[]): Stmt;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Db {
  prepare(sql: string): Stmt;
  batch(statements: Stmt[]): Promise<unknown>;
}

export interface StoredLog {
  address: string;
  block: bigint;
  logIndex: number;
  tx: string;
  event: string;
  /** Event args encoded with `codec.encode`. */
  args: string;
}

const INDEXED_TO = "indexed_to";
const DB_SIZE = "db_size";
const DB_FULL = "db_full";
const CHECKED_AT = "checked_at";
/** D1 accepts large batches, but smaller ones keep each write well inside limits. */
const BATCH = 50;

export async function indexedTo(db: Db): Promise<bigint | null> {
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(INDEXED_TO).first<{
    value: string;
  }>();
  return row ? BigInt(row.value) : null;
}

export async function checkedAt(db: Db): Promise<number> {
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(CHECKED_AT).first<{
    value: string;
  }>();
  return row ? Number(row.value) : 0;
}

export async function markChecked(db: Db, nowMs: number) {
  await db
    .prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(CHECKED_AT, String(nowMs))
    .run();
}

export async function circleAddresses(db: Db, upToBlock: bigint): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT address FROM circles WHERE created_block <= ? ORDER BY address")
    .bind(Number(upToBlock))
    .all<{ address: string }>();
  return results.map((r) => r.address);
}

/**
 * Saves circles and logs for one block range and moves the cursor to `to`, in batches.
 * The cursor only ever moves forward, so a slow cron run can't undo a faster request's work.
 */
export async function saveRange(
  db: Db,
  circles: Array<{ address: string; block: bigint }>,
  logs: StoredLog[],
  to: bigint,
): Promise<number | undefined> {
  const stmts: Stmt[] = [];
  for (const c of circles) {
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO circles (address, created_block) VALUES (?, ?)")
        .bind(c.address.toLowerCase(), Number(c.block)),
    );
  }
  for (const l of logs) {
    stmts.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO logs (address, block, log_index, tx, event, args) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(l.address.toLowerCase(), Number(l.block), l.logIndex, l.tx, l.event, l.args),
    );
  }
  for (let i = 0; i < stmts.length; i += BATCH) await db.batch(stmts.slice(i, i + BATCH));
  const written = await db
    .prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = CASE
         WHEN CAST(excluded.value AS INTEGER) > CAST(meta.value AS INTEGER) THEN excluded.value
         ELSE meta.value END`,
    )
    .bind(INDEXED_TO, to.toString())
    .run();
  // D1 reports the database size after every write (ADR 0047).
  const size = (written as { meta?: { size_after?: number } } | undefined)?.meta?.size_after;
  if (size !== undefined) await setMeta(db, DB_SIZE, String(size));
  return size;
}

async function setMeta(db: Db, key: string, value: string) {
  await db
    .prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key, value)
    .run();
}

async function getMeta(db: Db, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first<{
    value: string;
  }>();
  return row ? row.value : null;
}

/** Last database size seen, in bytes (0 before the first write). */
export async function dbSize(db: Db): Promise<number> {
  return Number((await getMeta(db, DB_SIZE)) ?? 0);
}

/** True once the soft size limit was reached: no new events are stored (ADR 0047). */
export async function isFull(db: Db): Promise<boolean> {
  return (await getMeta(db, DB_FULL)) === "1";
}

export async function markFull(db: Db) {
  await setMeta(db, DB_FULL, "1");
}

export interface LogRow {
  block: number;
  log_index: number;
  tx: string;
  event: string;
  args: string;
}

/** One page of a circle's logs at or after (fromBlock, fromLogIndex), oldest first. */
export async function circleLogs(
  db: Db,
  address: string,
  fromBlock: number,
  fromLogIndex: number,
  limit: number,
): Promise<LogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT block, log_index, tx, event, args FROM logs
       WHERE address = ? AND (block > ? OR (block = ? AND log_index >= ?))
       ORDER BY block, log_index LIMIT ?`,
    )
    .bind(address.toLowerCase(), fromBlock, fromBlock, fromLogIndex, limit)
    .all<LogRow>();
  return results;
}

export async function isKnownCircle(db: Db, address: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM circles WHERE address = ?")
    .bind(address.toLowerCase())
    .first<{ ok: number }>();
  return row !== null;
}
