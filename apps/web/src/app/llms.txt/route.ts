import { llmsTxt } from "@/lib/seo/markdown";
import { textResponse } from "@/lib/seo/text-route";

export const dynamic = "force-static";

export function GET() {
  return textResponse(llmsTxt(), "text/plain");
}
