import { avalanche, avalancheFuji } from "viem/chains";
import type { Address, Chain } from "viem";

import fuji from "./deployments/43113.json";
import mainnet from "./deployments/43114.json";

/**
 * Chains the app can target. Each build targets exactly one, picked from the environment
 * with `chainForNetwork` (ADR 0051). Fuji is the default until the audit.
 */
export const SUPPORTED_CHAINS: readonly [Chain, ...Chain[]] = [avalancheFuji, avalanche];
export const DEFAULT_CHAIN: Chain = avalancheFuji;

/** Network names accepted in the environment (`NEXT_PUBLIC_NETWORK`, deploy inputs). */
export type Network = "fuji" | "mainnet";

/**
 * The chain for a network name from the environment (ADR 0051). Empty means Fuji. Anything
 * other than `fuji` or `mainnet` throws, so a typo fails the build instead of silently
 * pointing the app at the wrong network.
 */
export function chainForNetwork(network: string | undefined): Chain {
  const n = (network ?? "").trim().toLowerCase();
  if (n === "" || n === "fuji") return avalancheFuji;
  if (n === "mainnet") return avalanche;
  throw new Error(`Unknown network "${network}". Use fuji or mainnet.`);
}

export const ALL_KNOWN_CHAINS: { readonly fuji: Chain; readonly avalanche: Chain } = {
  fuji: avalancheFuji,
  avalanche,
};

export interface Deployment {
  circleFactory: Address | null;
  /** Block the factory was deployed at (indexer start). */
  fromBlock: bigint | null;
}

interface DeploymentFile {
  circleFactory: string | null;
  fromBlock: number | null;
}

function toDeployment(file: DeploymentFile): Deployment {
  return {
    circleFactory: (file.circleFactory as Address | null) ?? null,
    fromBlock: file.fromBlock === null ? null : BigInt(file.fromBlock),
  };
}

/**
 * Deployed addresses per chain id, written by `script/DeployFactory.s.sol` into
 * `src/deployments/<chainId>.json`. `null` means not deployed on that chain yet.
 */
export const DEPLOYMENTS: Record<number, Deployment> = {
  [avalancheFuji.id]: toDeployment(fuji as DeploymentFile),
  [avalanche.id]: toDeployment(mainnet as DeploymentFile),
};

export function isSupportedChain(chainId: number | undefined): boolean {
  return chainId !== undefined && SUPPORTED_CHAINS.some((c) => c.id === chainId);
}

export function explorerTxUrl(chainId: number, hash: string): string | null {
  const chain = Object.values(ALL_KNOWN_CHAINS).find((c) => c.id === chainId);
  const base = chain?.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const chain = Object.values(ALL_KNOWN_CHAINS).find((c) => c.id === chainId);
  const base = chain?.blockExplorers?.default.url;
  return base ? `${base}/address/${address}` : null;
}
