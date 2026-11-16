/**
 * Translation runtime (ADR 0057): a tiny typed dictionary layer, no library.
 *
 * - English is bundled; Hindi and Marathi load on demand (`import()`), so English users never
 *   download them.
 * - `t(key, params)` works anywhere (React or not) and reads the active language at call time.
 *   React components use `useT()` (react.tsx) so they re-render when the language changes.
 * - Plurals: keys ending `_one` / `_other`, picked with `Intl.PluralRules`; `tn(base, count)`.
 * - Dates and numbers: `formatDate` / `formatNumber` with `hi-IN` / `mr-IN` (lakh and crore
 *   grouping). Money keeps going through `src/lib/asset.ts`; amounts stay in AVAX or USDT.
 */
import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "./config";
import { en } from "./en";
import type { Dict, Key, PluralKey, PluralParams, TArgs } from "./types";

const loaders: Record<Locale, () => Promise<Dict>> = {
  en: async () => en,
  hi: () => import("./hi").then((m) => m.hi),
  mr: () => import("./mr").then((m) => m.mr),
};

export interface LocaleState {
  locale: Locale;
  dict: Dict;
}

let state: LocaleState = { locale: DEFAULT_LOCALE, dict: en };
const listeners = new Set<() => void>();
let pending: Locale | null = null;

export function getLocale(): Locale {
  return state.locale;
}

/** For `useSyncExternalStore`: a new object each time the language changes. */
export function getLocaleState(): LocaleState {
  return state;
}

/** Server and hydration snapshot: the static HTML is always English. */
export const SERVER_STATE: LocaleState = { locale: DEFAULT_LOCALE, dict: en };

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function apply(locale: Locale, dict: Dict) {
  if (state.locale === locale && state.dict === dict) return;
  state = { locale, dict };
  for (const l of listeners) l();
}

/**
 * Switches the language, loading its dictionary first. If the load fails (offline on first
 * use) the app stays in the current language and the promise resolves to false.
 */
export async function setLocale(locale: Locale): Promise<boolean> {
  pending = locale;
  try {
    const dict = await loaders[locale]();
    // A later switch wins over a slower earlier one.
    if (pending !== locale) return false;
    apply(locale, dict);
    return true;
  } catch {
    return false;
  } finally {
    if (pending === locale) pending = null;
  }
}

/** Uses an already-loaded dictionary at once (server-rendered localized pages, tests). */
export function applyDictionary(locale: Locale, dict: Dict) {
  apply(locale, dict);
}

function lookup(dict: Dict, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

const PARAM = /\{(\w+)\}/g;

export function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(PARAM, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Translates `key` in a given dictionary (server components on `/hi/` and `/mr/` pages). */
export function translate<K extends Key>(dict: Dict, key: K, ...args: TArgs<K>): string {
  const text = lookup(dict, key) ?? lookup(en, key) ?? key;
  return interpolate(text, args[0] as Record<string, string | number> | undefined);
}

/** Translates `key` in the active language. */
export function t<K extends Key>(key: K, ...args: TArgs<K>): string {
  return translate(state.dict, key, ...args);
}

/** "one" or "other" for this count in this language (Hindi treats 0 as one, like 1). */
export function pluralCategory(locale: Locale, count: number): "one" | "other" {
  return new Intl.PluralRules(INTL_LOCALE[locale]).select(count) === "one" ? "one" : "other";
}

/** Plural-aware translate in a given dictionary; `{count}` is filled in for you. */
export function translatePlural<B extends PluralKey>(
  locale: Locale,
  dict: Dict,
  base: B,
  count: number,
  params?: PluralParams<B>,
): string {
  const key = `${base}_${pluralCategory(locale, count)}`;
  const text = lookup(dict, key) ?? lookup(en, key) ?? key;
  return interpolate(text, { ...(params as Record<string, string | number>), count });
}

/** Plural-aware `t`: `tn("time.hoursAgo", 3)` → "3 hours ago". */
export function tn<B extends PluralKey>(base: B, count: number, params?: PluralParams<B>): string {
  return translatePlural(state.locale, state.dict, base, count, params);
}

/** `Intl` tag of the active language. */
export function intlLocale(locale: Locale = state.locale): string {
  return INTL_LOCALE[locale];
}

const dateCache = new Map<string, Intl.DateTimeFormat>();

/** Dates in the active language. Pass `timeZone: "UTC"` for on-chain deadlines (ADR 0014). */
export function formatDate(
  value: Date | number,
  options: Intl.DateTimeFormatOptions,
  locale: Locale = state.locale,
): string {
  const id = `${locale}|${JSON.stringify(options)}`;
  let f = dateCache.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat(INTL_LOCALE[locale], options);
    dateCache.set(id, f);
  }
  return f.format(value);
}

/** Plain numbers (counts, chart ticks) in the active language; hi/mr group in lakh and crore. */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale: Locale = state.locale,
): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], options).format(value);
}
