import type { Locale } from "@/i18n/config";

import { LANDING_HI } from "./hi/landing";
import { HOW_IT_WORKS_HI, START_HI } from "./hi/pages";
import { LANDING, type LandingCopy } from "./landing";
import { LANDING_MR } from "./mr/landing";
import { HOW_IT_WORKS_MR, START_MR } from "./mr/pages";
import { HOW_IT_WORKS, type PublicPage, START } from "./pages";

/**
 * Public pages that also exist in Hindi and Marathi (ADR 0057): static routes under `/hi/`
 * and `/mr/` with hreflang links. Every other public page is English only.
 */
export const LOCALIZED_PATHS = ["/", "/start/", "/how-it-works/"] as const;
export type LocalizedPath = (typeof LOCALIZED_PATHS)[number];

/** The languages with their own static pages (English lives at the root). */
export const PAGE_LOCALES = ["hi", "mr"] as const satisfies readonly Locale[];
export type PageLocale = (typeof PAGE_LOCALES)[number];

export const LANDING_BY_LOCALE: Record<Locale, LandingCopy> = {
  en: LANDING,
  hi: LANDING_HI,
  mr: LANDING_MR,
};

export const START_BY_LOCALE: Record<Locale, PublicPage> = {
  en: START,
  hi: START_HI,
  mr: START_MR,
};

export const HOW_IT_WORKS_BY_LOCALE: Record<Locale, PublicPage> = {
  en: HOW_IT_WORKS,
  hi: HOW_IT_WORKS_HI,
  mr: HOW_IT_WORKS_MR,
};

export function isLocalizedPath(path: string): path is LocalizedPath {
  return (LOCALIZED_PATHS as readonly string[]).includes(path);
}

/** "/start/" in Hindi is "/hi/start/"; English keeps the path. */
export function localizedPath(locale: Locale, path: LocalizedPath): string {
  return locale === "en" ? path : `/${locale}${path}`;
}

/**
 * Where a link for `path` should go in `locale`: the localized page when there is one, else
 * the English page (FAQ, rules, security, legal).
 */
export function linkFor(locale: Locale, path: string): string {
  return isLocalizedPath(path) ? localizedPath(locale, path) : path;
}

/** hreflang alternates for a localized page: en, hi, mr and x-default (English). */
export function languageAlternates(path: LocalizedPath): Record<string, string> {
  return {
    en: path,
    hi: localizedPath("hi", path),
    mr: localizedPath("mr", path),
    "x-default": path,
  };
}

/** Open Graph locale per language. */
export const OG_LOCALE: Record<Locale, string> = { en: "en_GB", hi: "hi_IN", mr: "mr_IN" };

export function isPageLocale(value: string): value is PageLocale {
  return (PAGE_LOCALES as readonly string[]).includes(value);
}
