import { avalanche, avalancheFuji } from "viem/chains";
import type { Address, Chain } from "viem";

import fuji from "./deployments/43113.json";

/**
 * Supported chains. Fuji (testnet) only until the audit. The contracts themselves no
 * longer refuse mainnet; the network is chosen at deploy time (ADR 0050).
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
 * `src/deployments/<chainId>.json`. Mainnet stays empty until the audited release.
 */
export const DEPLOYMENTS: Record<number, Deployment> = {
  [avalancheFuji.id]: toDeployment(fuji as DeploymentFile),
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
