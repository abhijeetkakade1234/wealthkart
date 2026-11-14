import { cn } from "@/lib/utils";

/** Big-number tile (docs/ui.md §3). Tone tints the card for meaning, never decoration. */
export function StatCard({
  label,
  value,
  unit,
  meta,
  tone = "plain",
  children,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  meta?: React.ReactNode;
  tone?: "plain" | "due";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid content-start gap-2.5 rounded-[14px] border p-[26px]",
        tone === "due" ? "border-[#f1e2c4] bg-warn-soft" : "border-border bg-card",
      )}
    >
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className="font-display text-[40px] leading-none tracking-tight tabular">
        {value}
        {unit && (
          <small className="ml-1.5 font-sans text-[13px] tracking-normal text-muted-foreground">
            {unit}
          </small>
        )}
      </span>
      {meta && <span className="text-[12.5px] text-muted-foreground">{meta}</span>}
      {children}
    </div>
  );
}
