import { legalPageBySlug } from "@/content/legal";
import { pageToMarkdown } from "@/lib/seo/markdown";
import { textResponse } from "@/lib/seo/text-route";

export const dynamic = "force-static";

/** Markdown twin of /terms/ for answer engines (docs/seo.md §4, ADR 0055). */
export function GET() {
  return textResponse(pageToMarkdown(legalPageBySlug("terms")!), "text/markdown");
}
