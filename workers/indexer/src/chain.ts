import { circleFactoryAbi, circleVaultAbi } from "@wealthkart/sdk";
import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  http,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";

import { encode } from "./codec";
import type { ChainReader } from "./indexer";
import type { MonitorReader } from "./monitor";
import type { StoredLog } from "./store";

/** `asset()` (ADR 0046): zero for AVAX circles, else the token. Inline so old ABIs still build. */
const assetAbi = parseAbi(["function asset() view returns (address)"]);

/** viem-backed solvency reads for monitoring (ADR 0041). USDT circles use the token balance. */
export function viemMonitor(rpcUrl: string): MonitorReader {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return {
    async solvency(circle) {
      const address = circle as Address;
      const asset = await client.readContract({ address, abi: assetAbi, functionName: "asset" });
      const [balance, totalAssets, loansOutstanding] = await Promise.all([
        asset === zeroAddress
          ? client.getBalance({ address })
          : client.readContract({
              address: asset,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            }),
        client.readContract({ address, abi: circleVaultAbi, functionName: "totalAssets" }),
        client.readContract({ address, abi: circleVaultAbi, functionName: "loansOutstanding" }),
      ]);
      return {
        balance,
        totalAssets: totalAssets as bigint,
        loansOutstanding: loansOutstanding as bigint,
      };
    },
  };
}

/** viem-backed chain reader for the indexer. Unknown logs are skipped, never stored raw. */
export function viemReader(rpcUrl: string, factory: string): ChainReader {
  const client = createPublicClient({ transport: http(rpcUrl) });

  return {
    latestBlock: () => client.getBlockNumber(),

    async circlesCreated(from, to) {
      const events = await client.getContractEvents({
        address: factory as Address,
        abi: circleFactoryAbi,
        eventName: "CircleCreated",
        fromBlock: from,
        toBlock: to,
      });
      return events.map((e) => ({
        address: (e.args as { circle: string }).circle.toLowerCase(),
        block: e.blockNumber ?? to,
      }));
    },

    async circleLogs(addresses, from, to) {
      if (addresses.length === 0) return [];
      const raw = await client.getLogs({
        address: addresses as Address[],
        fromBlock: from,
        toBlock: to,
      });
      const out: StoredLog[] = [];
      for (const log of raw) {
        try {
          const decoded = decodeEventLog({
            abi: circleVaultAbi,
            data: log.data,
            topics: log.topics,
          });
          out.push({
            address: log.address.toLowerCase(),
            block: log.blockNumber ?? to,
            logIndex: log.logIndex ?? 0,
            tx: log.transactionHash ?? "",
            event: decoded.eventName,
            args: encode(decoded.args),
          });
        } catch {
          // Not a vault event we know (e.g. a future version); skip it.
        }
      }
      return out;
    },
  };
}
