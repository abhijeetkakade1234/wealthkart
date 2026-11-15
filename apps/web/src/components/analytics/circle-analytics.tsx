"use client";

import { formatAvax } from "@wealthkart/sdk";
import type { Address } from "viem";

import { ErrorBoundary, InlineAlert, StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { memberHistories, monthlySeries, totals } from "@/lib/analytics";
import { useCircleEvents } from "@/lib/events";

import { InflowChart, NavChart, ValueChart } from "./circle-charts";
import { PaymentsHeatmap } from "./payments-heatmap";

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
}: {
  id: Address;
  memberListLength: number;
  currentPeriod: number;
  chainNow: number;
  dueDay: number;
}) {
  const q = useCircleEvents(id);

  if (q.isPending) {
    return (
      <StateView
        state="loading"
        label="Loading circle history"
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
  const t = totals(events);
  const histories = memberHistories(events);

  return (
    <div className="grid gap-5">
      {partial && (
        <InlineAlert tone="info">
          This circle is older than the history we can read quickly, so the charts show recent
          months only. Full history arrives with the activity indexer.
        </InlineAlert>
      )}
      <p className="text-[13.5px] text-muted-foreground" data-testid="analytics-summary">
        {t.payments === 0
          ? "No payments yet. The charts fill in after the first installment."
          : `${t.payments} ${t.payments === 1 ? "payment" : "payments"} so far · ${t.late} paid late · ${formatAvax(t.fees)} AVAX in late fees shared by everyone`}
      </p>
      {t.payments > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ErrorBoundary preset="widget" name="Circle value">
            <div className="lg:col-span-2">
              <ValueChart points={points} />
            </div>
          </ErrorBoundary>
          <ErrorBoundary preset="widget" name="Money in each month">
            <InflowChart points={points} />
          </ErrorBoundary>
          <ErrorBoundary preset="widget" name="Value of one share">
            <NavChart points={points} />
          </ErrorBoundary>
        </div>
      )}
      <ErrorBoundary preset="widget" name="Payments">
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
