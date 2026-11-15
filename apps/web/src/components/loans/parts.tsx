import { cn } from "@/lib/utils";
import { type LoanRowStatus, STATUS_LABEL } from "@/lib/loans";

/** Shared pieces of the Loans screens. */

export const inputCls =
  "h-11 w-full rounded-[10px] border border-border bg-background px-3.5 text-[14px] tabular outline-none transition focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20 aria-[invalid=true]:border-bad";

export function Fact({
  label,
  value,
  hint,
  big,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  big?: boolean;
  testId?: string;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd
        data-testid={testId}
        className={
          big
            ? "font-display text-[40px] leading-none tracking-tight tabular"
            : "font-mono text-[14.5px] tabular"
        }
      >
        {value}
      </dd>
      {hint && <dd className="text-[12px] leading-relaxed text-muted-foreground">{hint}</dd>}
    </div>
  );
}

const PILL: Record<LoanRowStatus, string> = {
  voting: "bg-brand-soft text-brand",
  active: "bg-good-soft text-good",
  default: "bg-bad-soft text-bad",
  repaid: "bg-secondary text-muted-foreground",
  settled: "bg-warn-soft text-warn",
  declined: "bg-secondary text-muted-foreground",
};

/** Status of a loan as a dot and a word; colour never stands alone. */
export function StatusPill({ status }: { status: LoanRowStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12.5px]",
        PILL[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Small uppercase heading used above each block of the page. */
export function SectionLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h2>
  );
}
