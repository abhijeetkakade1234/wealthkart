"use client";

import { formatAvax, periodLabel } from "@wealthkart/sdk";
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
import type { MonthPoint } from "@/lib/analytics";
import { type CircleAsset, fmt, toNumber } from "@/lib/asset";

import { ChartFrame } from "./chart-frame";

/** Phase 1 circle charts (PLAN.md D7): value, money in per month, value of one share. */

/** Axis label like "Dec '26" (periodLabel gives "December 2026"). */
const short = (p: number) => {
  const label = periodLabel(p);
  return `${label.slice(0, 3)} '${label.slice(-2)}`;
};

const axis = {
  tickLine: false,
  axisLine: false,
  tickMargin: 10,
  fontSize: 12,
  stroke: "var(--faint)",
} as const;

const valueConfig = {
  value: { label: "Circle value", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ValueChart({ points, asset }: { points: MonthPoint[]; asset: CircleAsset }) {
  const data = points.map((p) => ({ month: short(p.period), value: toNumber(p.value, asset) }));
  return (
    <ChartFrame
      title="Circle value"
      subtitle={`Everything paid in so far, month by month (${asset.symbol}).`}
      table={{
        columns: ["Month", `Value (${asset.symbol})`],
        rows: points.map((p) => [periodLabel(p.period), fmt(p.value, asset)]),
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
          <YAxis {...axis} width={44} tickFormatter={(v: number) => v.toLocaleString()} />
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

const inflowConfig = {
  installments: { label: "Installments", color: "var(--chart-1)" },
  fees: { label: "Late fees", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function InflowChart({ points, asset }: { points: MonthPoint[]; asset: CircleAsset }) {
  const data = points.map((p) => ({
    month: short(p.period),
    installments: toNumber(p.installments, asset),
    fees: toNumber(p.fees, asset),
  }));
  return (
    <ChartFrame
      title="Money in each month"
      subtitle={`Installments and late fees, by the month they're for (${asset.symbol}).`}
      table={{
        columns: ["Month", "Installments", "Late fees"],
        rows: points.map((p) => [
          periodLabel(p.period),
          fmt(p.installments, asset),
          fmt(p.fees, asset),
        ]),
      }}
    >
      <ChartContainer config={inflowConfig} className="aspect-auto h-[240px] w-full">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--line-soft)" />
          <XAxis dataKey="month" {...axis} minTickGap={16} />
          <YAxis {...axis} width={44} tickFormatter={(v: number) => v.toLocaleString()} />
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

const navConfig = {
  nav: { label: "One share", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function NavChart({ points, asset }: { points: MonthPoint[]; asset: CircleAsset }) {
  const withNav = points.filter((p) => p.navE18 !== null);
  // navE18 is an index scaled by 1e18 whatever the asset (1.00 = what was paid in).
  const data = withNav.map((p) => ({ month: short(p.period), nav: toNumber(p.navE18!) }));
  return (
    <ChartFrame
      title="Value of one share"
      subtitle={`What 1 ${asset.symbol} paid in at the start is worth now. Late fees and loan interest lift it for everyone.`}
      table={{
        columns: ["Month", `Worth of 1 ${asset.symbol}`],
        rows: withNav.map((p) => [periodLabel(p.period), formatAvax(p.navE18!)]),
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
