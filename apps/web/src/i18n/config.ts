/**
 * Languages the app speaks (ADR 0057). English is the source of truth; Hindi and Marathi
 * mirror its keys exactly (typecheck) and its `{params}` (unit test).
 */
export const LOCALES = ["en", "hi", "mr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Each language named in itself, for the switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
};

/**
 * Tag for `Intl` formatting. English keeps "en-GB" (day before month, as the app always
 * showed); Hindi and Marathi use their India tags (lakh and crore grouping) with Latin digits,
 * because Marathi would otherwise print Devanagari digits.
 */
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en-GB",
  hi: "hi-IN-u-nu-latn",
  mr: "mr-IN-u-nu-latn",
};

/** localStorage key holding the chosen language. */
export const LOCALE_STORAGE_KEY = "wk.locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The first browser language we speak ("hi-IN" → hi, "mr" → mr, "en-US" → en), else English.
 * Languages we don't speak are skipped, so ["fr", "hi"] picks Hindi.
 */
export function localeFromBrowser(languages: readonly string[] | undefined): Locale {
  for (const lang of languages ?? []) {
    const base = lang.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
