import type { MetadataRoute } from "next";

import { LEGAL_PAGES } from "@/content/legal";
import { PUBLIC_PAGES } from "@/content/pages";
import { absoluteUrl } from "@/content/site";

export const dynamic = "force-static";

/** `/sitemap.xml`: public pages only, never `/app` or `/kit` (ADR 0024). */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 },
    ...PUBLIC_PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      lastModified: p.updated,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    // Legal pages (ADR 0055).
    ...LEGAL_PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      lastModified: p.updated,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
