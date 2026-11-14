import { PUBLIC_PAGES } from "@/content/pages";
import { renderOg } from "@/lib/seo/og";

export const dynamic = "force-static";
export const dynamicParams = false;

/** Static Open Graph cards: `/og/home.png` plus one per public page (`/og/faq.png`). */
export function generateStaticParams() {
  return [{ file: "home.png" }, ...PUBLIC_PAGES.map((p) => ({ file: `${p.slug}.png` }))];
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const slug = (await params).file.replace(/\.png$/, "");
  const page = PUBLIC_PAGES.find((p) => p.slug === slug);
  return page
    ? renderOg(page.eyebrow, page.h1)
    : renderOg("Savings circles on Avalanche", "Save together. Borrow by vote.");
}
