/**
 * Share / NAV accounting (ADR 0006).
 *
 * Uses virtual shares and virtual assets so the first depositor can't inflate
 * the share price and rob later members (S-MATH-01). Rounding always favours
 * the vault: mint rounds down, redeem rounds down.
 */

/** Virtual offset (OpenZeppelin ERC-4626 style). 10^6 virtual shares per 1 virtual wei. */
export const VIRTUAL_SHARES = 10n ** 6n;
export const VIRTUAL_ASSETS = 1n;

export interface VaultTotals {
  /** Internally tracked assets in wei (cash + loans outstanding), never raw balance. */
  totalAssets: bigint;
  totalShares: bigint;
}

function mulDivDown(a: bigint, b: bigint, d: bigint): bigint {
  if (d === 0n) throw new RangeError("division by zero");
  return (a * b) / d;
}

/** Shares minted for a deposit of `assets` wei at current NAV. */
export function sharesForDeposit(assets: bigint, v: VaultTotals): bigint {
  if (assets < 0n) throw new RangeError("assets must be >= 0");
  return mulDivDown(assets, v.totalShares + VIRTUAL_SHARES, v.totalAssets + VIRTUAL_ASSETS);
}

/** Assets (wei) paid out for burning `shares`. */
export function assetsForShares(shares: bigint, v: VaultTotals): bigint {
  if (shares < 0n) throw new RangeError("shares must be >= 0");
  return mulDivDown(shares, v.totalAssets + VIRTUAL_ASSETS, v.totalShares + VIRTUAL_SHARES);
}

/** NAV per whole share, scaled by 1e18 (for display). */
export function navPerShareE18(v: VaultTotals): bigint {
  return mulDivDown(10n ** 18n, v.totalAssets + VIRTUAL_ASSETS, v.totalShares + VIRTUAL_SHARES);
}
