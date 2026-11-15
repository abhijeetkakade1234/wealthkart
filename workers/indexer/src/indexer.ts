import { circleAddresses, type Db, indexedTo, type StoredLog, saveRange } from "./store";

/**
 * The catch-up loop (ADR 0036). Reads block ranges after the cursor: first the factory's
 * new circles, then every known circle's events for the same range, so a circle created and
 * used inside one range is still complete.
 */

export interface Config {
  chainId: number;
  factory: string;
  fromBlock: bigint;
  chunk: bigint;
  confirmations: bigint;
}

/** What the indexer needs from the chain; `chain.ts` implements it with viem. */
export interface ChainReader {
  latestBlock(): Promise<bigint>;
  circlesCreated(from: bigint, to: bigint): Promise<Array<{ address: string; block: bigint }>>;
  circleLogs(addresses: string[], from: bigint, to: bigint): Promise<StoredLog[]>;
}

/** Addresses per eth_getLogs call. */
const ADDRESS_BATCH = 100;

export interface StepResult {
  indexedTo: bigint;
  /** True when the cursor reached the tip (minus confirmations). */
  caughtUp: boolean;
  chunks: number;
}

/** Indexes up to `maxChunks` ranges. Safe to run concurrently: writes are idempotent. */
export async function indexStep(
  db: Db,
  chain: ChainReader,
  cfg: Config,
  maxChunks: number,
): Promise<StepResult> {
  const start = (await indexedTo(db)) ?? cfg.fromBlock - 1n;
  const latest = await chain.latestBlock();
  const tip = latest - cfg.confirmations;
  let last = start;
  let chunks = 0;
  while (last < tip && chunks < maxChunks) {
    const from = last + 1n;
    const to = from + cfg.chunk - 1n < tip ? from + cfg.chunk - 1n : tip;
    const created = await chain.circlesCreated(from, to);
    // Known circles plus the ones created in this range (not saved yet).
    const known = await circleAddresses(db, to);
    const addresses = [...new Set([...known, ...created.map((c) => c.address.toLowerCase())])];
    const logs: StoredLog[] = [];
    for (let i = 0; i < addresses.length; i += ADDRESS_BATCH) {
      logs.push(...(await chain.circleLogs(addresses.slice(i, i + ADDRESS_BATCH), from, to)));
    }
    await saveRange(db, created, logs, to);
    last = to;
    chunks += 1;
  }
  return { indexedTo: last, caughtUp: last >= tip, chunks };
}
