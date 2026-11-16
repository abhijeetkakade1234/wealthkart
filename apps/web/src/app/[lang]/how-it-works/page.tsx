import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicArticle } from "@/components/public/public-article";
import {
  HOW_IT_WORKS_BY_LOCALE,
  languageAlternates,
  OG_LOCALE,
  isPageLocale,
} from "@/content/localized";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isPageLocale(lang)) return {};
  return pageMetadata(HOW_IT_WORKS_BY_LOCALE[lang], {
    languages: languageAlternates("/how-it-works/"),
    ogLocale: OG_LOCALE[lang],
  });
}

/** `/hi/how-it-works/` and `/mr/how-it-works/` (ADR 0057). */
export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isPageLocale(lang)) notFound();
  return <PublicArticle page={HOW_IT_WORKS_BY_LOCALE[lang]} locale={lang} />;
}
