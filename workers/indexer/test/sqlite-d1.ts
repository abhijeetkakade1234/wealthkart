import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

import type { Db, Stmt } from "../src/store";

/**
 * The slice of the D1 API the indexer uses, backed by Node's built-in SQLite, so unit tests
 * run the real SQL from `migrations/` without Cloudflare. Loaded with require because some
 * bundlers don't know the `node:sqlite` builtin yet.
 */
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

export function memoryDb(): Db {
  const db = new DatabaseSync(":memory:");
  const dir = join(__dirname, "..", "migrations");
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    db.exec(readFileSync(join(dir, f), "utf8"));
  }

  const stmt = (sql: string, values: unknown[] = []): Stmt & { exec: () => void } => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])) as T[] }),
    first: async <T>() => (db.prepare(sql).get(...(values as never[])) as T | undefined) ?? null,
    run: async () => db.prepare(sql).run(...(values as never[])),
    exec: () => {
      db.prepare(sql).run(...(values as never[]));
    },
  });

  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (statements: Stmt[]) => {
      db.exec("BEGIN");
      try {
        for (const s of statements) (s as Stmt & { exec: () => void }).exec();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
