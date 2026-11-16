/**
 * Starts loading the saved (or browser) language as soon as the app's JavaScript runs, before
 * React renders, so Hindi and Marathi users see English for as short a time as possible.
 * Imported only by the app and sign-in providers; public pages never load a dictionary.
 * Safe for hydration: `useT` reads the English server snapshot until hydration ends.
 */
import { initialLocale } from "./react";
import { setLocale } from "./runtime";

if (typeof window !== "undefined") {
  const wanted = initialLocale();
  if (wanted !== "en") void setLocale(wanted);
}
