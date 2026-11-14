import { pageBySlug } from "@/content/pages";
import { pageToMarkdown } from "@/lib/seo/markdown";
import { textResponse } from "@/lib/seo/text-route";

export const dynamic = "force-static";

/** Markdown twin of /security/ for answer engines (docs/seo.md §4). */
export function GET() {
  return textResponse(pageToMarkdown(pageBySlug("security")!), "text/markdown");
}
