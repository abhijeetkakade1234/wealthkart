import type { Metadata } from "next";

import { LandingMotion } from "@/components/landing/landing-motion";
import {
  Audience,
  FaqTeaser,
  Features,
  FinalCta,
  Hero,
  OneMonth,
  Safety,
  Steps,
} from "@/components/landing/sections";
import { JsonLd } from "@/components/public/json-ld";
import { LANDING_DESCRIPTION } from "@/content/landing";
import { SITE_SUMMARY } from "@/content/site";
import { softwareApplicationLd } from "@/lib/seo/json-ld";
import { ogImagePath } from "@/lib/seo/metadata";

import "@/components/landing/landing.css";

const OG = { url: ogImagePath("home"), width: 1200, height: 630, alt: "WealthKart" };

export const metadata: Metadata = {
  description: LANDING_DESCRIPTION,
  alternates: { canonical: "/" },
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
 * Static HTML first; GSAP loads after idle, only here, and never with reduced motion.
 */
export default function Home() {
  return (
    <main data-landing>
      <JsonLd data={softwareApplicationLd()} />
      <Hero />
      <Steps />
      <OneMonth />
      <Features />
      <Safety />
      <Audience />
      <FaqTeaser />
      <FinalCta />
      <LandingMotion />
    </main>
  );
}
