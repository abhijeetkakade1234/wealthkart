"use client";

import { Languages } from "lucide-react";

import { isLocale, type Locale, LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { chooseLocale, useT } from "@/i18n/react";
import { t as tNow } from "@/i18n/runtime";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

async function pick(locale: Locale) {
  const ok = await chooseLocale(locale);
  // Toast in the new language, read after the switch.
  if (ok) notify.success(tNow("nav.languageChanged"));
}

/**
 * Compact language picker for the app header and the sign-in page (ADR 0057). A native
 * <select> under a pill: the phone's own picker, keyboard and screen reader support, and no
 * menu library on pages that don't already load one.
 */
export function LanguageMenu({ className }: { className?: string }) {
  const { t, locale } = useT();
  return (
    <label
      className={cn(
        "relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 text-[13px] text-foreground transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-secondary",
        className,
      )}
    >
      <Languages className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <span className="uppercase" aria-hidden>
        {locale}
      </span>
      <select
        aria-label={t("nav.language")}
        data-testid="language-menu"
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) void pick(e.target.value);
        }}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Segmented language choice for Settings. */
export function LanguageSwitcher() {
  const { t, locale } = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("nav.language")}
      className="inline-flex flex-wrap gap-1 rounded-full border border-border p-1"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === locale}
          lang={l}
          onClick={() => void pick(l)}
          className={cn(
            "h-9 rounded-full px-4 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            l === locale
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
