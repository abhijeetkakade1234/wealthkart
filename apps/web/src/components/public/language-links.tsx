"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { type Locale, LOCALE_NAMES, LOCALES } from "@/i18n/config";

const LOCALIZED = ["/", "/start/", "/how-it-works/"];

/** "/hi/start/" -> "/start/"; English paths are returned as they are. */
function basePath(pathname: string): string {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const m = /^\/(hi|mr)(\/.*)$/.exec(p);
  return m ? m[2]! : p;
}

/**
 * The public footer's language row (ADR 0057): each language links to the same page in that
 * language when it exists (`/`, `/start/`, `/how-it-works/`), else to that language's home.
 * Plain links, so crawlers see them in the static HTML.
 */
export function LanguageLinks({ locale, label }: { locale: Locale; label: string }) {
  const base = basePath(usePathname() ?? "/");
  const target = (l: Locale) => {
    const path = LOCALIZED.includes(base) ? base : "/";
    if (l === "en") return LOCALIZED.includes(base) ? base : "/";
    return `/${l}${path}`;
  };
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-x-6 gap-y-3" data-testid="language-links">
        {LOCALES.map((l) => (
          <li key={l}>
            {l === locale ? (
              <span lang={l} aria-current="true" className="font-medium text-foreground">
                {LOCALE_NAMES[l]}
              </span>
            ) : (
              <Link
                href={target(l)}
                lang={l}
                hrefLang={l}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {LOCALE_NAMES[l]}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
