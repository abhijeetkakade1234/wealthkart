import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/public/json-ld";
import { PUBLIC_PAGES } from "@/content/pages";
import { SITE_SUMMARY } from "@/content/site";
import { softwareApplicationLd } from "@/lib/seo/json-ld";
import { ogImagePath } from "@/lib/seo/metadata";

const OG = { url: ogImagePath("home"), width: 1200, height: 630, alt: "WealthKart" };

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "WealthKart",
    url: "/",
    description: SITE_SUMMARY,
    images: [OG],
  },
  twitter: { card: "summary_large_image", images: [OG.url] },
};

/**
 * Landing page placeholder. The real landing page is designed later (PLAN.md, ADR 0025);
 * this keeps the Gallery look so the build and theme can be checked end to end.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-[1180px] px-4 sm:px-10">
      <JsonLd data={softwareApplicationLd()} />
      <section className="py-24 sm:py-40">
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Savings circles on Avalanche
        </p>
        <h1 className="mt-6 max-w-[14ch] font-display text-[clamp(44px,6.2vw,84px)] leading-[0.98] tracking-tight">
          Save together. <em className="text-brand">Borrow</em> by vote.
        </h1>
        <p className="mt-7 max-w-[40ch] text-[17.5px] leading-relaxed text-muted-foreground">
          A private circle for friends: everyone adds AVAX each month, loans are decided by the
          group, and the contract keeps the books. No one holds the money but the circle.
        </p>
        <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-[15px]">
          {PUBLIC_PAGES.map((p) => (
            <li key={p.slug}>
              <Link
                href={p.path}
                className="text-brand underline-offset-4 transition-colors hover:underline"
              >
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
