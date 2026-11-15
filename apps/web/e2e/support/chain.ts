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

/**
 * Sends a transaction from an anvil dev account (unlocked) and waits for its receipt.
 * For test setup only (accepting invites, paying), so the UI under test stays the focus.
 */
export async function send(tx: { from: string; to: string; data: string; value?: bigint }) {
  // Simulate first, so a revert reports its reason (custom error data) instead of only a hash.
  try {
    await rpc("eth_call", [
      {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: tx.value === undefined ? undefined : `0x${tx.value.toString(16)}`,
      },
      "latest",
    ]);
  } catch (e) {
    throw new Error(
      `Setup transaction would revert (to ${tx.to}, data ${tx.data.slice(0, 10)}): ${String(e)}`,
    );
  }
  const estimate = BigInt(
    await rpc<string>("eth_estimateGas", [
      {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: tx.value === undefined ? undefined : `0x${tx.value.toString(16)}`,
      },
    ]),
  );
  const hash = await rpc<string>("eth_sendTransaction", [
    {
      from: tx.from,
      to: tx.to,
      data: tx.data,
      // Wallets add headroom over the estimate; nested calls get only 63/64 of the gas left.
      gas: `0x${((estimate * 3n) / 2n).toString(16)}`,
      value: tx.value === undefined ? undefined : `0x${tx.value.toString(16)}`,
    },
  ]);
  for (let i = 0; i < 50; i++) {
    const receipt = await rpc<{ status: string; gasUsed: string } | null>(
      "eth_getTransactionReceipt",
      [hash],
    );
    if (receipt) {
      if (receipt.status !== "0x1") {
        const sent = await rpc<{ gas: string }>("eth_getTransactionByHash", [hash]);
        throw new Error(
          `Setup transaction reverted: ${hash} (call ${tx.data.slice(0, 10)}, gas used ${Number(receipt.gasUsed)} of ${Number(sent.gas)})`,
        );
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Setup transaction was never mined: ${hash}`);
}

/** Read-only contract call (eth_call) at the latest block. */
export const call = (to: string, data: string) => rpc<string>("eth_call", [{ to, data }, "latest"]);

/** Jumps chain time to `day` 12:00 UTC of the current calendar month (must be in the future). */
export async function warpToDayThisMonth(day: number) {
  const now = new Date((await chainNow()) * 1000);
  const target = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 12, 0, 0) / 1000;
  await rpc("evm_setNextBlockTimestamp", [target]);
  await rpc("evm_mine");
}

/** AVAX balance of an address in wei. */
export async function balanceOf(address: string): Promise<bigint> {
  return BigInt(await rpc<string>("eth_getBalance", [address, "latest"]));
}
