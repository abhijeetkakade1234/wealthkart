import { ANVIL_URL } from "./env";

let id = 0;
/** Raw JSON-RPC to the local anvil node (time travel, snapshots, direct contract calls). */
export async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(ANVIL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const json = (await res.json()) as { result: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/** Moves chain time forward and mines a block (e.g. to close a voting window). */
export async function increaseTime(seconds: number) {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
}

export const snapshot = () => rpc<string>("evm_snapshot");
export const revert = (snap: string) => rpc<boolean>("evm_revert", [snap]);

/** Latest block timestamp in seconds. */
export async function chainNow(): Promise<number> {
  const block = await rpc<{ timestamp: string }>("eth_getBlockByNumber", ["latest", false]);
  return Number(BigInt(block.timestamp));
}

/** Jumps chain time to `day` 00:00:01 UTC of the next calendar month, and mines a block. */
export async function warpToNextMonth(day = 2) {
  const now = new Date((await chainNow()) * 1000);
  const target = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day, 0, 0, 1) / 1000;
  await rpc("evm_setNextBlockTimestamp", [target]);
  await rpc("evm_mine");
}
