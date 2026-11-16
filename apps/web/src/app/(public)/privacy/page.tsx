import { PublicArticle } from "@/components/public/public-article";
import { PRIVACY } from "@/content/legal";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata(PRIVACY);

export default function Page() {
  return <PublicArticle page={PRIVACY} />;
}
