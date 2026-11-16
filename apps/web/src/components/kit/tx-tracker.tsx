"use client";

import * as React from "react";
import { Check, ExternalLink, LoaderCircle, X } from "lucide-react";

import { useT } from "@/i18n/react";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * Pending-transaction tracker (docs/ui.md §10): Confirm in Core -> Sending -> Confirmed.
 * Presentational only; the caller maps its transaction hook to `status`.
 */
export type TxStatus = "confirm" | "sending" | "confirmed" | "failed";
type StepKey = "confirm" | "sending" | "confirmed";

export interface TxTrackerProps {
  status: TxStatus;
  /** For `failed`: the step that failed. Default "sending". */
  failedAt?: "confirm" | "sending";
  /** Plain-language reason shown under the steps when failed (from the catalogue). */
  failedMessage?: string;
  /** Snowtrace link for the transaction, once there is a hash. */
  explorerUrl?: string;
  className?: string;
}

const STEPS: Array<{ key: StepKey; label: () => string }> = [
  { key: "confirm", label: messages.txStepConfirm },
  { key: "sending", label: messages.txStepSending },
  { key: "confirmed", label: messages.txStepConfirmed },
];

type StepState = "done" | "current" | "upcoming" | "failed";

function stepState(step: StepKey, status: TxStatus, failedAt: StepKey): StepState {
  const order: StepKey[] = ["confirm", "sending", "confirmed"];
  const i = order.indexOf(step);
  if (status === "confirmed") return "done";
  const active = status === "failed" ? failedAt : status;
  const a = order.indexOf(active);
  if (i < a) return "done";
  if (i === a) return status === "failed" ? "failed" : "current";
  return "upcoming";
}

export function TxTracker({
  status,
  failedAt = "sending",
  failedMessage,
  explorerUrl,
  className,
}: TxTrackerProps) {
  const { t } = useT();
  return (
    <div className={cn("space-y-5", className)} data-status={status}>
      <ol
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-3"
        aria-label={t("kit.txProgress")}
      >
        {STEPS.map((step, index) => {
          const s = stepState(step.key, status, failedAt);
          return (
            <li
              key={step.key}
              className="flex items-center gap-3 sm:flex-1"
              data-step={step.key}
              data-step-state={s}
              aria-current={s === "current" ? "step" : undefined}
            >
              <StepDot state={s} />
              <span
                className={cn(
                  "text-[14.5px] whitespace-nowrap",
                  s === "upcoming" && "text-faint",
                  s === "current" && "font-semibold text-foreground",
                  s === "done" && "text-foreground",
                  s === "failed" && "font-semibold text-bad",
                )}
              >
                {step.label()}
              </span>
              {index < STEPS.length - 1 && (
                <span
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    s === "done" ? "bg-foreground/30" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>

      {status === "failed" && (
        <p role="alert" className="text-[14.5px] leading-relaxed text-foreground">
          {failedMessage ?? messages.txFailed()}
        </p>
      )}

      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full text-[13.5px] font-medium text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-brand/35"
        >
          {t("kit.viewOnExplorer")}
          <ExternalLink size={14} strokeWidth={1.5} aria-hidden />
        </a>
      )}
    </div>
  );
}

function StepDot({ state }: { state: StepState }) {
  const base = "inline-flex size-7 shrink-0 items-center justify-center rounded-full border";
  switch (state) {
    case "done":
      return (
        <span className={cn(base, "border-good/25 bg-good-soft text-good")} aria-hidden>
          <Check size={14} strokeWidth={2} />
        </span>
      );
    case "current":
      return (
        <span className={cn(base, "border-brand/25 bg-brand-soft text-brand")} aria-hidden>
          <LoaderCircle size={14} strokeWidth={2} className="animate-spin" />
        </span>
      );
    case "failed":
      return (
        <span className={cn(base, "border-bad/25 bg-bad-soft text-bad")} aria-hidden>
          <X size={14} strokeWidth={2} />
        </span>
      );
    default:
      return <span className={cn(base, "border-border bg-card")} aria-hidden />;
  }
}
