/**
 * Display helpers. Money stays `bigint` wei everywhere; format only at the edge.
 */
/**
 * Formats an amount in an asset's smallest unit (wei for AVAX, 1e-6 for USDT) with a fixed
 * number of shown decimals, rounding down so it never overstates (ADR 0046).
 */
export function formatUnitsDown(units: bigint, unitDecimals: number, decimals = 2): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const one = 10n ** BigInt(unitDecimals);
  const whole = abs / one;
  const frac = abs % one;
  const shown = Math.min(decimals, unitDecimals);
  const fracDigits = (frac / 10n ** BigInt(unitDecimals - shown))
    .toString()
    .padStart(shown, "0")
    .padEnd(decimals, "0");
  const wholeStr = whole.toLocaleString("en-US");
  const out = decimals > 0 ? `${wholeStr}.${fracDigits}` : wholeStr;
  return negative ? `-${out}` : out;
}

/** Formats wei as AVAX with a fixed number of decimals, rounding down (never overstates). */
export function formatAvax(wei: bigint, decimals = 2): string {
  return formatUnitsDown(wei, 18, decimals);
}

/** 0x3f1c…a1c2 */
export function shortAddress(address: string, head = 4, tail = 4): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return address;
  return `${address.slice(0, 2 + head)}…${address.slice(-tail)}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Period index (year * 12 + month - 1) to "December 2026". */
export function periodLabel(period: number | bigint): string {
  const p = Number(period);
  return `${MONTHS[p % 12]} ${Math.floor(p / 12)}`;
}
