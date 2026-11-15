/**
 * Deterministic randomness for generated art. Same address (any letter case) gives the
 * same picture on every device, with no network and no stored state.
 */

/** FNV-1a over the lower-cased address. Returns an unsigned 32-bit seed. */
export function seedFromAddress(address: string): number {
  const s = address.trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for picking shapes. Returns floats in [0, 1). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks one item; `rand` must return [0, 1). */
export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

/** Float in [min, max), rounded to 2 decimals so SVG output is stable and short. */
export function between(rand: () => number, min: number, max: number): number {
  return Math.round((min + rand() * (max - min)) * 100) / 100;
}
