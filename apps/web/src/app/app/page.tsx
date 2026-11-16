"use client";

import { periodLabel } from "@wealthkart/sdk";
import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense } from "react";

import { PortfolioSummary } from "@/components/analytics/portfolio-summary";
import { AssetBadge } from "@/components/app/asset-pay";
import { PageHeader } from "@/components/app/page-header";
import { TestUsdtFaucet } from "@/components/app/test-usdt-faucet";
import { FirstRunChecklist } from "@/components/app/first-run-checklist";
import { Pagination, usePageParam } from "@/components/app/pagination";
import { CircleCover, EmptyArt } from "@/components/art";
import { Button, ErrorBoundary, StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useT } from "@/i18n/react";
import { fmt } from "@/lib/asset";
import { CIRCLES_PAGE_SIZE, type CircleSummary, useMyCircles } from "@/lib/circle";
import "@/i18n/en/home";

/** Home / Portfolio: every circle this wallet is in, and what needs doing now. */
export default function PortfolioPage() {
  return (
    <RequireWallet>
      <Suspense fallback={null}>
        <Portfolio />
      </Suspense>
    </RequireWallet>
  );
}

function Portfolio() {
  const router = useRouter();
  const page = usePageParam();
  const q = useMyCircles(page);
  const { t } = useT();

  const inCircle = q.isPending ? undefined : q.isError || !q.factory ? null : (q.total ?? 0) > 0;
  const header = (
    <>
      <PageHeader
        title={t("home.title")}
        subtitle={t("home.subtitle")}
        actions={
          <Button
            icon={Plus}
            onClick={() => router.push("/app/new/")}
            disabled={!q.factory}
            disabledReason={t("home.notLive")}
          >
            {t("home.startCircle")}
          </Button>
        }
      />
      <FirstRunChecklist inCircle={inCircle} />
    </>
  );

  if (q.isPending) {
    return (
      <>
        {header}
        <StateView
          state="loading"
          label={t("home.loading")}
          skeleton={
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-52 rounded-[14px]" />
              ))}
            </div>
          }
        />
      </>
    );
  }

  if (q.isError) {
    return (
      <>
        {header}
        <StateView state="error" onRetry={q.refetch} />
      </>
    );
  }

  if (!q.factory || !q.total) {
    return (
      <>
        {header}
        <StateView
          state="empty"
          illustration={<EmptyArt variant="circles" />}
          message={q.factory ? t("home.empty") : t("home.emptyNotLive")}
        />
        {q.factory && <TestUsdtFaucet className="mx-auto mt-10 max-w-[640px]" />}
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mb-14">
        <ErrorBoundary preset="widget" name={t("home.portfolio")}>
          <PortfolioSummary />
        </ErrorBoundary>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {q.circles.map((c) => (
          <CircleCard key={c.address} circle={c} />
        ))}
      </div>
      <div className="mt-10 rounded-[14px] border border-border bg-card">
        <Pagination
          page={page}
          pageSize={CIRCLES_PAGE_SIZE}
          total={q.total}
          noun={t("home.circlesNoun")}
        />
      </div>
    </>
  );
}

function CircleCard({ circle: c }: { circle: CircleSummary }) {
  const owes = c.due?.payable;
  const asset = c.asset;
  const { t, locale, formatDate } = useT();
  // English keeps the SDK's month label; Hindi and Marathi name the month in their language.
  const month = (period: number) =>
    locale === "en"
      ? periodLabel(period)
      : formatDate(Date.UTC(Math.floor(period / 12), period % 12, 1), {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        });
  return (
    <Link
      href={`/app/circle/?id=${c.address}`}
      className="group grid content-between gap-8 overflow-hidden rounded-[14px] border border-border bg-card p-[26px] transition-colors hover:border-foreground/30"
    >
      <div className="-mx-[26px] -mt-[26px] h-[104px] border-b border-line-soft">
        <CircleCover address={c.address} name={c.name} />
      </div>
      <div className="grid gap-1.5">
        <span className="flex items-center justify-between gap-3">
          <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
            {t("home.members", { count: String(c.memberCount) })}
          </span>
          <AssetBadge asset={asset} />
        </span>
        <span className="font-display text-[28px] leading-tight">{c.name}</span>
      </div>
      <div className="grid gap-1">
        <span className="text-[12.5px] text-muted-foreground">{t("home.yourStake")}</span>
        <span className="font-display text-[34px] leading-none tabular">
          {fmt(c.stake, asset)}
          <small className="ml-1.5 font-sans text-[13px] text-muted-foreground">
            {asset.symbol}
          </small>
        </span>
        {c.totalAssets > 0n && c.stake > 0n && (
          <span className="text-[12.5px] text-muted-foreground">
            {t("home.shareOfCircle", {
              percent: (Number((c.stake * 10_000n) / c.totalAssets) / 100).toFixed(1),
            })}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        {!c.isMember ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
            {t("home.notJoined")}
          </span>
        ) : owes && c.due ? (
          <span className="rounded-full bg-warn-soft px-2.5 py-1 text-warn">
            {t("home.due", {
              amount: fmt(c.due.amount, asset),
              symbol: asset.symbol,
              month: month(Number(c.due.period)),
            })}
          </span>
        ) : (
          <span className="rounded-full bg-good-soft px-2.5 py-1 text-good">
            {t("home.allPaid")}
          </span>
        )}
        <ArrowRight
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
    </Link>
  );
}
