import type { Metadata } from "next";

import type { PublicPage } from "@/content/pages";
import { SITE_NAME } from "@/content/site";

/** Static OG card for a page, rendered at build by `app/og/[file]/route.ts`. */
export function ogImagePath(slug: string): string {
  return `/og/${slug}.png`;
}

/**
 * Per-page metadata: title, description, canonical, Open Graph, Twitter (docs/seo.md §2).
 * Pages that exist in Hindi and Marathi pass their hreflang `languages` and OG `locale`
 * (ADR 0057).
 */
export function pageMetadata(
  page: Pick<PublicPage, "title" | "description" | "path" | "slug">,
  i18n: { languages?: Record<string, string>; ogLocale?: string } = {},
): Metadata {
  const image = { url: ogImagePath(page.slug), width: 1200, height: 630, alt: page.title };
  return {
    title: page.title,
    description: page.description,
    alternates: i18n.languages
      ? { canonical: page.path, languages: i18n.languages }
      : { canonical: page.path },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      ...(i18n.ogLocale ? { locale: i18n.ogLocale } : {}),
      title: page.title,
      description: page.description,
      url: page.path,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [image.url],
    },
  };
}
