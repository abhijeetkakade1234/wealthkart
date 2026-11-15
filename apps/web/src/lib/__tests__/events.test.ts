import { describe, expect, it } from "vitest";

import { chunkRanges, normalise } from "@/lib/events";

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
