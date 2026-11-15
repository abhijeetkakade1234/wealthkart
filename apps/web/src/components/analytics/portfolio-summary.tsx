"use client";

import { formatAvax } from "@wealthkart/sdk";

import { StatCard } from "@/components/app/stat-card";
import { StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { PORTFOLIO_MAX, usePortfolio } from "@/lib/circle";

/** Percent with one decimal from basis points. */
const pct = (bps: number) => `${(bps / 100).toFixed(bps > 0 && bps < 100 ? 1 : 0)}%`;

/**
 * "My portfolio" across every circle (PLAN.md D7): value, what you paid in, gain, and how
 * your money is split. The split is magnitude, so it uses one hue (dataviz), with the
 * numbers written next to each bar.
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

  const sorted = [...p.rows].sort((a, b) => (a.stake === b.stake ? 0 : a.stake > b.stake ? -1 : 1));
  const max = sorted[0]?.stake ?? 0n;

  return (
    <section className="grid gap-5" aria-label="Your portfolio">
      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard
          label="Your money in circles"
          value={formatAvax(p.value)}
          unit="AVAX"
          meta={`Across ${p.rows.length} ${p.rows.length === 1 ? "circle" : "circles"}`}
        />
        <StatCard
          label="Installments you paid"
          value={formatAvax(p.paidIn)}
          unit="AVAX"
          meta="Late fees not included"
        />
        <StatCard
          label="Gain so far"
          value={`${p.gain >= 0n ? "+" : ""}${formatAvax(p.gain)}`}
          unit="AVAX"
          meta="Your share of fees, and interest once loans start"
        />
      </div>

      {sorted.length > 1 && (
        <div className="rounded-[14px] border border-border bg-card p-[26px] sm:p-8">
          <h3 className="font-display text-[24px] leading-none tracking-tight">
            Where your money is
          </h3>
          <ul className="mt-6 grid gap-4" data-testid="portfolio-split">
            {sorted.map((r) => {
              const width = max > 0n ? Number((r.stake * 1000n) / max) / 10 : 0;
              return (
                <li key={r.address} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-4 text-[13.5px]">
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0 tabular text-muted-foreground">
                      <span className="text-foreground">{formatAvax(r.stake)}</span> AVAX · you own{" "}
                      {pct(r.shareBps)} of it
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
