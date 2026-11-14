import { PublicArticle } from "@/components/public/public-article";
import { FAQ } from "@/content/pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata(FAQ);

export default function Page() {
  return <PublicArticle page={FAQ} />;
}
