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
import { useT } from "@/i18n/react";
import type { PlainKey } from "@/i18n/types";
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
  const { t } = useT();
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ErrorBoundary preset="widget" name={t("analytics.widgetOutstanding")}>
        <OutstandingChart rows={rows} name={name} asset={asset} />
      </ErrorBoundary>
      <ErrorBoundary preset="widget" name={t("analytics.widgetSplit")}>
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
  const { t, formatNumber } = useT();
  const outstandingConfig = {
    owed: { label: t("analytics.stillOwed"), color: "var(--chart-1)" },
  } satisfies ChartConfig;
  const data = rows.map((r) => ({
    member: name(r.borrower),
    owed: toNumber(r.outstanding, asset),
  }));
  return (
    <ChartFrame
      title={t("analytics.outstandingTitle")}
      subtitle={t("analytics.outstandingSubtitle", { symbol: asset.symbol })}
      table={{
        columns: [
          t("analytics.memberColumn"),
          t("analytics.stillOwedColumn", { symbol: asset.symbol }),
        ],
        rows: rows.map((r) => [name(r.borrower), avax(r.outstanding, asset)]),
      }}
    >
      {rows.length === 0 ? (
        <p
          className="py-10 text-center text-[13.5px] text-muted-foreground"
          data-testid="no-loans-chart"
        >
          {t("analytics.nobodyOwes")}
        </p>
      ) : (
        <ChartContainer
          config={outstandingConfig}
          className="aspect-auto w-full"
          style={{ height: Math.max(120, rows.length * 44 + 40) }}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--line-soft)" />
            <XAxis type="number" {...axis} tickFormatter={(v: number) => formatNumber(v)} />
            <YAxis type="category" dataKey="member" {...axis} width={96} />
            <ChartTooltip cursor={{ fill: "var(--secondary)" }} content={<ChartTooltipContent />} />
            <Bar dataKey="owed" fill="var(--color-owed)" radius={[0, 4, 4, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartFrame>
  );
}

const PARTS_RAW: ReadonlyArray<{
  key: "free" | "lent" | "reserve";
  labelKey: PlainKey;
  color: string;
}> = [
  { key: "free", labelKey: "analytics.partFree", color: "var(--chart-1)" },
  { key: "lent", labelKey: "analytics.partLent", color: "var(--chart-2)" },
  { key: "reserve", labelKey: "analytics.partReserve", color: "var(--chart-6)" },
];

/**
 * "Where the money is": one tall segmented bar (dataviz Figures: 28px, 4px corners, 2px
 * surface gaps, share printed inside where it fits) with a legend in block order.
 */
export function MoneySplitChart({ split, asset }: { split: MoneySplit; asset: CircleAsset }) {
  const { t } = useT();
  const PARTS = PARTS_RAW.map((p) => ({ ...p, label: t(p.labelKey) }));
  const parts = PARTS.map((p) => ({ ...p, value: split[p.key] })).filter((p) => p.value > 0n);
  return (
    <ChartFrame
      title={t("analytics.splitTitle")}
      subtitle={t("analytics.splitSubtitle")}
      table={{
        columns: [t("analytics.partColumn"), asset.symbol, t("analytics.shareColumn")],
        rows: PARTS.map((p) => [
          p.label,
          avax(split[p.key], asset),
          shareText(split[p.key], split.total),
        ]),
      }}
    >
      {split.total === 0n ? (
        <p className="py-10 text-center text-[13.5px] text-muted-foreground">
          {t("analytics.nothingPaidIn")}
        </p>
      ) : (
        <div className="grid gap-6 pt-2">
          <p className="font-display text-[34px] leading-none tracking-tight">
            {avax(split.total, asset)}
            <small className="ml-1.5 font-sans text-[13px] tracking-normal text-muted-foreground">
              {t("analytics.inTotal", { symbol: asset.symbol })}
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
