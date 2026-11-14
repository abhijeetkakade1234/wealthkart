import { avalanche, avalancheFuji } from "viem/chains";
import type { Address, Chain } from "viem";

/**
 * Supported chains. Fuji (testnet) first; mainnet stays disabled until contracts
 * with exits are audited (CircleVault refuses to deploy on mainnet until then).
 */
export const SUPPORTED_CHAINS: readonly [Chain, ...Chain[]] = [avalancheFuji];
export const DEFAULT_CHAIN: Chain = avalancheFuji;

export const ALL_KNOWN_CHAINS: { readonly fuji: Chain; readonly avalanche: Chain } = {
  fuji: avalancheFuji,
  avalanche,
};

export interface Deployment {
  circleFactory: Address | null;
  /** Block the factory was deployed at (indexer start). */
  fromBlock: bigint | null;
}

/** Deployed addresses per chain id. Filled in by the deploy workflow. */
export const DEPLOYMENTS: Record<number, Deployment> = {
  [avalancheFuji.id]: { circleFactory: null, fromBlock: null },
  [avalanche.id]: { circleFactory: null, fromBlock: null },
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
