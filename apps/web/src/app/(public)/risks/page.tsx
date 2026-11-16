import { PublicArticle } from "@/components/public/public-article";
import { RISKS } from "@/content/legal";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata(RISKS);

export default function Page() {
  return <PublicArticle page={RISKS} />;
}
