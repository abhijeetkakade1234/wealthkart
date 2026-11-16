"use client";

import { periodLabel } from "@wealthkart/sdk";
import { Download } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useT } from "@/i18n/react";
import type { CircleEvent } from "@/lib/analytics";
import { type CircleAsset, fmt, toNumber } from "@/lib/asset";
import { annualReturn, cashFlows, formatRate, memberHistoryCsv, project } from "@/lib/returns";
import { cn } from "@/lib/utils";

import { ChartFrame } from "./chart-frame";
import "@/i18n/en/analytics";

const YEARS = [5, 10, 30] as const;

const axis = {
  tickLine: false,
  axisLine: false,
  tickMargin: 10,
  fontSize: 12,
  stroke: "var(--faint)",
} as const;

/**
 * Your returns (PLAN.md D7, Phase 3): your annual return and the circle's (XIRR), a projection
 * if things carry on as they have, and your own history as a CSV for your tax filing.
 * Projections are an illustration, never a promise (ADR 0024).
 */
export function ReturnsCard({
  events,
  me,
  stake,
  totalAssets,
  installment,
  dueDay,
  chainNow,
  circleName,
  asset,
}: {
  events: readonly CircleEvent[];
  me: string;
  stake: bigint;
  totalAssets: bigint;
  installment: bigint;
  dueDay: number;
  chainNow: number;
  circleName: string;
  asset: CircleAsset;
}) {
  const [years, setYears] = useState<(typeof YEARS)[number]>(10);
  const { t, formatNumber } = useT();
  const config = {
    value: { label: t("analytics.couldBeWorth"), color: "var(--chart-1)" },
    paidIn: { label: t("analytics.youdPayIn"), color: "var(--chart-2)" },
  } satisfies ChartConfig;
  const mine = annualReturn(cashFlows(events, dueDay, stake, chainNow, me, asset));
  const circle = annualReturn(cashFlows(events, dueDay, totalAssets, chainNow, undefined, asset));
  const rate = circle ?? 0;
  const stakeNum = toNumber(stake, asset);
  const points = project(stakeNum, toNumber(installment, asset), rate, years);
  const data = points.map((p) => ({
    year: p.year === 0 ? t("analytics.now") : t("analytics.yearsShort", { count: p.year }),
    value: Number(p.value.toFixed(2)),
    paidIn: Number((stakeNum + p.paidIn).toFixed(2)),
  }));

  function downloadCsv() {
    // The CSV is a data file: headers and month names stay English in every language.
    const csv = memberHistoryCsv(
      events,
      me,
      (p) => periodLabel(p),
      // USDT exact (6 decimals); AVAX as before (2 decimals, rounded down).
      (u) => fmt(u, asset, asset.symbol === "USDT" ? 6 : 2),
      asset.symbol,
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wealthkart-${circleName.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-my-history.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ChartFrame
      title={t("analytics.returnsTitle")}
      subtitle={t("analytics.returnsSubtitle")}
      table={{
        columns: [
          t("analytics.yearColumn"),
          t("analytics.couldBeWorthColumn", { symbol: asset.symbol }),
          t("analytics.youdPayInColumn", { symbol: asset.symbol }),
        ],
        rows: data.map((d) => [d.year, d.value.toFixed(2), d.paidIn.toFixed(2)]),
      }}
    >
      <div className="grid gap-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-1">
            <dt className="text-[12.5px] text-muted-foreground">{t("analytics.myReturn")}</dt>
            <dd className="font-display text-[30px] leading-none tabular" data-testid="my-return">
              {formatRate(mine)}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-[12.5px] text-muted-foreground">{t("analytics.circleReturn")}</dt>
            <dd className="font-display text-[30px] leading-none tabular">{formatRate(circle)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px] text-muted-foreground">
            {t("analytics.ifYouKeepPaying", {
              amount: fmt(installment, asset),
              symbol: asset.symbol,
            })}
          </p>
          <div
            className="flex gap-1 rounded-full bg-secondary p-1"
            role="group"
            aria-label={t("analytics.years")}
          >
            {YEARS.map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={years === y}
                onClick={() => setYears(y)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12.5px] transition-colors",
                  years === y
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("analytics.yearsButton", { count: y })}
              </button>
            ))}
          </div>
        </div>

        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--line-soft)" />
            <XAxis dataKey="year" {...axis} minTickGap={16} />
            <YAxis {...axis} width={52} tickFormatter={(v: number) => formatNumber(v)} />
            <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="paidIn"
              type="monotone"
              stroke="var(--color-paidIn)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ChartContainer>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line-soft pt-5">
          <p className="max-w-[460px] text-[12.5px] text-muted-foreground">
            {t("analytics.notAPromise")}
          </p>
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[13px] transition-colors hover:border-foreground/40"
          >
            <Download className="size-4" strokeWidth={1.75} aria-hidden />
            {t("analytics.downloadCsv")}
          </button>
        </div>
      </div>
    </ChartFrame>
  );
}
