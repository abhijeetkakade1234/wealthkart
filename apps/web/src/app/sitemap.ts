import type { MetadataRoute } from "next";

import { LEGAL_PAGES } from "@/content/legal";
import {
  isLocalizedPath,
  languageAlternates,
  LOCALIZED_PATHS,
  localizedPath,
  PAGE_LOCALES,
} from "@/content/localized";
import { PUBLIC_PAGES } from "@/content/pages";
import { absoluteUrl } from "@/content/site";

export const dynamic = "force-static";

/** hreflang alternates as absolute URLs, for pages that exist in Hindi and Marathi (ADR 0057). */
function alternatesFor(path: string): MetadataRoute.Sitemap[number]["alternates"] {
  if (!isLocalizedPath(path)) return undefined;
  const langs = languageAlternates(path);
  return {
    languages: Object.fromEntries(Object.entries(langs).map(([k, v]) => [k, absoluteUrl(v)])),
  };
}

const withAlternates = (path: string) => {
  const alternates = alternatesFor(path);
  return alternates ? { alternates } : {};
};

/** `/sitemap.xml`: public pages only, never `/app` or `/kit` (ADR 0024). */
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Map(PUBLIC_PAGES.map((p) => [p.path, p.updated]));
  return [
    { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1, ...withAlternates("/") },
    ...PUBLIC_PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      lastModified: p.updated,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      ...withAlternates(p.path),
    })),
    // Hindi and Marathi copies of the landing page, /start and /how-it-works (ADR 0057).
    ...PAGE_LOCALES.flatMap((locale) =>
      LOCALIZED_PATHS.map((path) => ({
        url: absoluteUrl(localizedPath(locale, path)),
        ...(updated.has(path) ? { lastModified: updated.get(path) } : {}),
        changeFrequency: "monthly" as const,
        priority: path === "/" ? 0.9 : 0.7,
        ...withAlternates(path),
      })),
    ),
    // Legal pages (ADR 0055).
    ...LEGAL_PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      lastModified: p.updated,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
