import { handle } from "./api";
import { viemMonitor, viemReader } from "./chain";
import { type Config, indexStep } from "./indexer";
import { checkCircles, notify } from "./monitor";
import type { PushConfig } from "./push/api";
import { viemCircleRegistry, viemMembership, viemReminderReader } from "./push/reader";
import type { Vapid } from "./push/send";
import { reminderStep } from "./push/step";
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
  /** Web Push (ADR 0052). Public key (base64url, also NEXT_PUBLIC_VAPID_PUBLIC_KEY in the app). */
  VAPID_PUBLIC_KEY?: string;
  /** Web Push private key: a secret (`wrangler secret put VAPID_PRIVATE_KEY`), never in the repo. */
  VAPID_PRIVATE_KEY?: string;
  /** VAPID contact: the site URL, so no email address is stored anywhere. */
  VAPID_SUBJECT?: string;
  /** Comma-separated sites allowed in signed reminder messages, e.g. `wealthkart.pages.dev`. */
  APP_DOMAINS?: string;
  /** E2E only: extra push endpoint prefixes (a local fake push service). Never set in production. */
  PUSH_EXTRA_ORIGINS?: string;
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

function list(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function vapidOf(env: Env): Vapid | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || "https://wealthkart.pages.dev",
  };
}

function pushConfig(env: Env): PushConfig {
  return {
    chainId: Number(env.CHAIN_ID),
    vapid: vapidOf(env),
    domains: list(env.APP_DOMAINS),
    extraOrigins: list(env.PUSH_EXTRA_ORIGINS).filter((o) =>
      /^http:\/\/(127\.0\.0\.1|localhost):/.test(o),
    ),
    isMember: viemMembership(env.RPC_URL),
    isCircle: viemCircleRegistry(env.RPC_URL, env.FACTORY),
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
      pushConfig(env),
    );
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const db = env.DB as unknown as Db;
    try {
      await indexAndMonitor(env, db);
    } finally {
      // Reminders run even when indexing hit an RPC error, and never break it (ADR 0052).
      const vapid = vapidOf(env);
      if (vapid) {
        await reminderStep(db, viemReminderReader(env.RPC_URL), vapid, Date.now()).catch(
          () => undefined,
        );
      }
    }
  },
} satisfies ExportedHandler<Env>;

async function indexAndMonitor(env: Env, db: Db) {
  const cfg = config(env);
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
}
