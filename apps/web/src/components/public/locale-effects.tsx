"use client";

import { useEffect } from "react";

import { type Locale, LOCALE_STORAGE_KEY } from "@/i18n/config";

/**
 * On `/hi/` and `/mr/` pages (ADR 0057): keeps `<html lang>` right after client navigation
 * (the static HTML already has it, see `scripts/localize-html.mjs`) and remembers the language
 * so "Open app" opens in it. Imports only the config, never a dictionary, so the page stays
 * light. Storage can be blocked; that is fine.
 */
export function LocaleEffects({ locale }: { locale: Locale }) {
  useEffect(() => {
    const before = document.documentElement.lang;
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Private mode or blocked storage: the app falls back to the browser language.
    }
    return () => {
      document.documentElement.lang = before || "en";
    };
  }, [locale]);
  return null;
}
