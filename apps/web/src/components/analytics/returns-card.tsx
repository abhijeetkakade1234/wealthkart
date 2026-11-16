"use client";

import { formatAvax, periodLabel } from "@wealthkart/sdk";
import { Download } from "lucide-react";
import { useState } from "react";
import { formatEther } from "viem";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { CircleEvent } from "@/lib/analytics";
import { annualReturn, cashFlows, formatRate, memberHistoryCsv, project } from "@/lib/returns";
import { cn } from "@/lib/utils";

import { ChartFrame } from "./chart-frame";

const YEARS = [5, 10, 30] as const;

const config = {
  value: { label: "Could be worth", color: "var(--chart-1)" },
  paidIn: { label: "You'd pay in", color: "var(--chart-2)" },
} satisfies ChartConfig;

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
}: {
  events: readonly CircleEvent[];
  me: string;
  stake: bigint;
  totalAssets: bigint;
  installment: bigint;
  dueDay: number;
  chainNow: number;
  circleName: string;
}) {
  const [years, setYears] = useState<(typeof YEARS)[number]>(10);
  const mine = annualReturn(cashFlows(events, dueDay, stake, chainNow, me));
  const circle = annualReturn(cashFlows(events, dueDay, totalAssets, chainNow));
  const rate = circle ?? 0;
  const points = project(Number(formatEther(stake)), Number(formatEther(installment)), rate, years);
  const data = points.map((p) => ({
    year: p.year === 0 ? "Now" : `${p.year}y`,
    value: Number(p.value.toFixed(2)),
    paidIn: Number((Number(formatEther(stake)) + p.paidIn).toFixed(2)),
  }));

  function downloadCsv() {
    const csv = memberHistoryCsv(
      events,
      me,
      (p) => periodLabel(p),
      (w) => formatAvax(w),
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
      title="Your returns"
      subtitle="Based on each installment's due date and what your share is worth today."
      table={{
        columns: ["Year", "Could be worth (AVAX)", "You'd pay in (AVAX)"],
        rows: data.map((d) => [d.year, d.value.toFixed(2), d.paidIn.toFixed(2)]),
      }}
    >
      <div className="grid gap-6">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-1">
            <dt className="text-[12.5px] text-muted-foreground">Your annual return</dt>
            <dd className="font-display text-[30px] leading-none tabular" data-testid="my-return">
              {formatRate(mine)}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-[12.5px] text-muted-foreground">The circle&apos;s annual return</dt>
            <dd className="font-display text-[30px] leading-none tabular">{formatRate(circle)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13.5px] text-muted-foreground">
            If you keep paying {formatAvax(installment)} AVAX a month and the circle&apos;s return
            holds:
          </p>
          <div className="flex gap-1 rounded-full bg-secondary p-1" role="group" aria-label="Years">
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
                {y} years
              </button>
            ))}
          </div>
        </div>

        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--line-soft)" />
            <XAxis dataKey="year" {...axis} minTickGap={16} />
            <YAxis {...axis} width={52} tickFormatter={(v: number) => v.toLocaleString()} />
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
            An illustration, not a promise. Past results don&apos;t decide future ones, and a
            circle&apos;s return can go down as well as up.
          </p>
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[13px] transition-colors hover:border-foreground/40"
          >
            <Download className="size-4" strokeWidth={1.75} aria-hidden />
            Download my history (CSV)
          </button>
        </div>
      </div>
    </ChartFrame>
  );
}
