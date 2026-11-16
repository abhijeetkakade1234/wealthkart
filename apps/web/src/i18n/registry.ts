/**
 * The English dictionary as the browser sees it (ADR 0057, bundle budget). Core namespaces are
 * always here; every other namespace registers itself when a screen imports it
 * (`import "@/i18n/en/loans"`), so its words ship in that screen's chunk instead of in every
 * page. `i18n-imports.test.ts` fails if a file uses a key without importing its namespace.
 * Server code and tests import the full `en` from `./en` instead.
 */
import { common } from "./en/common";
import { kit } from "./en/kit";
import { msg } from "./en/msg";
import { nav } from "./en/nav";
import { time } from "./en/time";
import { wallet } from "./en/wallet";
import type { Dict } from "./types";

/** Always bundled: used on nearly every app screen. */
export const CORE_NAMESPACES = ["common", "nav", "time", "msg", "kit", "wallet"] as const;

const registry: Record<string, unknown> = { common, nav, time, msg, kit, wallet };

/** The English dictionary so far; grows as screens load their namespaces. */
export const enLoaded = registry as unknown as Dict;

export function registerEn(namespace: string, words: unknown) {
  registry[namespace] = words;
}
