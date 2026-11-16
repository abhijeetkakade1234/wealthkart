/**
 * Landing page sections (ADR 0049). Server components: plain HTML and SVG that read
 * correctly with no JavaScript. Motion hooks are data attributes only (`data-reveal`,
 * `data-line`, `data-draw`, `data-depth`, `data-month-*`), picked up by `motion.ts`.
 * Every section takes a `locale` (ADR 0057): copy from `content/localized.ts`, labels from the
 * `site` namespace. English is the default and renders exactly as before.
 */
import {
  ArrowRight,
  ChevronDown,
  Hourglass,
  LockKeyhole,
  ScanEye,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type { LandingCopy, SafetyId } from "@/content/landing";
import { LANDING_BY_LOCALE, linkFor } from "@/content/localized";
import type { Locale } from "@/i18n/config";
import { serverT } from "@/i18n/server";
import { cn } from "@/lib/utils";

import { LeaveDiagram, RingDiagram, SaveDiagram, VoteDiagram } from "./diagrams";
import { HeroArt } from "./hero-art";
import { PotDiagram } from "./pot-diagram";

interface SectionProps {
  locale?: Locale;
}

/** Copy, labels and link targets for one language (server only). */
function copyFor(locale: Locale = "en"): {
  copy: LandingCopy;
  t: ReturnType<typeof serverT>;
  href: (path: string) => string;
} {
  return {
    copy: LANDING_BY_LOCALE[locale],
    t: serverT(locale),
    href: (path) => linkFor(locale, path),
  };
}

const WRAP = "mx-auto w-full max-w-[1180px] px-4 sm:px-10";
const SECTION = "py-24 md:py-[92px]";
const EYEBROW = "text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground";
const H2 =
  "mt-5 font-display text-[clamp(36px,5vw,60px)] font-normal leading-[1.02] tracking-[-0.015em]";
const LEAD = "text-[17px] leading-[1.7] text-muted-foreground";

/*
 * Pill buttons with the same look as `components/ui/button` (ADR 0025). Not imported from
 * there: that file pulls in `radix-ui`, whose client modules would ship with this page.
 */
const BTN =
  "land-press inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border px-7 text-[15px] font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-brand/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-4 [&_svg]:shrink-0";
const BTN_PRIMARY = `${BTN} border-primary bg-primary text-primary-foreground hover:border-black hover:bg-black`;
const BTN_OUTLINE = `${BTN} border-border bg-card text-foreground hover:bg-secondary`;

function PrimaryCta({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/login/" className={cn(BTN_PRIMARY, "group")} data-testid="cta-open-app">
      {children}
      <ArrowRight className="land-nudge" strokeWidth={1.75} aria-hidden />
    </Link>
  );
}

function SecondaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={BTN_OUTLINE}>
      {children}
    </Link>
  );
}

