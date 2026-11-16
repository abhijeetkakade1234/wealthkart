import { decode } from "./codec";
import { type ChainReader, type Config, indexStep } from "./indexer";
import { openAlerts } from "./monitor";
import { handlePush, type PushConfig } from "./push/api";
import type { Fetcher } from "./push/send";
import {
  checkedAt,
  circleLogs,
  type Db,
  dbSize,
  indexedTo,
  isFull,
  isKnownCircle,
  markChecked,
} from "./store";

/**
 * HTTP API (ADR 0036). Read-only, public chain data, so CORS is open and nothing is secret.
 *
 *   GET /v1/health
 *   GET /v1/alerts           open monitoring alerts (ADR 0041)
 *   GET /v1/circles/:address/logs?fromBlock=&fromLogIndex=&limit=
 *   POST /v1/push/*          payment reminders (ADR 0052), see `push/api.ts`
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_LIMIT = 2000;
const DEFAULT_LIMIT = 1000;
/** A request catches up first when the last check is older than this. */
const FRESH_MS = 5_000;
/** Chunks a request may index before answering, so it stays fast. */
const REQUEST_CHUNKS = 4;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function intParam(url: URL, name: string, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  if (!/^\d{1,16}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= max ? n : null;
}

/** Brings the index close to the tip before answering, at most every FRESH_MS. */
async function catchUp(db: Db, chain: ChainReader, cfg: Config, nowMs: number) {
  if (nowMs - (await checkedAt(db)) < FRESH_MS) return;
  await markChecked(db, nowMs);
  await indexStep(db, chain, cfg, REQUEST_CHUNKS);
}

export async function handle(
  request: Request,
  db: Db,
  chain: ChainReader,
  cfg: Config,
  nowMs: number,
  push?: PushConfig,
  fetcher?: Fetcher,
): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(request.url);
  if (url.pathname.startsWith("/v1/push/")) {
    const off: PushConfig = { chainId: cfg.chainId, vapid: null, domains: [], extraOrigins: [] };
    // Circles must be known (factory-created) to get reminders; a circle made a moment ago may
    // not be indexed yet, so catch up first, like a logs request does.
    if (push?.vapid && /^\/v1\/push\/(subscribe|circle)$/.test(url.pathname)) {
      try {
        await catchUp(db, chain, cfg, nowMs);
      } catch {
        // RPC trouble: use what is indexed.
      }
    }
    return handlePush(request, url.pathname, db, push ?? off, nowMs, json, fetcher);
  }
  if (request.method !== "GET") return json({ error: "Only GET is supported." }, 405);

  if (url.pathname === "/v1/health") {
    const to = await indexedTo(db);
    return json({
      chainId: cfg.chainId,
      indexedTo: to === null ? null : to.toString(),
      sizeBytes: await dbSize(db),
      full: await isFull(db),
      push: Boolean(push?.vapid),
    });
  }

  if (url.pathname === "/v1/alerts") {
    return json({ chainId: cfg.chainId, alerts: await openAlerts(db) });
  }

  const m = url.pathname.match(/^\/v1\/circles\/([^/]+)\/logs$/);
  if (!m) return json({ error: "Not found." }, 404);
  const address = m[1]!;
  if (!ADDRESS.test(address)) return json({ error: "That isn't a circle address." }, 400);
  const fromBlock = intParam(url, "fromBlock", 0);
  const fromLogIndex = intParam(url, "fromLogIndex", 0, 1_000_000);
  const limit = intParam(url, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  if (fromBlock === null || fromLogIndex === null || limit === null || limit === 0) {
    return json({ error: "Bad paging parameters." }, 400);
  }

  try {
    await catchUp(db, chain, cfg, nowMs);
  } catch {
    // RPC trouble: answer from what is already indexed; the app reads the rest itself.
  }

  const to = await indexedTo(db);
  const rows = await circleLogs(db, address, fromBlock, fromLogIndex, limit + 1);
  const page = rows.slice(0, limit);
  const more = rows.length > limit ? rows[limit]! : null;
  return json(
    {
      chainId: cfg.chainId,
      known: await isKnownCircle(db, address),
      indexedTo: to === null ? null : to.toString(),
      logs: page.map((r) => ({
        eventName: r.event,
        // Kept in the bigint-safe encoding; the app revives it.
        args: JSON.parse(r.args) as unknown,
        blockNumber: String(r.block),
        logIndex: r.log_index,
        transactionHash: r.tx,
      })),
      next: more ? { fromBlock: more.block, fromLogIndex: more.log_index } : null,
    },
    200,
    { "cache-control": "public, max-age=5" },
  );
}

/** Exported for tests: decode a stored args string. */
export const decodeArgs = decode;
