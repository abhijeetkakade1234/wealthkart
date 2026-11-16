import { JsonLd } from "@/components/public/json-ld";
import type { Locale } from "@/i18n/config";
import { softwareApplicationLd } from "@/lib/seo/json-ld";

import { LandingMotion } from "./landing-motion";
import { Audience, FaqTeaser, Features, FinalCta, Hero, OneMonth, Safety, Steps } from "./sections";

import "./landing.css";

/**
 * The landing page body (ADR 0049) in any language (ADR 0057): `/` renders it in English,
 * `/hi/` and `/mr/` in Hindi and Marathi. Static HTML first; GSAP loads after idle, only here,
 * and never with reduced motion.
 */
export function LandingPage({ locale = "en" }: { locale?: Locale }) {
  return (
    <main data-landing>
      {locale === "en" && <JsonLd data={softwareApplicationLd()} />}
      <Hero locale={locale} />
      <Steps locale={locale} />
      <OneMonth locale={locale} />
      <Features locale={locale} />
      <Safety locale={locale} />
      <Audience locale={locale} />
      <FaqTeaser locale={locale} />
      <FinalCta locale={locale} />
      <LandingMotion />
    </main>
  );
}
