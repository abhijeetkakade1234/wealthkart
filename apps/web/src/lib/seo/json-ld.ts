import type { PublicPage } from "@/content/pages";
import { SITE_NAME, SITE_SUMMARY, SITE_URL, absoluteUrl } from "@/content/site";

type Thing = Record<string, unknown>;

export function organizationLd(): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icon-512.png"),
  };
}

export function websiteLd(): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_SUMMARY,
  };
}

export function softwareApplicationLd(): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_SUMMARY,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web (installable app)",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
}

/** Schema for a public page: HowTo, FAQPage or TechArticle (docs/seo.md §3). */
export function pageLd(page: PublicPage): Thing {
  const url = absoluteUrl(page.path);
  if (page.schema === "FAQPage") {
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      url,
      mainEntity: page.sections.map((s) => ({
        "@type": "Question",
        name: s.heading,
        acceptedAnswer: { "@type": "Answer", text: s.answer },
      })),
    };
  }
  if (page.schema === "HowTo") {
    return {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: page.h1,
      description: page.description,
      url,
      step: page.sections.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.heading,
        text: s.answer,
        url: `${url}#${s.id}`,
      })),
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.h1,
    description: page.description,
    url,
    dateModified: page.updated,
    author: { "@type": "Organization", name: SITE_NAME },
  };
}

/** Serialise for a `<script type="application/ld+json">`, escaping `<` so content can't close the tag. */
export function serializeLd(data: Thing | Thing[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
