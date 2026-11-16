"use client";

import { formatAvax } from "@wealthkart/sdk";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useT } from "@/i18n/react";
import { type MonthPoint, periodName, periodShort } from "@/lib/analytics";
import { type CircleAsset, fmt, toNumber } from "@/lib/asset";

import { ChartFrame } from "./chart-frame";

/** Phase 1 circle charts (PLAN.md D7): value, money in per month, value of one share. */

const axis = {
  tickLine: false,
  axisLine: false,
  tickMargin: 10,
  fontSize: 12,
  stroke: "var(--faint)",
} as const;

export function ValueChart({ points, asset }: { points: MonthPoint[]; asset: CircleAsset }) {
  const { t, formatNumber } = useT();
  const valueConfig = {
    value: { label: t("analytics.valueTitle"), color: "var(--chart-1)" },
  } satisfies ChartConfig;
  const data = points.map((p) => ({
    month: periodShort(p.period),
    value: toNumber(p.value, asset),
  }));
  return (
    <ChartFrame
      title={t("analytics.valueTitle")}
      subtitle={t("analytics.valueSubtitle", { symbol: asset.symbol })}
      table={{
        columns: [t("analytics.month"), t("analytics.valueColumn", { symbol: asset.symbol })],
        rows: points.map((p) => [periodName(p.period), fmt(p.value, asset)]),
      }}
    >
      <ChartContainer config={valueConfig} className="aspect-auto h-[240px] w-full">
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="value-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line-soft)" />
          <XAxis dataKey="month" {...axis} minTickGap={24} />
          <YAxis {...axis} width={44} tickFormatter={(v: number) => formatNumber(v)} />
          <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent />} />
          <Area
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            fill="url(#value-fill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          />
        </AreaChart>
      </ChartContainer>
    </ChartFrame>
  );
}

export function InflowChart({ points, asset }: { points: MonthPoint[]; asset: CircleAsset }) {
  const { t, formatNumber } = useT();
  const inflowConfig = {
    installments: { label: t("analytics.installments"), color: "var(--chart-1)" },
    fees: { label: t("analytics.lateFees"), color: "var(--chart-2)" },
  } satisfies ChartConfig;
  const data = points.map((p) => ({
    month: periodShort(p.period),
    installments: toNumber(p.installments, asset),
    fees: toNumber(p.fees, asset),
  }));
  return (
    <ChartFrame
      title={t("analytics.inflowTitle")}
      subtitle={t("analytics.inflowSubtitle", { symbol: asset.symbol })}
      table={{
        columns: [t("analytics.month"), t("analytics.installments"), t("analytics.lateFees")],
        rows: points.map((p) => [
          periodName(p.period),
          fmt(p.installments, asset),
          fmt(p.fees, asset),
        ]),
      }}
    >
      <ChartContainer config={inflowConfig} className="aspect-auto h-[240px] w-full">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--line-soft)" />
          <XAxis dataKey="month" {...axis} minTickGap={16} />
          <YAxis {...axis} width={44} tickFormatter={(v: number) => formatNumber(v)} />
          <ChartTooltip cursor={{ fill: "var(--secondary)" }} content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {/* 2px surface gap between stacked segments; rounded data end only on top. */}
          <Bar
            dataKey="installments"
            stackId="in"
            fill="var(--color-installments)"
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={28}
          />
          <Bar
            dataKey="fees"
            stackId="in"
            fill="var(--color-fees)"
            stroke="var(--card)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ChartContainer>
    </ChartFrame>
  );
}

export function NavChart({ points, asset }: { points: MonthPoint[]; asset: CircleAsset }) {
  const { t } = useT();
  const navConfig = {
    nav: { label: t("analytics.navSeries"), color: "var(--chart-1)" },
  } satisfies ChartConfig;
  const withNav = points.filter((p) => p.navE18 !== null);
  // navE18 is an index scaled by 1e18 whatever the asset (1.00 = what was paid in).
  const data = withNav.map((p) => ({ month: periodShort(p.period), nav: toNumber(p.navE18!) }));
  return (
    <ChartFrame
      title={t("analytics.navTitle")}
      subtitle={t("analytics.navSubtitle", { symbol: asset.symbol })}
      table={{
        columns: [t("analytics.month"), t("analytics.navColumn", { symbol: asset.symbol })],
        rows: withNav.map((p) => [periodName(p.period), formatAvax(p.navE18!)]),
      }}
    >
      <ChartContainer config={navConfig} className="aspect-auto h-[240px] w-full">
        <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--line-soft)" />
          <XAxis dataKey="month" {...axis} minTickGap={16} />
          <YAxis
            {...axis}
            width={52}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => v.toFixed(3)}
          />
          <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent />} />
          <Line
            dataKey="nav"
            type="monotone"
            stroke="var(--color-nav)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          />
        </LineChart>
      </ChartContainer>
    </ChartFrame>
  );
}
