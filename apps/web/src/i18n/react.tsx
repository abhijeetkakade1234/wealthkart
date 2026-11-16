"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useSyncExternalStore } from "react";

import { isLocale, type Locale, LOCALE_STORAGE_KEY, localeFromBrowser } from "./config";
import {
  formatDate,
  formatNumber,
  getLocale,
  getLocaleState,
  SERVER_STATE,
  setLocale,
  subscribeLocale,
  translate,
  translatePlural,
} from "./runtime";
import type { Key, PluralKey, PluralParams, TArgs } from "./types";

/** Reads the saved language; storage can be blocked (private mode), so never throws. */
export function readSavedLocale(): Locale | null {
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

function saveLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage blocked: the choice lasts until the tab closes.
  }
}

/** Saved choice, else the browser's language if we speak it, else English. */
export function initialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  return readSavedLocale() ?? localeFromBrowser(window.navigator.languages);
}

/** Switches language and remembers it on this device. */
export async function chooseLocale(locale: Locale): Promise<boolean> {
  saveLocale(locale);
  return setLocale(locale);
}

/**
 * The active language for a component. Re-renders on a switch. The first render matches the
 * static (English) HTML; `LocaleBoot` then loads the saved language.
 */
export function useT() {
  const s = useSyncExternalStore(subscribeLocale, getLocaleState, () => SERVER_STATE);
  return useMemo(
    () => ({
      locale: s.locale,
      t: <K extends Key>(key: K, ...args: TArgs<K>) => translate(s.dict, key, ...args),
      tn: <B extends PluralKey>(base: B, count: number, params?: PluralParams<B>) =>
        translatePlural(s.locale, s.dict, base, count, params),
      formatDate: (value: Date | number, options: Intl.DateTimeFormatOptions) =>
        formatDate(value, options, s.locale),
      formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
        formatNumber(value, options, s.locale),
    }),
    [s],
  );
}

/**
 * Loads the saved or browser language once, keeps `<html lang>` in step and follows a switch
 * made in another tab. Rendered by the app and sign-in providers; renders nothing.
 */
export function LocaleBoot() {
  useEffect(() => {
    const syncLang = () => {
      document.documentElement.lang = getLocale();
    };
    const unsubscribe = subscribeLocale(syncLang);
    const wanted = initialLocale();
    if (wanted !== getLocale()) void setLocale(wanted);
    else syncLang();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCALE_STORAGE_KEY && isLocale(e.newValue)) void setLocale(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}

/** Remembers the language of a localized public page (`/hi/`, `/mr/`) so the app opens in it. */
export function RememberLocale({ locale }: { locale: Locale }) {
  useEffect(() => {
    saveLocale(locale);
  }, [locale]);
  return null;
}

const TAG = /<(\w+)>(.*?)<\/\1>/g;

/**
 * Renders a translated string with simple inline tags, e.g. "Read the <link>guide</link>".
 * Every language must use the same tag names (checked in `i18n.test.ts`). Tags can't nest.
 */
export function rich(text: string, tags: Record<string, (chunk: string) => ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TAG)) {
    const [whole, name, chunk] = m;
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const render = tags[name];
    out.push(<Fragment key={i++}>{render ? render(chunk) : chunk}</Fragment>);
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
