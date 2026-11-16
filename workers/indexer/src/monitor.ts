import type { Db } from "./store";

/**
 * Contract monitoring (Phase 3, ADR 0041). Every cron run checks a batch of circles, round
 * robin, for the one invariant that must never break: the vault holds at least its cash
 * (total assets minus loans out). Refused payouts waiting in `withdrawable` only add to the
 * balance, so `balance < cash` always means money is missing. Problems are stored as alerts,
 * served by the API, and optionally posted to a webhook.
 */

export interface Solvency {
  balance: bigint;
  totalAssets: bigint;
  loansOutstanding: bigint;
}

export interface MonitorReader {
  solvency(circle: string): Promise<Solvency>;
}

export interface Alert {
  address: string;
  kind: string;
  detail: string;
  firstSeen: number;
  lastSeen: number;
  resolved: boolean;
}

const CURSOR = "monitor_cursor";
export const MONITOR_BATCH = 25;

/** Checks the next batch of circles; returns new or still-open alerts found in this run. */
export async function checkCircles(
  db: Db,
  reader: MonitorReader,
  nowMs: number,
  batch = MONITOR_BATCH,
): Promise<Alert[]> {
  const { results: circles } = await db
    .prepare("SELECT address FROM circles ORDER BY address")
    .all<{ address: string }>();
  if (circles.length === 0) return [];
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(CURSOR).first<{
    value: string;
  }>();
  const start = row ? Number(row.value) % circles.length : 0;
  const picked = Array.from(
    { length: Math.min(batch, circles.length) },
    (_, i) => circles[(start + i) % circles.length]!.address,
  );

  const found: Alert[] = [];
  for (const address of picked) {
    let problem: { kind: string; detail: string } | null = null;
    try {
      const s = await reader.solvency(address);
      const cash = s.totalAssets - s.loansOutstanding;
      if (s.balance < cash) {
        problem = {
          kind: "insolvent",
          detail: `balance ${s.balance} is below cash ${cash} (assets ${s.totalAssets}, lent ${s.loansOutstanding})`,
        };
      }
    } catch {
      // An RPC hiccup isn't a contract problem; try again next run.
      continue;
    }
    if (problem) {
      await db
        .prepare(
          `INSERT INTO alerts (address, kind, detail, first_seen, last_seen, resolved)
           VALUES (?, ?, ?, ?, ?, 0)
           ON CONFLICT(address, kind) DO UPDATE SET detail = excluded.detail,
             last_seen = excluded.last_seen, resolved = 0`,
        )
        .bind(address, problem.kind, problem.detail, nowMs, nowMs)
        .run();
      found.push({
        address,
        ...problem,
        firstSeen: nowMs,
        lastSeen: nowMs,
        resolved: false,
      });
    } else {
      await db
        .prepare("UPDATE alerts SET resolved = 1, last_seen = ? WHERE address = ? AND resolved = 0")
        .bind(nowMs, address)
        .run();
    }
  }

  await db
    .prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(CURSOR, String((start + picked.length) % circles.length))
    .run();
  return found;
}

export async function openAlerts(db: Db): Promise<Alert[]> {
  const { results } = await db
    .prepare(
      "SELECT address, kind, detail, first_seen, last_seen, resolved FROM alerts WHERE resolved = 0 ORDER BY first_seen",
    )
    .all<{
      address: string;
      kind: string;
      detail: string;
      first_seen: number;
      last_seen: number;
      resolved: number;
    }>();
  return results.map((r) => ({
    address: r.address,
    kind: r.kind,
    detail: r.detail,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    resolved: r.resolved === 1,
  }));
}

/** Posts alerts to a webhook (Slack/Discord-style JSON with a `text` field). Never throws. */
export async function notify(webhook: string | undefined, alerts: Alert[], fetcher = fetch) {
  if (!webhook || alerts.length === 0) return;
  const text = alerts
    .map((a) => `WealthKart alert: ${a.kind} at circle ${a.address}. ${a.detail}`)
    .join("\n");
  try {
    await fetcher(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, content: text }),
    });
  } catch {
    // Alerting must never break indexing.
  }
}
