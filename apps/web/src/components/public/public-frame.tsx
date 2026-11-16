import Link from "next/link";

import { JsonLd } from "@/components/public/json-ld";
import { linkFor } from "@/content/localized";
import type { Locale } from "@/i18n/config";
import { serverT } from "@/i18n/server";
import type { PlainKey } from "@/i18n/types";
import { organizationLd, websiteLd } from "@/lib/seo/json-ld";

import { LanguageLinks } from "./language-links";
import "@/i18n/en/site";

/** Public help pages, in nav order (same as `PUBLIC_PAGES`). */
const NAV: { path: string; label: PlainKey }[] = [
  { path: "/how-it-works/", label: "site.howItWorks" },
  { path: "/rules/", label: "site.rules" },
  { path: "/security/", label: "site.security" },
  { path: "/faq/", label: "site.faq" },
  { path: "/start/", label: "site.start" },
];

/** Legal pages (ADR 0055): footer only, in their own row. English only. */
const LEGAL_NAV: { path: string; label: PlainKey }[] = [
  { path: "/privacy/", label: "site.privacy" },
  { path: "/terms/", label: "site.terms" },
  { path: "/risks/", label: "site.risks" },
];

const linkCls = "text-muted-foreground transition-colors hover:text-foreground";

/**
 * Header and footer for every public page (ADR 0024, ADR 0025), in English or, on `/hi/` and
 * `/mr/`, in Hindi or Marathi (ADR 0057). Links go to the localized page when one exists and
 * to the English page otherwise (marked `hrefLang="en"`). No wallet code loads here.
 */
export function PublicFrame({
  locale = "en",
  children,
}: {
  locale?: Locale;
  children: React.ReactNode;
}) {
  const t = serverT(locale);
  const nav = NAV.map((n) => {
    const href = linkFor(locale, n.path);
    const englishOnly = locale !== "en" && href === n.path;
    return { href, label: t(n.label), englishOnly };
  });
  const home = linkFor(locale, "/");
  const english = (only: boolean) => (only ? { hrefLang: "en", title: t("site.englishOnly") } : {});

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <JsonLd data={[organizationLd(), websiteLd()]} />
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-6 px-4 py-9 sm:px-10">
        <Link href={home} className="font-display text-[26px] tracking-tight">
          WealthKart
        </Link>
        <nav aria-label={t("site.navLabel")} className="flex items-center gap-8">
          <ul className="hidden items-center gap-8 text-[14.5px] lg:flex">
            {nav.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkCls} {...english(l.englishOnly)}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/app/"
            className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-medium whitespace-nowrap text-background transition-opacity hover:opacity-90"
          >
            {t("site.openApp")}
          </Link>
        </nav>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-24 border-t border-line-soft">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-4 py-16 sm:px-10 md:flex-row md:justify-between">
          <div className="max-w-[36ch]">
            <p className="font-display text-[22px] tracking-tight">WealthKart</p>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              {t("site.about")}
            </p>
          </div>
          <nav aria-label={t("site.footerNav")}>
            <ul className="grid grid-cols-2 gap-x-12 gap-y-3 text-[14px]">
              {nav.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkCls} {...english(l.englishOnly)}>
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/app/" className={linkCls}>
                  {t("site.openApp")}
                </Link>
              </li>
              <li>
                <a href="/llms.txt" className={linkCls}>
                  llms.txt
                </a>
              </li>
            </ul>
          </nav>
        </div>
        {/* Language row (ADR 0057). */}
        <div className="mx-auto max-w-[1180px] px-4 sm:px-10">
          <div className="border-t border-line-soft py-8 text-[13.5px]">
            <LanguageLinks locale={locale} label={t("site.languageNav")} />
          </div>
        </div>
        {/* Legal row (ADR 0055), kept apart from the main footer links. */}
        <div className="mx-auto max-w-[1180px] px-4 sm:px-10">
          <div className="flex flex-col gap-4 border-t border-line-soft py-8 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label={t("site.legalNav")}>
              <ul className="flex flex-wrap gap-x-8 gap-y-3">
                {LEGAL_NAV.map((l) => (
                  <li key={l.path}>
                    <Link href={l.path} className={linkCls} {...english(locale !== "en")}>
                      {t(l.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p>{t("site.licence")}</p>
          </div>
          {locale !== "en" && (
            <p
              role="note"
              data-testid="legal-english-note"
              className="max-w-[70ch] pb-10 text-[13px] leading-relaxed text-muted-foreground"
            >
              {t("site.legalNote")}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
