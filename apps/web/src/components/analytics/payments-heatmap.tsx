"use client";

import { dueMoment, periodFromYearMonth, yearMonthOf } from "@wealthkart/rules";
import { shortAddress } from "@wealthkart/sdk";
import { Check, CircleDashed, Clock, type LucideIcon, Palmtree, Pause, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Address } from "viem";

import { Avatar } from "@/components/art";
import { Pagination, usePageParam } from "@/components/app/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CELL_LABEL, type CellState, cellState, type MemberHistory } from "@/lib/analytics";
import { MEMBERS_PAGE_SIZE, useCircleMembers } from "@/lib/circle";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Status colours are for state only (dataviz), and every cell also carries an icon and a text
 * label, so nothing is told by colour alone.
 */
const CELL: Record<CellState, { cls: string; Icon?: LucideIcon }> = {
  "on-time": { cls: "bg-good-soft text-good", Icon: Check },
  late: { cls: "bg-warn-soft text-warn", Icon: Clock },
  holiday: { cls: "bg-brand-soft text-brand", Icon: Palmtree },
  missed: { cls: "bg-bad-soft text-bad", Icon: X },
  due: { cls: "border border-dashed border-border text-muted-foreground", Icon: CircleDashed },
  upcoming: { cls: "bg-secondary/60" },
  dormant: { cls: "bg-secondary text-muted-foreground", Icon: Pause },
  before: { cls: "" },
};

const LEGEND: CellState[] = ["on-time", "late", "holiday", "missed", "due", "dormant"];

/**
 * Members × months for one year: the on-chain version of G1's grid of 1s (PLAN.md D7).
 * Paged with `?hpage=`, year in `?year=`, so the view is shareable (ADR 0023).
 */
export function PaymentsHeatmap({
  id,
  total,
  histories,
  firstPeriod,
  currentPeriod,
  chainNow,
  dueDay,
}: {
  id: Address;
  /** Length of the member list. */
  total: number;
  histories: Map<string, MemberHistory>;
  firstPeriod: number;
  currentPeriod: number;
  chainNow: number;
  dueDay: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = usePageParam("hpage");
  const m = useCircleMembers(id, page);

  const firstYear = yearMonthOf(firstPeriod).year;
  const thisYear = yearMonthOf(currentPeriod).year;
  const asked = Number(params.get("year"));
  const year =
    Number.isInteger(asked) && asked >= firstYear && asked <= thisYear ? asked : thisYear;
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => firstYear + i);
  const due = (p: number) => dueMoment(p, dueDay);

  function pickYear(y: number) {
    const next = new URLSearchParams(params.toString());
    if (y === thisYear) next.delete("year");
    else next.set("year", String(y));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <section className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <h3 className="font-display text-[24px] leading-none tracking-tight">Payments</h3>
          <p className="text-[13.5px] text-muted-foreground">
            Every member, every month. Hover a square for details.
          </p>
        </div>
        {years.length > 1 && (
          <div className="flex gap-1 rounded-full bg-secondary p-1" role="group" aria-label="Year">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={y === year}
                onClick={() => pickYear(y)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12.5px] transition-colors",
                  y === year
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </header>

      {m.isPending ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 rounded-lg" />
          ))}
        </div>
      ) : (
        <TooltipProvider delayDuration={120}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5 text-[13px]">
              <caption className="sr-only">Payments by member and month, {year}</caption>
              <thead>
                <tr className="text-[12px] text-muted-foreground">
                  <th className="w-[180px] pb-2 text-left font-medium">Member</th>
                  {MONTHS.map((mo) => (
                    <th key={mo} className="pb-2 text-center font-medium">
                      {mo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.rows.map((r) => {
                  const h = histories.get(r.address.toLowerCase());
                  const who = r.name || shortAddress(r.address);
                  return (
                    <tr key={r.address}>
                      <th scope="row" className="pr-3 text-left font-normal">
                        <span className="inline-flex items-center gap-2.5">
                          <Avatar address={r.address} size={24} />
                          <span className="max-w-[130px] truncate">{who}</span>
                        </span>
                      </th>
                      {MONTHS.map((mo, i) => {
                        const p = periodFromYearMonth(year, i + 1);
                        const state = cellState(h, p, currentPeriod, chainNow, due);
                        const { cls, Icon } = CELL[state];
                        const label = `${who} · ${mo} ${year} · ${CELL_LABEL[state]}`;
                        return (
                          <td key={mo} className="text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  role="img"
                                  aria-label={label}
                                  data-state-cell={state}
                                  className={cn(
                                    "mx-auto inline-flex size-7 items-center justify-center rounded-[7px]",
                                    cls,
                                  )}
                                >
                                  {Icon && (
                                    <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{label}</TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      )}

      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-muted-foreground">
        {LEGEND.map((s) => {
          const { cls, Icon } = CELL[s];
          return (
            <li key={s} className="inline-flex items-center gap-2">
              <span
                className={cn("inline-flex size-5 items-center justify-center rounded-[5px]", cls)}
              >
                {Icon && <Icon className="size-3" strokeWidth={2} aria-hidden />}
              </span>
              {CELL_LABEL[s]}
            </li>
          );
        })}
      </ul>

      <Pagination
        page={page}
        pageSize={MEMBERS_PAGE_SIZE}
        total={total}
        noun="members"
        param="hpage"
      />
    </section>
  );
}
