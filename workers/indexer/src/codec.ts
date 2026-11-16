/**
 * JSON that keeps bigints: every bigint becomes {"$n":"123"}. The app's reader turns them back
 * (`apps/web/src/lib/events.ts`). Plain strings are never touched, so a display name like
 * "123n" stays a string.
 */
export function encode(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? { $n: v.toString() } : v));
}

export function decode<T = unknown>(text: string): T {
  return JSON.parse(text, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1 && "$n" in v
      ? BigInt((v as { $n: string }).$n)
      : v,
  ) as T;
}
