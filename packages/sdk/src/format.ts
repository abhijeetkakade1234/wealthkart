/**
 * Display helpers. Money stays `bigint` wei everywhere; format only at the edge.
 */
const WEI_PER_AVAX = 10n ** 18n;

/** Formats wei as AVAX with a fixed number of decimals, rounding down (never overstates). */
export function formatAvax(wei: bigint, decimals = 2): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / WEI_PER_AVAX;
  const frac = abs % WEI_PER_AVAX;
  const scale = 10n ** BigInt(18 - decimals);
  const fracDigits = (frac / scale).toString().padStart(decimals, "0");
  const wholeStr = whole.toLocaleString("en-US");
  const out = decimals > 0 ? `${wholeStr}.${fracDigits}` : wholeStr;
  return negative ? `-${out}` : out;
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
