import { renderIcon } from "@/lib/seo/icon";

export const dynamic = "force-static";

export function GET() {
  return renderIcon(512);
}
