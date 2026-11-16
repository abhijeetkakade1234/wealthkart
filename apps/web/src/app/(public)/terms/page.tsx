import { PublicArticle } from "@/components/public/public-article";
import { TERMS } from "@/content/legal";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata(TERMS);

export default function Page() {
  return <PublicArticle page={TERMS} />;
}
