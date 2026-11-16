import Link from "next/link";

import { JsonLd } from "@/components/public/json-ld";
import { LEGAL_PAGES } from "@/content/legal";
import { PUBLIC_PAGES } from "@/content/pages";
import { organizationLd, websiteLd } from "@/lib/seo/json-ld";

const NAV = PUBLIC_PAGES.map((p) => ({ href: p.path, label: p.eyebrow }));

/** Legal pages (ADR 0055): footer only, in their own row. */
const LEGAL_NAV = LEGAL_PAGES.map((p) => ({ href: p.path, label: p.eyebrow }));

const linkCls = "text-muted-foreground transition-colors hover:text-foreground";

/**
 * Shared layout for public pages (/, how-it-works, rules, security, faq): calm header,
 * generous whitespace, footer with every public link plus llms.txt (ADR 0024, ADR 0025).
 * No wallet code loads here, so public pages stay light.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <JsonLd data={[organizationLd(), websiteLd()]} />
      <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-6 px-4 py-9 sm:px-10">
        <Link href="/" className="font-display text-[26px] tracking-tight">
          WealthKart
        </Link>
        <nav aria-label="Site" className="flex items-center gap-8">
          <ul className="hidden items-center gap-8 text-[14.5px] lg:flex">
            {NAV.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={linkCls}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/app/"
            className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[14px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Open app
          </Link>
        </nav>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="mt-24 border-t border-line-soft">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-4 py-16 sm:px-10 md:flex-row md:justify-between">
          <div className="max-w-[36ch]">
            <p className="font-display text-[22px] tracking-tight">WealthKart</p>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              Private savings circles for friends, on Avalanche. Running on the Fuji testnet. No
              personal data stored.
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="grid grid-cols-2 gap-x-12 gap-y-3 text-[14px]">
              {NAV.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkCls}>
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/app/" className={linkCls}>
                  Open app
                </Link>
              </li>
              <li>
                <a href="/llms.txt" className={linkCls}>
                  llms.txt
                </a>
              </li>
            </ul>
          </nav>
        </div>
        {/* Legal row (ADR 0055), kept apart from the main footer links. */}
        <div className="mx-auto max-w-[1180px] px-4 sm:px-10">
          <div className="flex flex-col gap-4 border-t border-line-soft py-8 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Legal">
              <ul className="flex flex-wrap gap-x-8 gap-y-3">
                {LEGAL_NAV.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={linkCls}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <p>Open-source software under the MIT licence. Not a bank or an investment scheme.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
