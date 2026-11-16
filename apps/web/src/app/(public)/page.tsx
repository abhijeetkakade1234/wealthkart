import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";
import { LANDING_DESCRIPTION } from "@/content/landing";
import { languageAlternates } from "@/content/localized";
import { SITE_SUMMARY } from "@/content/site";
import { ogImagePath } from "@/lib/seo/metadata";

const OG = { url: ogImagePath("home"), width: 1200, height: 630, alt: "WealthKart" };

export const metadata: Metadata = {
  description: LANDING_DESCRIPTION,
  // hreflang links to `/hi/` and `/mr/` (ADR 0057).
  alternates: { canonical: "/", languages: languageAlternates("/") },
  openGraph: {
    type: "website",
    siteName: "WealthKart",
    url: "/",
    description: SITE_SUMMARY,
    images: [OG],
  },
  twitter: { card: "summary_large_image", images: [OG.url] },
};

/**
 * Landing page (ADR 0049): plain words, generous space, one signature scroll moment.
 * Copy lives in `src/content/landing.ts`; sections in `src/components/landing/`.
 */
export default function Home() {
  return <LandingPage locale="en" />;
}
