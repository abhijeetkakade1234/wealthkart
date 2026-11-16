import { handle } from "./api";
import { viemMonitor, viemReader } from "./chain";
import { type Config, indexStep } from "./indexer";
import { checkCircles, notify } from "./monitor";
import { isFull } from "./store";
import type { Db } from "./store";

/**
 * WealthKart indexer Worker (ADR 0036): a cron catches up on circle events every minute, and
 * the API serves them per circle. Only public chain data; no keys, no personal data.
 */

export interface Env {
  DB: D1Database;
  CHAIN_ID: string;
  RPC_URL: string;
  FACTORY: string;
  FROM_BLOCK: string;
  LOG_CHUNK: string;
  CONFIRMATIONS: string;
  /** Optional Slack/Discord-style webhook for contract alerts (ADR 0041). Set as a secret. */
  ALERT_WEBHOOK_URL?: string;
  /** Soft size limit for D1 in MB (ADR 0047); default 450 of the free tier's 500. */
  D1_SOFT_LIMIT_MB?: string;
}

/** Chunks one cron run may index (each is one factory + one circle getLogs per 100 circles). */
const CRON_CHUNKS = 50;

function config(env: Env): Config {
  return {
    chainId: Number(env.CHAIN_ID),
    factory: env.FACTORY,
    fromBlock: BigInt(env.FROM_BLOCK || "0"),
    chunk: BigInt(env.LOG_CHUNK || "2048"),
    confirmations: BigInt(env.CONFIRMATIONS || "1"),
    sizeLimitBytes: Number(env.D1_SOFT_LIMIT_MB || "450") * 1024 * 1024,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cfg = config(env);
    return handle(
      request,
      env.DB as unknown as Db,
      viemReader(env.RPC_URL, cfg.factory),
      cfg,
      Date.now(),
    );
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const cfg = config(env);
    const db = env.DB as unknown as Db;
    await indexStep(db, viemReader(env.RPC_URL, cfg.factory), cfg, CRON_CHUNKS);
    // Monitoring after indexing, so newly created circles are checked too.
    const alerts = await checkCircles(db, viemMonitor(env.RPC_URL), Date.now());
    if (await isFull(db)) {
      alerts.push({
        address: "indexer",
        kind: "index-full",
        detail: "D1 reached its soft size limit; new events are read from the RPC (ADR 0047).",
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        resolved: false,
      });
    }
    await notify(env.ALERT_WEBHOOK_URL, alerts);
  },
} satisfies ExportedHandler<Env>;
