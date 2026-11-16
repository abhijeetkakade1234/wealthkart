import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LandingPage } from "@/components/landing/landing-page";
import {
  LANDING_BY_LOCALE,
  languageAlternates,
  localizedPath,
  OG_LOCALE,
  isPageLocale,
} from "@/content/localized";
import { ogImagePath } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isPageLocale(lang)) return {};
  const copy = LANDING_BY_LOCALE[lang];
  const url = localizedPath(lang, "/");
  const og = { url: ogImagePath("home"), width: 1200, height: 630, alt: "WealthKart" };
  return {
    title: { absolute: `WealthKart: ${copy.hero.eyebrow}` },
    description: copy.description,
    alternates: { canonical: url, languages: languageAlternates("/") },
    openGraph: {
      type: "website",
      siteName: "WealthKart",
      locale: OG_LOCALE[lang],
      url,
      description: copy.description,
      images: [og],
    },
    twitter: { card: "summary_large_image", images: [og.url] },
  };
}

/** `/hi/` and `/mr/`: the landing page in Hindi or Marathi (ADR 0049, ADR 0057). */
export default async function LocalizedHome({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isPageLocale(lang)) notFound();
  return <LandingPage locale={lang} />;
}
