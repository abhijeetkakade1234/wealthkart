/**
 * Translation for server components on public pages (ADR 0057). All three dictionaries are
 * imported directly: this runs at build time only, so nothing here reaches the browser.
 * Never import this from a client component.
 */
import type { Locale } from "./config";
import { en } from "./en";
import { hi } from "./hi";
import { mr } from "./mr";
import { translate } from "./runtime";
import type { Dict, Key, TArgs } from "./types";

const DICTS: Record<Locale, Dict> = { en, hi, mr };

/** A `t` bound to one language, for a statically rendered page. */
export function serverT(locale: Locale) {
  const dict = DICTS[locale];
  return <K extends Key>(key: K, ...args: TArgs<K>) => translate(dict, key, ...args);
}
