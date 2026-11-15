import { handle } from "./api";
import { viemReader } from "./chain";
import { type Config, indexStep } from "./indexer";
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
    await indexStep(
      env.DB as unknown as Db,
      viemReader(env.RPC_URL, cfg.factory),
      cfg,
      CRON_CHUNKS,
    );
  },
} satisfies ExportedHandler<Env>;
