import * as React from "react";
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * In-page attention message, placed under the page header (docs/ui.md §12):
 * dues, wrong network, a rule change coming in 3 days. Not for action results
 * (those are toasts).
 */
export type InlineAlertTone = "info" | "warn" | "bad";

const TONES: Record<InlineAlertTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: "border-brand/15 bg-brand-soft", icon: "text-brand", Icon: Info },
  warn: { box: "border-warn/20 bg-warn-soft", icon: "text-warn", Icon: TriangleAlert },
  bad: { box: "border-bad/20 bg-bad-soft", icon: "text-bad", Icon: CircleAlert },
};

export interface InlineAlertProps {
  tone?: InlineAlertTone;
  title?: string;
  children?: React.ReactNode;
  /** Optional action on the right, e.g. a kit Button. */
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function InlineAlert({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
}: InlineAlertProps) {
  const t = TONES[tone];
  const Icon = icon ?? t.Icon;
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      data-tone={tone}
      className={cn(
        "flex flex-col gap-4 rounded-[14px] border px-5 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-5",
        t.box,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <Icon size={18} strokeWidth={1.5} className={cn("mt-0.5 shrink-0", t.icon)} aria-hidden />
        <div className="min-w-0 space-y-1 text-[14.5px] leading-relaxed">
          {title && <p className="font-semibold text-foreground">{title}</p>}
          {children && <div className="text-foreground/80">{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </div>
  );
}
