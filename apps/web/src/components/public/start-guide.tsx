import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { PublicPage } from "@/content/pages";
import type { Locale } from "@/i18n/config";
import { serverT } from "@/i18n/server";
import type { PlainKey } from "@/i18n/types";
import { pageLd } from "@/lib/seo/json-ld";
import { cn } from "@/lib/utils";

import { JsonLd } from "./json-ld";
import { BlockView, formatDate } from "./public-article";
import { StartHeroArt, StepArt } from "./start-art";
import { StartMotion } from "./start-motion";

import "./start.css";

const ROOT_ID = "start-guide";

/**
 * "Step 4: Get free test AVAX for network fees" -> ["Step 4", "Get free test AVAX ..."].
 * Any word then a number works, so "कदम 4: ..." and "पायरी 4: ..." split the same way.
 */
function splitStep(heading: string): [string, string] {
  const m = /^([^:\d]+ \d+):\s*(.+)$/.exec(heading);
  return m ? [m[1]!, m[2]!] : ["", heading];
}

/** Short labels for the step chips at the top (`site` namespace, ADR 0057). */
const SHORT: Record<string, PlainKey> = {
  "install-core": "site.startGuide.installCore",
  "create-wallet": "site.startGuide.createWallet",
  "backup-wallet": "site.startGuide.backupWallet",
  "get-avax": "site.startGuide.getAvax",
  "get-usdt": "site.startGuide.getUsdt",
  join: "site.startGuide.join",
};

/**
 * The onboarding guide at `/start` (ADR 0054): the same content model as the other public
 * pages (so it also feeds the `.md` twin, llms.txt, the sitemap and HowTo JSON-LD), laid out
 * as numbered steps with a line drawing each. Static HTML; a tiny client script only adds the
 * stroke tracing, and never with reduced motion.
 */
export function StartGuide({
  page,
  testnet,
  locale = "en",
}: {
  page: PublicPage;
  testnet: boolean;
  locale?: Locale;
}) {
  const t = serverT(locale);
  return (
    <main id={ROOT_ID} className="mx-auto max-w-[1180px] px-4 sm:px-10">
      <JsonLd data={pageLd(page)} />
      <StartMotion rootId={ROOT_ID} />

      <header className="grid items-center gap-12 pb-20 pt-16 sm:pt-24 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-20">
        <div className="start-rise max-w-[640px]">
          <p className="text-xs uppercase tracking-[0.14em] text-brand">{page.eyebrow}</p>
          <h1 className="mt-6 font-display text-[clamp(40px,6vw,72px)] leading-[1.0] tracking-tight">
            {page.h1}
          </h1>
          <p className="mt-8 text-[17.5px] leading-relaxed text-muted-foreground">{page.intro}</p>
          <p
            className={cn(
              "mt-8 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px]",
              testnet ? "bg-brand-soft text-brand" : "bg-secondary text-foreground",
            )}
            data-testid="start-network"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {testnet ? t("site.startGuide.testnet") : t("site.startGuide.mainnet")}
          </p>
          <p className="mt-6 text-[13px] text-muted-foreground">
            {t("site.updated", { date: formatDate(page.updated, locale) })}
          </p>
        </div>
        <StartHeroArt className="mx-auto h-auto w-full max-w-[420px]" />
      </header>

      <nav aria-label={t("site.startGuide.steps")} className="border-t border-line-soft pt-12">
        <ol className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {page.sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="start-chip flex items-center gap-4 rounded-[12px] border border-border bg-card px-5 py-4 hover:border-foreground/30"
              >
                <span className="font-mono text-[12.5px] text-brand">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[14.5px]">
                  {SHORT[s.id] ? t(SHORT[s.id]!) : splitStep(s.heading)[1]}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-24 flex flex-col gap-28 sm:gap-36">
        {page.sections.map((s, i) => {
          const [step, title] = splitStep(s.heading);
          return (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-h`}
              className="grid scroll-mt-24 gap-10 lg:grid-cols-[260px_minmax(0,760px)] lg:gap-20"
            >
              <div className="flex items-end gap-6 lg:flex-col lg:items-start lg:gap-8">
                <span
                  aria-hidden
                  className="font-display text-[64px] leading-none text-brand/80 lg:text-[88px]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <StepArt
                  id={s.id}
                  className="start-step-art h-auto w-[150px] sm:w-[180px] lg:w-[220px]"
                />
              </div>
              <div className="min-w-0">
                <h2
                  id={`${s.id}-h`}
                  className="font-display text-[clamp(28px,3.4vw,40px)] leading-[1.1] tracking-tight"
                >
                  {step && (
                    <span className="mb-3 block font-sans text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
                      {step}
                    </span>
                  )}
                  {title}
                </h2>
                <p className="mt-6 text-[17px] leading-[1.7]">{s.answer}</p>
                {s.blocks && s.blocks.length > 0 && (
                  <div className="mt-9 flex flex-col gap-7">
                    {s.blocks.map((b, j) => (
                      <BlockView key={j} block={b} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-36 rounded-[20px] border border-border bg-card px-6 py-14 text-center sm:px-16 sm:py-20">
        <h2 className="font-display text-[clamp(30px,4vw,48px)] leading-[1.05] tracking-tight">
          {t("site.startGuide.readyTitle")}
        </h2>
        <p className="mx-auto mt-6 max-w-[46ch] text-[16.5px] leading-relaxed text-muted-foreground">
          {t("site.startGuide.readyText")}
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href="/login/"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-primary bg-primary px-7 text-[15px] font-semibold text-primary-foreground transition-transform hover:bg-black active:scale-[0.97]"
          >
            {t("site.landing.openTheApp")}
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
              aria-hidden
            />
          </Link>
          <Link
            href="/faq/"
            className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-7 text-[15px] font-semibold transition-colors hover:bg-secondary active:scale-[0.97]"
          >
            {t("site.startGuide.readFaq")}
          </Link>
        </div>
      </section>
    </main>
  );
}
