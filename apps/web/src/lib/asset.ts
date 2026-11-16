"use client";

import { circleVaultAbi, formatUnitsDown } from "@wealthkart/sdk";
import { type Address, erc20Abi, isAddress } from "viem";
import { useReadContract } from "wagmi";

/**
 * The money a circle holds (ADR 0046): AVAX (18 decimals) or the factory's USDT (6 decimals),
 * fixed at creation. Every amount on-chain is in the asset's smallest unit, so the app formats
 * and parses through these helpers instead of assuming wei.
 */
export type AssetSymbol = "AVAX" | "USDT";

export interface CircleAsset {
  /** The ERC-20 token, or null for AVAX. */
  token: Address | null;
  symbol: AssetSymbol;
  decimals: 18 | 6;
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const AVAX: CircleAsset = { token: null, symbol: "AVAX", decimals: 18 };

/** `Config.asset` enum values (CircleVault.Asset). */
export const ASSET_ENUM = { AVAX: 0, USDT: 1 } as const;

/** What `vault.asset()` returned: zero address = AVAX, anything else = the USDT token. */
export function circleAsset(token: string | null | undefined): CircleAsset {
  if (!token || !isAddress(token) || token.toLowerCase() === ZERO_ADDRESS) return AVAX;
  return { token: token as Address, symbol: "USDT", decimals: 6 };
}

export const isToken = (a: CircleAsset): a is CircleAsset & { token: Address } => a.token !== null;

/** Amount only, e.g. "25.00". Rounds down so a balance is never overstated. */
export function fmt(units: bigint, asset: CircleAsset = AVAX, decimals = 2): string {
  return formatUnitsDown(units, asset.decimals, decimals);
}

/**
 * Amount with enough decimals that a small interest payment doesn't read as 0.00: 4 decimals
 * below 0.01 of the asset, else 2.
 */
export function fmtSmall(units: bigint, asset: CircleAsset = AVAX): string {
  const abs = units < 0n ? -units : units;
  const cent = 10n ** BigInt(asset.decimals - 2);
  return fmt(units, asset, abs !== 0n && abs < cent ? 4 : 2);
}

/** Amount with its symbol, e.g. "25.00 USDT". */
export function money(units: bigint, asset: CircleAsset = AVAX): string {
  return `${fmtSmall(units, asset)} ${asset.symbol}`;
}

/** Amount as a plain number for charts and maths that are only ever displayed. */
export function toNumber(units: bigint, asset: CircleAsset = AVAX): number {
  const one = 10n ** BigInt(asset.decimals);
  return Number(units / one) + Number(units % one) / Number(one);
}

/**
 * A typed amount ("0.5", "25", "12.345678") in the asset's smallest unit, or null when it isn't
 * a plain non-negative number or has more decimals than the asset has (USDT: 6).
 */
export function parseAmount(text: string, asset: CircleAsset = AVAX): bigint | null {
  const t = text.trim();
  const re = new RegExp(`^\\d{1,30}(\\.\\d{1,${asset.decimals}})?$`);
  if (!re.test(t)) return null;
  const [w = "0", f = ""] = t.split(".");
  return BigInt(w) * 10n ** BigInt(asset.decimals) + BigInt(f.padEnd(asset.decimals, "0"));
}

/** Units to form text without trailing zeros ("0.5", "25"), the inverse of `parseAmount`. */
export function toInputText(units: bigint, asset: CircleAsset = AVAX): string {
  const one = 10n ** BigInt(asset.decimals);
  const whole = units / one;
  const frac = (units % one).toString().padStart(asset.decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * The circle's asset from `vault.asset()`. It never changes, so it is read once and cached.
 * While loading (or with no circle) it reports AVAX with `isPending`, so callers that show
 * money should wait for `isPending` to clear before the first paint of an amount.
 */
export function useCircleAsset(circle: Address | null | undefined) {
  const q = useReadContract({
    abi: circleVaultAbi,
    address: circle ?? undefined,
    functionName: "asset",
    query: { enabled: Boolean(circle), staleTime: Infinity, gcTime: Infinity },
  });
  return {
    asset: circleAsset(q.data as string | undefined),
    isPending: Boolean(circle) && q.isPending,
    isError: q.isError,
  };
}

/** The wallet's balance of the circle's token (undefined for AVAX circles or while loading). */
export function useTokenBalance(asset: CircleAsset, owner: Address | undefined) {
  const q = useReadContract({
    abi: erc20Abi,
    address: asset.token ?? undefined,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: Boolean(asset.token && owner) },
  });
  return { balance: q.data as bigint | undefined, refetch: q.refetch };
}
