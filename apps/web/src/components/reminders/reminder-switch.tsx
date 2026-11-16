"use client";

import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A quiet on/off switch row (Gallery, ADR 0025): label and hint on the left, a small track on
 * the right. `role="switch"` so screen readers and tests read "on" or "off".
 */
export function ReminderSwitch({
  label,
  hint,
  checked,
  busy,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="grid min-w-0 gap-1">
        <span className="text-[14.5px] font-medium">{label}</span>
        {hint && <span className="text-[13px] leading-relaxed text-muted-foreground">{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full border transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "border-brand bg-brand" : "border-border bg-secondary",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex size-[20px] items-center justify-center rounded-full bg-background shadow-sm transition-transform duration-200 motion-reduce:transition-none",
            checked ? "translate-x-[22px]" : "translate-x-[2px]",
          )}
        >
          {busy && <LoaderCircle size={12} className="animate-spin text-muted-foreground" />}
        </span>
      </button>
    </div>
  );
}