function SectionHead({
  id,
  eyebrow,
  heading,
  className,
  children,
}: {
  id: string;
  eyebrow: string;
  heading: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("max-w-[34rem]", className)} data-reveal>
      <p className={EYEBROW}>{eyebrow}</p>
      <h2 id={id} className={H2}>
        {heading}
      </h2>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- hero */

export function Hero({ locale }: SectionProps) {
  const { copy, t, href } = copyFor(locale);
  const hero = copy.hero;
  const at = hero.h1.indexOf(hero.h1Em);
  const before = at >= 0 ? hero.h1.slice(0, at) : hero.h1;
  const after = at >= 0 ? hero.h1.slice(at + hero.h1Em.length) : "";
  return (
    <section
      aria-labelledby="hero-title"
      className={cn(
        WRAP,
        "grid items-center gap-16 pb-24 pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-20 md:pb-[92px] md:pt-24",
      )}
      data-hero
    >
      <div>
        <p
          className="land-rise inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] text-muted-foreground"
          style={{ animationDelay: "0ms" }}
        >
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          {hero.status}
        </p>
        <p className={cn(EYEBROW, "land-rise mt-10")} style={{ animationDelay: "80ms" }}>
          {hero.eyebrow}
        </p>
        <h1
          id="hero-title"
          className="land-rise mt-5 font-display md:max-w-[12ch] text-[clamp(48px,7vw,92px)] font-normal leading-[0.96] tracking-[-0.02em]"
          style={{ animationDelay: "140ms" }}
        >
          {before}
          {at >= 0 && <em className="text-brand">{hero.h1Em}</em>}
          {after}
        </h1>
        <p
          className={cn(LEAD, "land-rise mt-8 max-w-[40ch] text-[18px]")}
          style={{ animationDelay: "240ms" }}
        >
          {hero.lead}
        </p>
        <div
          className="land-rise mt-11 flex flex-wrap items-center gap-3"
          style={{ animationDelay: "340ms" }}
        >
          <PrimaryCta>{t("site.landing.openTheApp")}</PrimaryCta>
          <SecondaryCta href="#how-it-works">{t("site.landing.howItWorks")}</SecondaryCta>
        </div>
        <p className="land-rise mt-7 text-[13.5px] text-faint" style={{ animationDelay: "420ms" }}>
          {hero.note}{" "}
          <Link
            href={href("/start/")}
            className="font-medium text-brand underline-offset-4 hover:underline"
            data-testid="hero-start-link"
          >
            {hero.startLink}
          </Link>
        </p>
      </div>
      <HeroArt className="mx-auto h-auto w-full max-w-[560px]" label={t("site.landing.heroArt")} />
    </section>
  );
}

/* ---------------------------------------------------------------- steps */

export function Steps({ locale }: SectionProps) {
  const { copy, t, href } = copyFor(locale);
  return (
    <section
      aria-labelledby="how-title"
      id="how-it-works"
      data-tone="paper"
      className={cn(WRAP, SECTION, "land-band scroll-mt-8")}
    >
      <SectionHead id="how-title" eyebrow={copy.steps.eyebrow} heading={copy.steps.heading} />
      <ol className="mt-20 grid gap-14 sm:grid-cols-2 md:mt-28 lg:grid-cols-4 lg:gap-10">
        {copy.steps.steps.map((s, i) => (
          <li key={s.title} data-reveal>
            <div className="h-px w-full bg-border" data-line aria-hidden />
            <p className="mt-7 font-display text-[44px] leading-none text-faint tabular">
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-6 text-[19px] font-semibold tracking-[-0.01em]">{s.title}</h3>
            <p className="mt-3 text-[15.5px] leading-[1.7] text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-16 text-[15px]" data-reveal>
        <Link
          href={href("/how-it-works/")}
          className="group inline-flex items-center gap-1.5 text-brand underline-offset-4 hover:underline"
        >
          {t("site.landing.fullWalkthrough")}
          <ArrowRight className="land-nudge size-4" strokeWidth={1.75} aria-hidden />
        </Link>
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- one month (signature) */

export function OneMonth({ locale }: SectionProps) {
  const { copy, t } = copyFor(locale);
  return (
    <section
      aria-labelledby="month-title"
      id="one-month"
      className="border-y border-line-soft bg-card"
    >
      <div className="land-month-track" data-month-track>
        <div className="land-month-stage">
          <div
            className={cn(
              WRAP,
              "grid gap-10 py-28 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:grid-rows-[auto_1fr] md:gap-x-20 md:gap-y-12 md:py-24",
            )}
          >
            <div className="md:col-start-1 md:row-start-1">
              <p className={EYEBROW}>{copy.month.eyebrow}</p>
              <h2 id="month-title" className={H2}>
                {copy.month.heading}
              </h2>
            </div>
            <div className="land-month-art flex justify-center md:col-start-2 md:row-span-2 md:row-start-1 md:items-center">
              <PotDiagram
                className="h-auto w-full max-w-[500px]"
                names={[...copy.month.friends, copy.month.borrower]}
                labels={{
                  art: t("site.landing.potArt"),
                  interest: t("site.landing.potInterest"),
                  asks: t("site.landing.potAsks"),
                  tally: t("site.landing.potTally", { n: "{n}" }),
                }}
              />
            </div>
            <div className="md:col-start-1 md:row-start-2">
              <ol className="land-month-steps grid gap-8">
                {copy.month.steps.map((s, i) => (
                  <li key={s.title} data-step={i} className="grid grid-cols-[2.25rem_1fr] gap-x-3">
                    <span className="pt-0.5 font-mono text-[13px] text-faint tabular">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-[18px] font-semibold tracking-[-0.01em]">{s.title}</h3>
                      <p className="mt-2 max-w-[42ch] text-[15.5px] leading-[1.7] text-muted-foreground">
                        {s.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div
                className="land-month-progress mt-10 h-px w-full max-w-[22rem] bg-border"
                aria-hidden
              >
                <div
                  className="h-px w-full origin-left bg-brand"
                  style={{ transform: "scaleX(0)" }}
                  data-month-progress
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- features */

const FEATURE_ART = { save: SaveDiagram, borrow: VoteDiagram, leave: LeaveDiagram } as const;

export function Features({ locale }: SectionProps) {
  const { copy } = copyFor(locale);
  return (
    <section
      aria-labelledby="features-title"
      id="what-you-can-do"
      data-tone="cobalt"
      className={cn(WRAP, SECTION, "land-band")}
    >
      <SectionHead
        id="features-title"
        eyebrow={copy.features.eyebrow}
        heading={copy.features.heading}
      />
      <ul className="mt-20 grid gap-6 md:mt-28 md:grid-cols-3">
        {copy.features.items.map((f) => {
          const Art = FEATURE_ART[f.id];
          return (
            <li
              key={f.id}
              className="land-card rounded-[14px] border border-border bg-card p-8 sm:p-10"
              data-reveal
            >
              <Art className="h-auto w-[180px]" />
              <h3 className="mt-10 font-display text-[30px] font-normal leading-tight">
                {f.title}
              </h3>
              <p className="mt-4 text-[15.5px] leading-[1.7] text-muted-foreground">{f.text}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- safety */

const SAFETY_ICON: Record<SafetyId, LucideIcon> = {
  "no-one-holds": LockKeyhole,
  "slow-rules": Hourglass,
  public: ScanEye,
  private: UserRoundX,
};

export function Safety({ locale }: SectionProps) {
  const { copy, t } = copyFor(locale);
  return (
    <section aria-labelledby="safety-title" id="safety" className={cn(WRAP, SECTION)}>
      <div className="grid gap-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-24">
        <SectionHead id="safety-title" eyebrow={copy.safety.eyebrow} heading={copy.safety.heading}>
          <p className="mt-8 text-[15px]">
            <Link
              href="/security/"
              className="group inline-flex items-center gap-1.5 text-brand underline-offset-4 hover:underline"
            >
              {t("site.landing.safetyLink")}
              <ArrowRight className="land-nudge size-4" strokeWidth={1.75} aria-hidden />
            </Link>
          </p>
        </SectionHead>
        <div>
          <ul className="grid gap-x-12 gap-y-14 sm:grid-cols-2">
            {copy.safety.items.map((item) => {
              const Icon = SAFETY_ICON[item.id];
              return (
                <li key={item.id} className="group" data-reveal>
                  <span className="grid size-12 place-items-center rounded-full border border-border bg-card">
                    <Icon
                      className="land-lift size-5 text-foreground"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </span>
                  <h3 className="mt-6 text-[19px] font-semibold tracking-[-0.01em]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-[15.5px] leading-[1.7] text-muted-foreground">
                    {item.text}
                  </p>
                </li>
              );
            })}
          </ul>
          <p
            className="mt-16 border-l-2 border-brand pl-6 text-[15px] leading-[1.75] text-muted-foreground"
            data-reveal
          >
            {copy.safety.caveat}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- audience */

export function Audience({ locale }: SectionProps) {
  const { copy } = copyFor(locale);
  return (
    <section
      aria-labelledby="audience-title"
      id="who-its-for"
      data-tone="sand"
      className="land-band"
    >
      <div
        className={cn(
          WRAP,
          "grid gap-16 py-28 md:py-40 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-24",
        )}
      >
        <SectionHead
          id="audience-title"
          eyebrow={copy.audience.eyebrow}
          heading={copy.audience.heading}
        >
          {copy.audience.body.map((p) => (
            <p key={p.slice(0, 24)} className={cn(LEAD, "mt-7")}>
              {p}
            </p>
          ))}
        </SectionHead>
        <div className="self-end">
          <dl className="divide-y divide-border border-y border-border">
            {copy.audience.facts.map((f) => (
              <div
                key={f.label}
                className="flex items-baseline justify-between gap-6 py-8"
                data-reveal
              >
                <dt className="max-w-[18ch] text-[15px] text-muted-foreground">{f.label}</dt>
                <dd className="font-display text-[clamp(44px,5vw,64px)] leading-none tabular">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 text-[14px] leading-relaxed text-faint" data-reveal>
            {copy.audience.footnote}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- FAQ teaser */

export function FaqTeaser({ locale }: SectionProps) {
  const { copy, t } = copyFor(locale);
  return (
    <section aria-labelledby="faq-title" id="questions" className={cn(WRAP, SECTION)}>
      <div className="grid gap-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-24">
        <SectionHead id="faq-title" eyebrow={copy.faq.eyebrow} heading={copy.faq.heading}>
          <p className="mt-8 text-[15px]">
            <Link
              href="/faq/"
              className="group inline-flex items-center gap-1.5 text-brand underline-offset-4 hover:underline"
            >
              {t("site.landing.allQuestions")}
              <ArrowRight className="land-nudge size-4" strokeWidth={1.75} aria-hidden />
            </Link>
          </p>
        </SectionHead>
        <div className="border-t border-border" data-reveal>
          {copy.faq.items.map((q) => (
            <details key={q.id} className="land-faq group border-b border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-7 font-display text-[clamp(22px,2.4vw,27px)] leading-snug outline-none focus-visible:text-brand">
                {q.question}
                <ChevronDown
                  className="land-chevron size-5 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </summary>
              <p className="max-w-[60ch] pb-8 text-[15.5px] leading-[1.75] text-muted-foreground">
                {q.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- final CTA */

export function FinalCta({ locale }: SectionProps) {
  const { copy, t, href } = copyFor(locale);
  return (
    <section
      aria-labelledby="start-title"
      id="start"
      data-tone="cobalt"
      className={cn(WRAP, "land-band pb-16 pt-16 md:pb-24 md:pt-24")}
    >
      <div className="flex flex-col items-center text-center" data-reveal>
        <RingDiagram className="size-[104px]" />
        <h2 id="start-title" className={cn(H2, "mt-12 max-w-[16ch]")}>
          {copy.cta.heading}
        </h2>
        <p className={cn(LEAD, "mt-7 max-w-[44ch]")}>{copy.cta.text}</p>
        <div className="mt-11 flex flex-wrap justify-center gap-3">
          <PrimaryCta>{t("site.landing.openTheApp")}</PrimaryCta>
          <SecondaryCta href={href("/start/")}>{copy.cta.startLink}</SecondaryCta>
          <SecondaryCta href="/rules/">{t("site.landing.readRules")}</SecondaryCta>
        </div>
      </div>
    </section>
  );
}
