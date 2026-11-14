import { PublicArticle } from "@/components/public/public-article";
import { HOW_IT_WORKS } from "@/content/pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata(HOW_IT_WORKS);

export default function Page() {
  return <PublicArticle page={HOW_IT_WORKS} />;
}
