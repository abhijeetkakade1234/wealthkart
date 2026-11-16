import { periodLabel } from "@wealthkart/sdk";

import { type LoanState, tenorTimeline } from "@/lib/loans";
import { formatBps } from "@/lib/rules";
import { cn } from "@/lib/utils";

const short = (p: number) => {
  const l = periodLabel(p);
  return `${l.slice(0, 3)} ${l.slice(-4)}`;
};

/**
 * The loan's three terms as a quiet stepped rule (rule 15): each term's months and rate, the
 * current one marked, and the date the whole loan is due.
 */
export function TenorTimeline({ loan, currentPeriod }: { loan: LoanState; currentPeriod: number }) {
  const { steps, lastMonth, overdue } = tenorTimeline(loan, currentPeriod);
  return (
    <div className="grid gap-4" aria-label="Loan terms">
      <ol className="grid grid-cols-3 gap-2">
        {steps.map((s) => (
          <li
            key={s.tenor}
            className="grid content-start gap-2"
            aria-current={s.state === "now" ? "step" : undefined}
            data-state={s.state}
          >
            {/* A rising step per term: taller bar, higher rate. Bars share one baseline. */}
            <span className="flex h-2.5 items-end" aria-hidden>
              <span
                className={cn(
                  "w-full rounded-full",
                  s.tenor === 1 ? "h-1" : s.tenor === 2 ? "h-1.5" : "h-2.5",
                  s.state === "now"
                    ? "bg-brand"
                    : s.state === "past"
                      ? "bg-foreground/25"
                      : "bg-line-soft",
                )}
              />
            </span>
            <span
              className={cn(
                "font-mono text-[14px] tabular",
                s.state === "now" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {formatBps(s.rateBps)}
              <span className="font-sans text-[11.5px]"> a month</span>
            </span>
            <span className="text-[12px] text-muted-foreground">
              {short(s.from)} to {short(s.to)}
              {s.state === "now" && <span className="sr-only"> (now)</span>}
            </span>
          </li>
        ))}
      </ol>
      <p
        className={cn("text-[12.5px]", overdue ? "font-medium text-bad" : "text-muted-foreground")}
      >
        {overdue
          ? `All three terms ended in ${periodLabel(lastMonth)}. The whole loan is due now.`
          : `The whole loan is due by the end of ${periodLabel(lastMonth)}. The rate steps up with each term.`}
      </p>
    </div>
  );
}
