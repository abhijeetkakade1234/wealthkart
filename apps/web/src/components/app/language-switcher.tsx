"use client";

import { Check, Languages } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Locale, LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { chooseLocale, useT } from "@/i18n/react";
import { t as tNow } from "@/i18n/runtime";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

async function pick(locale: Locale) {
  const ok = await chooseLocale(locale);
  // Toast in the new language, read after the switch.
  if (ok) notify.success(tNow("nav.languageChanged"));
}

/** Compact language menu for the app header and the sign-in page (ADR 0057). */
export function LanguageMenu({ className }: { className?: string }) {
  const { t, locale } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("nav.language")}
        data-testid="language-menu"
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-2.5 text-[13px] text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Languages className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <span className="uppercase" lang={locale}>
          {locale}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1.5">
        <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">
          {t("nav.language")}
        </DropdownMenuLabel>
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l}
            onSelect={() => void pick(l)}
            className="flex items-center gap-2 py-2"
          >
            <span lang={l}>{LOCALE_NAMES[l]}</span>
            {l === locale && (
              <Check className="ml-auto size-4 text-brand" strokeWidth={1.5} aria-hidden />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
