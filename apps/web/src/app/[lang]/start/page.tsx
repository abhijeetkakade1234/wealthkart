import { chainForNetwork } from "@wealthkart/sdk";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StartGuide } from "@/components/public/start-guide";
import { languageAlternates, OG_LOCALE, isPageLocale, START_BY_LOCALE } from "@/content/localized";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isPageLocale(lang)) return {};
  return pageMetadata(START_BY_LOCALE[lang], {
    languages: languageAlternates("/start/"),
    ogLocale: OG_LOCALE[lang],
  });
}

/** `/hi/start/` and `/mr/start/`: the onboarding guide in Hindi or Marathi (ADR 0054, 0057). */
export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isPageLocale(lang)) notFound();
  const testnet = Boolean(chainForNetwork(process.env.NEXT_PUBLIC_NETWORK).testnet);
  return <StartGuide page={START_BY_LOCALE[lang]} testnet={testnet} locale={lang} />;
}
