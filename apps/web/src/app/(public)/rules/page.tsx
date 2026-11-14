import { PublicArticle } from "@/components/public/public-article";
import { RULES } from "@/content/pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata(RULES);

export default function Page() {
  return <PublicArticle page={RULES} />;
}
