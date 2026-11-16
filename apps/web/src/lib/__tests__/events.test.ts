import { describe, expect, it } from "vitest";

import { chunkRanges, fetchIndexed, normalise, reviveBigints } from "@/lib/events";

describe("event reading (D7, until the indexer lands)", () => {
  it("S-ACT-04 splits a circle's lifetime into RPC-sized block ranges", () => {
    expect(chunkRanges(100n, 100n, 2048n, 300)).toEqual({ ranges: [[100n, 100n]], partial: false });
    expect(chunkRanges(0n, 4999n, 2048n, 300)).toEqual({
      ranges: [
        [0n, 903n],
        [904n, 2951n],
        [2952n, 4999n],
      ],
      partial: false,
    });
  });

  it("S-ACT-04 keeps only the newest chunks for very old circles and says so", () => {
    const r = chunkRanges(0n, 10_000n, 1000n, 3);
    expect(r.ranges).toEqual([
      [7001n, 8000n],
      [8001n, 9000n],
      [9001n, 10_000n],
    ]);
    expect(r.partial).toBe(true);
  });

  it("S-ACT-04 normalises vault logs and ignores ones the charts don't use", () => {
    const base = { blockNumber: 7n, logIndex: 2, transactionHash: "0xabc" as const };
    const out = normalise([
      {
        ...base,
        eventName: "Contributed",
        args: { member: "0x1", period: 24323n, installment: 5n, lateFees: 1n, sharesMinted: 5n },
      },
      { ...base, eventName: "MemberAdded", args: { member: "0x1", joinPeriod: 24323n } },
      { ...base, eventName: "Voted", args: { requestId: 1n, voter: "0x1", support: true } },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ type: "contributed", period: 24323, fees: 1n, block: 7n });
    expect(out[1]).toMatchObject({ type: "joined", joinPeriod: 24323 });
  });
});

describe("indexer client (ADR 0036)", () => {
  const page = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

  it("S-IDX-06 revives bigints and leaves look-alike strings alone", () => {
    expect(reviveBigints({ a: { $n: "5" }, b: "5n", c: [{ $n: "7" }] })).toEqual({
      a: 5n,
      b: "5n",
      c: [7n],
    });
  });

  it("S-IDX-06 pages through the indexer and stops at the first page's cursor", async () => {
    const pages = [
      {
        chainId: 43113,
        indexedTo: "20",
        logs: [
          {
            eventName: "MemberAdded",
            args: { member: "0x1", joinPeriod: { $n: "24323" } },
            blockNumber: "11",
            logIndex: 0,
            transactionHash: "0xa",
          },
        ],
        next: { fromBlock: 12, fromLogIndex: 0 },
      },
      {
        chainId: 43113,
        indexedTo: "25",
        logs: [
          {
            eventName: "Contributed",
            args: { member: "0x1", period: { $n: "24323" } },
            blockNumber: "18",
            logIndex: 2,
            transactionHash: "0xb",
          },
          {
            eventName: "Contributed",
            args: { member: "0x1", period: { $n: "24324" } },
            blockNumber: "24",
            logIndex: 0,
            transactionHash: "0xc",
          },
        ],
        next: null,
      },
    ];
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      return page(pages[urls.length - 1]);
    }) as unknown as typeof fetch;
    const r = await fetchIndexed("https://idx", "0xabc", 43113, fetcher);
    expect(r!.indexedTo).toBe(20n);
    expect(r!.logs.map((l) => l.blockNumber)).toEqual([11n, 18n]); // block 24 is past the cursor
    expect(r!.logs[0]!.args.joinPeriod).toBe(24323n);
    expect(urls[1]).toBe("https://idx/v1/circles/0xabc/logs?fromBlock=12&fromLogIndex=0");
  });

  it("S-IDX-06 ignores an indexer serving another chain", async () => {
    const fetcher = (async () =>
      page({ chainId: 1, indexedTo: "5", logs: [], next: null })) as unknown as typeof fetch;
    expect(await fetchIndexed("https://idx", "0xabc", 43113, fetcher)).toBeNull();
  });
});
