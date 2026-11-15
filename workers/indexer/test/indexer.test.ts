import { describe, expect, it } from "vitest";

import { handle } from "../src/api";
import { decode, encode } from "../src/codec";
import { type ChainReader, type Config, indexStep } from "../src/indexer";
import { indexedTo, type StoredLog } from "../src/store";
import { memoryDb } from "./sqlite-d1";

const CIRCLE_A = "0xaaaa000000000000000000000000000000000001";
const CIRCLE_B = "0xbbbb000000000000000000000000000000000002";
const cfg: Config = {
  chainId: 43113,
  factory: "0xf",
  fromBlock: 10n,
  chunk: 5n,
  confirmations: 0n,
};

/** A fake chain: circles created at given blocks, logs at given blocks. */
function fakeChain(opts: {
  tip: bigint;
  circles: Array<{ address: string; block: bigint }>;
  logs: StoredLog[];
  fail?: boolean;
}): ChainReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    latestBlock: async () => {
      if (opts.fail) throw new Error("rpc down");
      return opts.tip;
    },
    circlesCreated: async (from, to) => {
      calls.push(`created ${from}-${to}`);
      return opts.circles.filter((c) => c.block >= from && c.block <= to);
    },
    circleLogs: async (addresses, from, to) => {
      calls.push(`logs ${from}-${to} [${addresses.length}]`);
      return opts.logs.filter(
        (l) => addresses.includes(l.address) && l.block >= from && l.block <= to,
      );
    },
  };
}

const log = (
  address: string,
  block: bigint,
  logIndex: number,
  event = "Contributed",
): StoredLog => ({
  address,
  block,
  logIndex,
  tx: `0x${block}${logIndex}`,
  event,
  args: encode({ member: "0x1", period: 24323n, installment: 5n * 10n ** 17n }),
});

describe("indexer (ADR 0036)", () => {
  it("S-IDX-01 bigints survive storage, strings that look like numbers stay strings", () => {
    const back = decode<{ a: bigint; b: string }>(encode({ a: 123n, b: "123n" }));
    expect(back.a).toBe(123n);
    expect(back.b).toBe("123n");
  });

  it("S-IDX-02 catches up in chunks and picks up a circle used in the range it was created", async () => {
    const db = memoryDb();
    const chain = fakeChain({
      tip: 22n,
      circles: [
        { address: CIRCLE_A, block: 11n },
        { address: CIRCLE_B, block: 17n },
      ],
      logs: [
        log(CIRCLE_A, 11n, 1),
        log(CIRCLE_A, 13n, 0),
        log(CIRCLE_B, 17n, 3),
        log(CIRCLE_B, 22n, 0),
      ],
    });
    const r = await indexStep(db, chain, cfg, 10);
    expect(r).toEqual({ indexedTo: 22n, caughtUp: true, chunks: 3 });
    expect(chain.calls).toContain("created 10-14");
    expect(chain.calls).toContain("logs 15-19 [2]");
    expect(await indexedTo(db)).toBe(22n);

    const res = await handle(
      new Request(`https://x/v1/circles/${CIRCLE_B}/logs`),
      db,
      chain,
      cfg,
      0,
    );
    const body = (await res.json()) as { logs: Array<{ blockNumber: string }>; known: boolean };
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(body.known).toBe(true);
    expect(body.logs.map((l) => l.blockNumber)).toEqual(["17", "22"]);
  });

  it("S-IDX-03 is safe to re-run and stops at maxChunks, resuming next time", async () => {
    const db = memoryDb();
    const chain = fakeChain({
      tip: 40n,
      circles: [{ address: CIRCLE_A, block: 10n }],
      logs: [log(CIRCLE_A, 12n, 0), log(CIRCLE_A, 33n, 0)],
    });
    expect((await indexStep(db, chain, cfg, 2)).indexedTo).toBe(19n);
    expect((await indexStep(db, chain, cfg, 10)).indexedTo).toBe(40n);
    // Re-running changes nothing.
    expect((await indexStep(db, chain, cfg, 10)).chunks).toBe(0);
    const res = await handle(
      new Request(`https://x/v1/circles/${CIRCLE_A}/logs`),
      db,
      chain,
      cfg,
      0,
    );
    const body = (await res.json()) as { logs: unknown[] };
    expect(body.logs).toHaveLength(2);
  });

  it("S-IDX-04 pages results and validates input", async () => {
    const db = memoryDb();
    const chain = fakeChain({
      tip: 14n,
      circles: [{ address: CIRCLE_A, block: 10n }],
      logs: [log(CIRCLE_A, 11n, 0), log(CIRCLE_A, 11n, 1), log(CIRCLE_A, 12n, 0)],
    });
    await indexStep(db, chain, cfg, 10);
    const page1 = (await (
      await handle(new Request(`https://x/v1/circles/${CIRCLE_A}/logs?limit=2`), db, chain, cfg, 0)
    ).json()) as { logs: unknown[]; next: { fromBlock: number; fromLogIndex: number } };
    expect(page1.logs).toHaveLength(2);
    expect(page1.next).toEqual({ fromBlock: 12, fromLogIndex: 0 });

    for (const bad of [
      "/v1/circles/not-an-address/logs",
      `/v1/circles/${CIRCLE_A}/logs?limit=0`,
      `/v1/circles/${CIRCLE_A}/logs?fromBlock=-1`,
      `/v1/circles/${CIRCLE_A}/logs?limit=99999`,
    ]) {
      expect((await handle(new Request(`https://x${bad}`), db, chain, cfg, 0)).status, bad).toBe(
        400,
      );
    }
    expect((await handle(new Request("https://x/nope"), db, chain, cfg, 0)).status).toBe(404);
    expect(
      (await handle(new Request("https://x/v1/health", { method: "POST" }), db, chain, cfg, 0))
        .status,
    ).toBe(405);
  });

  it("S-IDX-05 answers from the index when the RPC is down", async () => {
    const db = memoryDb();
    const ok = fakeChain({
      tip: 12n,
      circles: [{ address: CIRCLE_A, block: 10n }],
      logs: [log(CIRCLE_A, 11n, 0)],
    });
    await indexStep(db, ok, cfg, 10);
    const down = fakeChain({ tip: 0n, circles: [], logs: [], fail: true });
    const res = await handle(
      new Request(`https://x/v1/circles/${CIRCLE_A}/logs`),
      db,
      down,
      cfg,
      1_000_000,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[]; indexedTo: string };
    expect(body.logs).toHaveLength(1);
    expect(body.indexedTo).toBe("12");
  });
});
