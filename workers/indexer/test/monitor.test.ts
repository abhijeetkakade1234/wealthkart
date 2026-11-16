import { describe, expect, it } from "vitest";

import { handle } from "../src/api";
import type { ChainReader, Config } from "../src/indexer";
import { checkCircles, type MonitorReader, notify } from "../src/monitor";
import { saveRange } from "../src/store";
import { memoryDb } from "./sqlite-d1";

const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const cfg: Config = {
  chainId: 43113,
  factory: "0xf",
  fromBlock: 0n,
  chunk: 10n,
  confirmations: 0n,
};
const idleChain: ChainReader = {
  latestBlock: async () => 0n,
  circlesCreated: async () => [],
  circleLogs: async () => [],
};

function reader(state: Record<string, { balance: bigint; assets: bigint; lent: bigint } | "fail">) {
  return {
    solvency: async (c: string) => {
      const s = state[c];
      if (!s || s === "fail") throw new Error("rpc");
      return { balance: s.balance, totalAssets: s.assets, loansOutstanding: s.lent };
    },
  } satisfies MonitorReader;
}

describe("contract monitoring (ADR 0041)", () => {
  it("S-MON-01 flags a circle holding less than its cash, clears it once fixed", async () => {
    const db = memoryDb();
    await saveRange(
      db,
      [
        { address: A, block: 1n },
        { address: B, block: 1n },
      ],
      [],
      1n,
    );

    const bad = await checkCircles(
      db,
      reader({
        [A]: { balance: 10n, assets: 10n, lent: 0n }, // fine
        [B]: { balance: 3n, assets: 10n, lent: 2n }, // cash 8, holds 3
      }),
      1000,
    );
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ address: B, kind: "insolvent" });

    const res = await handle(new Request("https://x/v1/alerts"), db, idleChain, cfg, 0);
    const body = (await res.json()) as { alerts: Array<{ address: string }> };
    expect(body.alerts.map((a) => a.address)).toEqual([B]);

    await checkCircles(
      db,
      reader({
        [A]: { balance: 10n, assets: 10n, lent: 0n },
        [B]: { balance: 8n, assets: 10n, lent: 2n },
      }),
      2000,
    );
    const after = (await (
      await handle(new Request("https://x/v1/alerts"), db, idleChain, cfg, 0)
    ).json()) as { alerts: unknown[] };
    expect(after.alerts).toHaveLength(0);
  });

  it("S-MON-02 refused payouts waiting to be withdrawn don't raise false alarms; RPC errors are skipped", async () => {
    const db = memoryDb();
    await saveRange(
      db,
      [
        { address: A, block: 1n },
        { address: B, block: 1n },
      ],
      [],
      1n,
    );
    const found = await checkCircles(
      db,
      reader({ [A]: { balance: 15n, assets: 10n, lent: 0n }, [B]: "fail" }),
      1000,
    );
    expect(found).toHaveLength(0);
  });

  it("S-MON-03 checks circles round robin in batches", async () => {
    const db = memoryDb();
    await saveRange(
      db,
      [
        { address: A, block: 1n },
        { address: B, block: 1n },
      ],
      [],
      1n,
    );
    const seen: string[] = [];
    const spy: MonitorReader = {
      solvency: async (c) => {
        seen.push(c);
        return { balance: 1n, totalAssets: 1n, loansOutstanding: 0n };
      },
    };
    await checkCircles(db, spy, 1, 1);
    await checkCircles(db, spy, 2, 1);
    await checkCircles(db, spy, 3, 1);
    expect(seen).toEqual([A, B, A]);
  });

  it("S-MON-04 posts alerts to the webhook and never throws", async () => {
    const posts: string[] = [];
    const fetcher = (async (_u: string, init?: RequestInit) => {
      posts.push(String(init?.body));
      return new Response(null);
    }) as unknown as typeof fetch;
    await notify(
      "https://hook",
      [{ address: A, kind: "insolvent", detail: "x", firstSeen: 1, lastSeen: 1, resolved: false }],
      fetcher,
    );
    expect(posts[0]).toContain("insolvent");
    const broken = (async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    await expect(
      notify(
        "https://hook",
        [{ address: A, kind: "k", detail: "d", firstSeen: 1, lastSeen: 1, resolved: false }],
        broken,
      ),
    ).resolves.toBeUndefined();
    await expect(notify(undefined, [], fetcher)).resolves.toBeUndefined();
  });
});
