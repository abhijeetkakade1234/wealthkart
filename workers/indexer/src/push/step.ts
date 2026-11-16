import type { Db } from "../store";
import type { ReminderReader } from "./reader";
import { type CircleFacts, compose, freshOnly, remindersFor } from "./schedule";
import { type Fetcher, sendPush, type Vapid } from "./send";
import {
  deleteSub,
  dropWatch,
  dueWatches,
  markSent,
  prune,
  sentStages,
  setNextAt,
  subsOf,
} from "./store";

/**
 * The reminder cron step (ADR 0052). Runs inside the indexer's every-minute cron, after indexing.
 * Each (wallet, circle) pair is looked at about once an hour: every run takes the pairs whose
 * `next_at` has passed, a small batch at a time, so the work is spread across the hour and stays
 * inside the Worker's CPU and subrequest limits. A pair whose pushes didn't all fit in this run's
 * budget keeps its `next_at` and goes first next minute.
 */

export interface StepOptions {
  /** Pairs read per run. */
  batch: number;
  /** Pushes per run (each is one subrequest). */
  pushBudget: number;
  /** Seconds between two looks at the same pair. */
  every: number;
}

export const STEP_DEFAULTS: StepOptions = { batch: 10, pushBudget: 20, every: 3600 };

/** After a failed chain read, try the pair again this much later. */
const RETRY_SEC = 15 * 60;

export interface StepReport {
  checked: number;
  sent: number;
  dropped: number;
}

export async function reminderStep(
  db: Db,
  reader: ReminderReader,
  vapid: Vapid,
  nowMs: number,
  opts: StepOptions = STEP_DEFAULTS,
  fetcher?: Fetcher,
): Promise<StepReport> {
  const now = Math.floor(nowMs / 1000);
  const report: StepReport = { checked: 0, sent: 0, dropped: 0 };
  // Housekeeping once an hour (the cron runs every minute).
  if (now % 3600 < 60) await prune(db, now);
  const rows = await dueWatches(db, now, opts.batch);
  if (rows.length === 0) return report;

  // Circle facts once per circle, then every member's facts in parallel (batched RPC).
  const circles = new Map<string, Promise<CircleFacts | null>>();
  for (const r of rows) {
    if (!circles.has(r.circle)) {
      circles.set(
        r.circle,
        reader.circle(r.circle).catch(() => null),
      );
    }
  }
  const facts = await Promise.all(
    rows.map(async (r) => {
      const c = await circles.get(r.circle)!;
      if (!c) return null;
      try {
        return { c, m: await reader.member(c, r.address) };
      } catch {
        return null;
      }
    }),
  );

  let budget = opts.pushBudget;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    const f = facts[i];
    report.checked += 1;
    if (!f) {
      await setNextAt(db, r.address, r.circle, now + RETRY_SEC);
      continue;
    }
    const { c, m } = f;
    // Left the circle and nothing waiting for them: stop watching.
    if (!m.active && !m.exit && m.withdrawable === 0n) {
      await dropWatch(db, r.address, r.circle);
      report.dropped += 1;
      continue;
    }
    const fresh = freshOnly(
      remindersFor(c, m, r.kinds, now),
      await sentStages(db, r.address, r.circle),
    );
    const notes = compose(c, fresh);
    if (notes.length === 0) {
      await setNextAt(db, r.address, r.circle, now + opts.every);
      continue;
    }
    const devices = await subsOf(db, r.address);
    if (devices.length === 0) {
      await dropWatch(db, r.address, r.circle);
      report.dropped += 1;
      continue;
    }
    let finished = true;
    for (const note of notes) {
      if (budget < devices.length) {
        finished = false;
        break;
      }
      let delivered = false;
      for (const d of devices) {
        budget -= 1;
        const res = await sendPush(
          d,
          { title: note.title, body: note.body, url: note.url, tag: note.tag, at: note.at },
          vapid,
          fetcher,
        );
        if (res === "sent") {
          delivered = true;
          report.sent += 1;
        } else if (res === "gone") {
          await deleteSub(db, d.endpoint);
        }
      }
      // Recorded once any device took it; a run where every device failed tries again later.
      if (delivered) await markSent(db, r.address, r.circle, note.topics, now);
    }
    if (finished) await setNextAt(db, r.address, r.circle, now + opts.every);
  }
  return report;
}
