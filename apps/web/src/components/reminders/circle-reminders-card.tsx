"use client";

import { BellRing } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { StateView } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { messages } from "@/lib/messages";
import { ALL_KINDS, hasKind, KIND_ROWS, type ReminderKind, toggleKind } from "@/lib/push";
import { notify } from "@/lib/toast";
import { reminderError, useReminders } from "@/lib/use-reminders";

import { ReminderGate } from "./reminder-gate";
import { ReminderSwitch } from "./reminder-switch";

/**
 * Reminders for one circle (ADR 0052), on the circle overview. Before reminders are on for this
 * device it shows the permission flow; after, one switch per kind for this circle only.
 */
export function CircleRemindersCard({ circle }: { circle: string }) {
  const r = useReminders();
  const [busy, setBusy] = useState<ReminderKind | null>(null);
  const kinds = r.kindsFor(circle);

  async function flip(kind: ReminderKind, on: boolean) {
    setBusy(kind);
    try {
      await r.setCircle.mutateAsync({ circle, kinds: toggleKind(kinds, kind, on) });
    } catch (err) {
      notify.error(reminderError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="circle-reminders-title"
      className="grid content-start gap-5 rounded-[14px] border border-border bg-card p-[26px]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <h3
            id="circle-reminders-title"
            className="flex items-center gap-2 text-[15px] font-semibold"
          >
            <BellRing size={16} strokeWidth={1.5} aria-hidden className="text-brand" />
            Reminders for this circle
          </h3>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            A quiet nudge on this device before money is due or a vote closes. Nothing else.
          </p>
        </div>
      </div>

      {r.status !== "on" ? (
        <ReminderGate
          status={r.status}
          otherWallet={r.device?.address}
          onTurnOn={() => r.turnOn([circle])}
        />
      ) : r.settings.isPending ? (
        <StateView
          state="loading"
          label="Loading reminder settings"
          skeleton={
            <div className="grid gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          }
        />
      ) : r.settings.isError ? (
        <StateView
          state="error"
          message={messages.remindersFailed()}
          onRetry={() => r.settings.refetch()}
        />
      ) : (
        <div className="grid">
          <div className="divide-y divide-line-soft">
            {KIND_ROWS.map((row) => (
              <ReminderSwitch
                key={row.kind}
                label={row.label}
                hint={row.hint}
                checked={hasKind(kinds, row.kind)}
                busy={busy === row.kind}
                disabled={busy !== null}
                onChange={(on) => void flip(row.kind, on)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-[13px]">
            <span className="text-muted-foreground">
              {kinds === 0
                ? "All off for this circle."
                : kinds === ALL_KINDS
                  ? "All on for this circle."
                  : "Some on for this circle."}
            </span>
            <Link
              href="/app/settings/"
              className="font-medium text-brand underline-offset-4 hover:underline"
            >
              All reminder settings
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
