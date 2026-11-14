import type { MetadataRoute } from "next";

import { AI_CRAWLERS, PRIVATE_PATHS, absoluteUrl } from "@/content/site";

export const dynamic = "force-static";

/** `/robots.txt`: public pages open to all crawlers incl. AI; app and kit closed (ADR 0024). */
export default function robots(): MetadataRoute.Robots {
  const disallow = [...PRIVATE_PATHS];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: [...AI_CRAWLERS], allow: "/", disallow },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
