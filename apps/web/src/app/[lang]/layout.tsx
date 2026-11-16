import { notFound } from "next/navigation";

import { LocaleEffects } from "@/components/public/locale-effects";
import { PublicFrame } from "@/components/public/public-frame";
import { isPageLocale, PAGE_LOCALES, type PageLocale } from "@/content/localized";

/** Only `/hi/` and `/mr/` exist; any other first segment is a 404 (static export). */
export const dynamicParams = false;

export function generateStaticParams(): { lang: PageLocale }[] {
  return PAGE_LOCALES.map((lang) => ({ lang }));
}

/**
 * Hindi and Marathi public pages (ADR 0057): landing, `/start` and `/how-it-works`, statically
 * rendered with the same header and footer as the English pages. `<html lang>` is set in the
 * static HTML by `scripts/localize-html.mjs` and on client navigation by `LocaleEffects`.
 */
export default async function LocalizedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isPageLocale(lang)) notFound();
  return (
    <PublicFrame locale={lang}>
      <LocaleEffects locale={lang} />
      {children}
    </PublicFrame>
  );
}
