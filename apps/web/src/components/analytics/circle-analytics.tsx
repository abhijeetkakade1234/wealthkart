"use client";

import type { Address } from "viem";

import { ErrorBoundary, InlineAlert, StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/react";
import { memberHistories, monthlySeries, totals } from "@/lib/analytics";
import { money as withUnit, useCircleAsset } from "@/lib/asset";
import { useCircleEvents } from "@/lib/events";

import { InflowChart, NavChart, ValueChart } from "./circle-charts";
import { CircleLoanCharts } from "./loan-charts";
import { PaymentsHeatmap } from "./payments-heatmap";
import { ReturnsCard } from "./returns-card";
import "@/i18n/en/analytics";

/** Months shown in the charts: the last year, never before the circle started. */
const CHART_MONTHS = 12;

/**
 * Circle analytics on the overview page (PLAN.md D7): summary line, three charts and the
 * payments heatmap, all built from the circle's own events. Each widget has its own error
 * boundary, so one broken chart never takes the page down (ADR 0026).
 */
export function CircleAnalytics({
  id,
  memberListLength,
  currentPeriod,
  chainNow,
  dueDay,
  mine,
  money,
}: {
  id: Address;
  memberListLength: number;
  currentPeriod: number;
  chainNow: number;
  dueDay: number;
  /** The viewer's numbers for "Your returns"; omitted for non-members. */
  mine?: {
    me: string;
    stake: bigint;
    totalAssets: bigint;
    installment: bigint;
    circleName: string;
  };
  /** Live totals for "Where the money is"; the loan charts show once they are known. */
  money?: { totalAssets: bigint; loansOutstanding: bigint; reserveBps: number };
}) {
  const q = useCircleEvents(id);
  const { asset } = useCircleAsset(id);
  const { t, tn } = useT();

  if (q.isPending) {
    return (
      <StateView
        state="loading"
        label={t("analytics.loadingHistory")}
        skeleton={
          <div className="grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-[330px] rounded-[14px] lg:col-span-2" />
            <Skeleton className="h-[330px] rounded-[14px]" />
            <Skeleton className="h-[330px] rounded-[14px]" />
          </div>
        }
      />
    );
  }
  if (q.isError || !q.data) return <StateView state="error" onRetry={() => q.refetch()} />;

  const { events, partial } = q.data;
  const joins = events.filter((e) => e.type === "joined").map((e) => e.joinPeriod);
  const firstPeriod = joins.length ? Math.min(...joins) : currentPeriod;
  const from = Math.max(firstPeriod, currentPeriod - CHART_MONTHS + 1);
  const points = monthlySeries(events, from, currentPeriod);
  const sum = totals(events);
  const histories = memberHistories(events);

  return (
    <div className="grid gap-5">
      {partial && <InlineAlert tone="info">{t("analytics.partialHistory")}</InlineAlert>}
      <p className="text-[13.5px] text-muted-foreground" data-testid="analytics-summary">
        {sum.payments === 0
          ? t("analytics.noPayments")
          : tn("analytics.summary", sum.payments, {
              late: sum.late,
              fees: withUnit(sum.fees, asset),
            })}
      </p>
      {sum.payments > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ErrorBoundary preset="widget" name={t("analytics.widgetValue")}>
            <div className="lg:col-span-2">
              <ValueChart points={points} asset={asset} />
            </div>
          </ErrorBoundary>
          <ErrorBoundary preset="widget" name={t("analytics.widgetInflow")}>
            <InflowChart points={points} asset={asset} />
          </ErrorBoundary>
          <ErrorBoundary preset="widget" name={t("analytics.widgetNav")}>
            <NavChart points={points} asset={asset} />
          </ErrorBoundary>
        </div>
      )}
      {sum.payments > 0 && money && (
        <CircleLoanCharts id={id} logs={q.data.logs} money={money} asset={asset} />
      )}
      {sum.payments > 0 && mine && (
        <ErrorBoundary preset="widget" name={t("analytics.widgetReturns")}>
          <ReturnsCard
            events={events}
            me={mine.me}
            stake={mine.stake}
            totalAssets={mine.totalAssets}
            installment={mine.installment}
            dueDay={dueDay}
            chainNow={chainNow}
            circleName={mine.circleName}
            asset={asset}
          />
        </ErrorBoundary>
      )}
      <ErrorBoundary preset="widget" name={t("analytics.widgetPayments")}>
        <PaymentsHeatmap
          id={id}
          total={memberListLength}
          histories={histories}
          firstPeriod={firstPeriod}
          currentPeriod={currentPeriod}
          chainNow={chainNow}
          dueDay={dueDay}
        />
      </ErrorBoundary>
    </div>
  );
}
