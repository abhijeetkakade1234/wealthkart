import { PublicArticle } from "@/components/public/public-article";
import { SECURITY } from "@/content/pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata(SECURITY);

export default function Page() {
  return <PublicArticle page={SECURITY} />;
}
