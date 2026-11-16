"use client";

import { AssetBadge } from "@/components/app/asset-pay";
import { StatCard } from "@/components/app/stat-card";
import { StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/asset";
import { PORTFOLIO_MAX, usePortfolio } from "@/lib/circle";

/** Percent with one decimal from basis points. */
const pct = (bps: number) => `${(bps / 100).toFixed(bps > 0 && bps < 100 ? 1 : 0)}%`;

/**
 * "My portfolio" across every circle (PLAN.md D7): value, what you paid in, gain, and how
 * your money is split. The split is magnitude, so it uses one hue (dataviz), with the
 * numbers written next to each bar. AVAX and USDT circles are totalled separately and bars
 * compare only circles in the same asset (ADR 0046): the two are never added together.
 */
export function PortfolioSummary() {
  const p = usePortfolio();

  if (p.isPending) {
    return (
      <StateView
        state="loading"
        label="Adding up your circles"
        skeleton={
          <div className="grid gap-5 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 rounded-[14px]" />
            ))}
          </div>
        }
      />
    );
  }
  if (p.isError) return <StateView state="error" onRetry={p.refetch} />;
  if (p.rows.length === 0) return null;

  const sorted = [...p.rows].sort((a, b) =>
    a.asset.symbol !== b.asset.symbol
      ? a.asset.symbol.localeCompare(b.asset.symbol)
      : a.stake === b.stake
        ? 0
        : a.stake > b.stake
          ? -1
          : 1,
  );
  const maxOf = (symbol: string) => sorted.find((r) => r.asset.symbol === symbol)?.stake ?? 0n;

  return (
    <section className="grid gap-5" aria-label="Your portfolio">
      {p.totals.map((t) => {
        const n = p.rows.filter((r) => r.asset.symbol === t.asset.symbol).length;
        return (
          <div
            key={t.asset.symbol}
            className="grid gap-5 sm:grid-cols-3"
            data-testid={`portfolio-${t.asset.symbol}`}
          >
            <StatCard
              label={
                p.totals.length > 1
                  ? `Your money in ${t.asset.symbol} circles`
                  : "Your money in circles"
              }
              value={fmt(t.value, t.asset)}
              unit={t.asset.symbol}
              meta={`Across ${n} ${n === 1 ? "circle" : "circles"}`}
            />
            <StatCard
              label="Installments you paid"
              value={fmt(t.paidIn, t.asset)}
              unit={t.asset.symbol}
              meta="Late fees not included"
            />
            <StatCard
              label="Gain so far"
              value={`${t.gain >= 0n ? "+" : ""}${fmt(t.gain, t.asset)}`}
              unit={t.asset.symbol}
              meta="Your share of fees and loan interest"
            />
          </div>
        );
      })}

      {sorted.length > 1 && (
        <div className="rounded-[14px] border border-border bg-card p-[26px] sm:p-8">
          <h3 className="font-display text-[24px] leading-none tracking-tight">
            Where your money is
          </h3>
          <ul className="mt-6 grid gap-4" data-testid="portfolio-split">
            {sorted.map((r) => {
              const max = maxOf(r.asset.symbol);
              const width = max > 0n ? Number((r.stake * 1000n) / max) / 10 : 0;
              return (
                <li key={r.address} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-4 text-[13.5px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{r.name}</span>
                      {p.totals.length > 1 && <AssetBadge asset={r.asset} />}
                    </span>
                    <span className="shrink-0 tabular text-muted-foreground">
                      <span className="text-foreground">{fmt(r.stake, r.asset)}</span>{" "}
                      {r.asset.symbol} · you own {pct(r.shareBps)} of it
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-[var(--chart-1)]"
                      style={{ width: `${Math.max(width, r.stake > 0n ? 2 : 0)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {p.truncated && (
        <p className="text-[13px] text-muted-foreground">
          Totals cover your first {PORTFOLIO_MAX} circles.
        </p>
      )}
    </section>
  );
}
