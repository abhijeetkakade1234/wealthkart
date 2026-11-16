"use client";

import { circleVaultAbi, shortAddress } from "@wealthkart/sdk";
import { useMemo } from "react";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { ErrorBoundary } from "@/components/kit";
import { type CircleAsset, money, toNumber } from "@/lib/asset";
import type { DecodedLog } from "@/lib/events";
import {
  avax,
  loansFromLogs,
  type MemberOutstanding,
  type MoneySplit,
  moneySplit,
  outstandingByMember,
  shareText,
} from "@/lib/loans";

import { ChartFrame } from "./chart-frame";

/** Loan charts on the overview (PLAN.md D7): who owes what, and where the circle's money is. */

/** Both loan charts for one circle, side by side, each in its own error boundary. */
export function CircleLoanCharts({
  id,
  logs,
  money: totals,
  asset,
}: {
  id: Address;
  logs: readonly DecodedLog[];
  money: { totalAssets: bigint; loansOutstanding: bigint; reserveBps: number };
  asset: CircleAsset;
}) {
  const rows = useMemo(() => outstandingByMember(loansFromLogs(logs)), [logs]);
  const names = useReadContracts({
    allowFailure: true,
    contracts: rows.map(
      (r) =>
        ({
          abi: circleVaultAbi,
          address: id,
          functionName: "nameOf",
          args: [r.borrower as Address],
        }) as const,
    ),
    query: { enabled: rows.length > 0 },
  });
  const map = new Map<string, string>();
  rows.forEach((r, i) => {
    const n = names.data?.[i];
    if (n?.status === "success" && n.result) map.set(r.borrower.toLowerCase(), n.result as string);
  });
  const name = (a: string) => map.get(a.toLowerCase()) || shortAddress(a);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ErrorBoundary preset="widget" name="Loans outstanding per member">
        <OutstandingChart rows={rows} name={name} asset={asset} />
      </ErrorBoundary>
      <ErrorBoundary preset="widget" name="Where the money is">
        <MoneySplitChart
          split={moneySplit(totals.totalAssets, totals.loansOutstanding, totals.reserveBps)}
          asset={asset}
        />
      </ErrorBoundary>
    </div>
  );
}

const axis = {
  tickLine: false,
  axisLine: false,
  tickMargin: 10,
  fontSize: 12,
  stroke: "var(--faint)",
} as const;

const outstandingConfig = {
  owed: { label: "Still owed", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Ranked horizontal bars, one hue (magnitude, not identity), biggest first. */
export function OutstandingChart({
  rows,
  name,
  asset,
}: {
  rows: MemberOutstanding[];
  name: (address: string) => string;
  asset: CircleAsset;
}) {
  const data = rows.map((r) => ({
    member: name(r.borrower),
    owed: toNumber(r.outstanding, asset),
  }));
  return (
    <ChartFrame
      title="Loans outstanding per member"
      subtitle={`What each borrower still owes the circle, in ${asset.symbol}.`}
      table={{
        columns: ["Member", `Still owed (${asset.symbol})`],
        rows: rows.map((r) => [name(r.borrower), avax(r.outstanding, asset)]),
      }}
    >
      {rows.length === 0 ? (
        <p
          className="py-10 text-center text-[13.5px] text-muted-foreground"
          data-testid="no-loans-chart"
        >
          Nobody owes the circle anything right now.
        </p>
      ) : (
        <ChartContainer
          config={outstandingConfig}
          className="aspect-auto w-full"
          style={{ height: Math.max(120, rows.length * 44 + 40) }}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--line-soft)" />
            <XAxis type="number" {...axis} tickFormatter={(v: number) => v.toLocaleString()} />
            <YAxis type="category" dataKey="member" {...axis} width={96} />
            <ChartTooltip cursor={{ fill: "var(--secondary)" }} content={<ChartTooltipContent />} />
            <Bar dataKey="owed" fill="var(--color-owed)" radius={[0, 4, 4, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartFrame>
  );
}

const PARTS = [
  { key: "free", label: "Cash free to lend", color: "var(--chart-1)" },
  { key: "lent", label: "Lent out to members", color: "var(--chart-2)" },
  { key: "reserve", label: "Reserve kept back", color: "var(--chart-6)" },
] as const;

/**
 * "Where the money is": one tall segmented bar (dataviz Figures: 28px, 4px corners, 2px
 * surface gaps, share printed inside where it fits) with a legend in block order.
 */
export function MoneySplitChart({ split, asset }: { split: MoneySplit; asset: CircleAsset }) {
  const parts = PARTS.map((p) => ({ ...p, value: split[p.key] })).filter((p) => p.value > 0n);
  return (
    <ChartFrame
      title="Where the money is"
      subtitle="The circle's value split into cash free to lend, money lent out, and the reserve it always keeps."
      table={{
        columns: ["Part", asset.symbol, "Share"],
        rows: PARTS.map((p) => [
          p.label,
          avax(split[p.key], asset),
          shareText(split[p.key], split.total),
        ]),
      }}
    >
      {split.total === 0n ? (
        <p className="py-10 text-center text-[13.5px] text-muted-foreground">
          Nothing paid in yet.
        </p>
      ) : (
        <div className="grid gap-6 pt-2">
          <p className="font-display text-[34px] leading-none tracking-tight">
            {avax(split.total, asset)}
            <small className="ml-1.5 font-sans text-[13px] tracking-normal text-muted-foreground">
              {asset.symbol} in total
            </small>
          </p>
          <div
            className="flex h-7 w-full gap-[2px]"
            role="img"
            aria-label={parts
              .map(
                (p) => `${p.label}: ${money(p.value, asset)}, ${shareText(p.value, split.total)}`,
              )
              .join("; ")}
            data-testid="money-split"
          >
            {parts.map((p) => {
              const pct = Number((p.value * 10_000n) / split.total) / 100;
              return (
                <div
                  key={p.key}
                  className="flex h-full min-w-[3px] items-center overflow-hidden rounded-[4px] px-2 text-[12px] font-medium text-white tabular"
                  style={{ width: `${pct}%`, background: p.color }}
                  title={`${p.label}: ${money(p.value, asset)} (${shareText(p.value, split.total)})`}
                >
                  {pct >= 12 ? shareText(p.value, split.total) : ""}
                </div>
              );
            })}
          </div>
          <ul className="grid gap-3 text-[13.5px] sm:grid-cols-3">
            {PARTS.map((p) => (
              <li key={p.key} className="grid gap-1">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span
                    className="size-2.5 rounded-[3px]"
                    style={{ background: p.color }}
                    aria-hidden
                  />
                  {p.label}
                </span>
                <span className="font-mono text-[14px] tabular">{money(split[p.key], asset)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartFrame>
  );
}
