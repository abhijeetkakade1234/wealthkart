import { PublicArticle } from "@/components/public/public-article";
import { languageAlternates } from "@/content/localized";
import { HOW_IT_WORKS } from "@/content/pages";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata(HOW_IT_WORKS, {
  languages: languageAlternates("/how-it-works/"),
});

export default function Page() {
  return <PublicArticle page={HOW_IT_WORKS} />;
}
