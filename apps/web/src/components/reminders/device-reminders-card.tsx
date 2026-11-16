"use client";

import { shortAddress } from "@wealthkart/sdk";
import { BellOff, BellRing, Send } from "lucide-react";

import { Button } from "@/components/kit";
import { messages } from "@/lib/messages";
import { displayAddress } from "@/lib/push";
import { notify } from "@/lib/toast";
import { reminderError, type useReminders } from "@/lib/use-reminders";

import { ReminderGate } from "./reminder-gate";

/**
 * Reminders on this device (ADR 0052), on the Settings page: the permission flow, then which
 * wallet they're for, a test notification and "turn off".
 */
export function DeviceRemindersCard({
  reminders: r,
  circles,
}: {
  reminders: ReturnType<typeof useReminders>;
  /** Reads the circles to switch on, at the moment reminders are turned on here. */
  circles: () => Promise<string[]>;
}) {
  return (
    <section
      aria-labelledby="device-reminders-title"
      className="grid content-start gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
    >
      <div className="grid gap-1.5">
        <h2
          id="device-reminders-title"
          className="flex items-center gap-2 text-[17px] font-semibold"
        >
          <BellRing size={18} strokeWidth={1.5} aria-hidden className="text-brand" />
          Reminders on this device
        </h2>
        <p className="max-w-[60ch] text-[14px] leading-relaxed text-muted-foreground">
          We send a short note when an installment is due, a late fee is close, loan interest is
          due, a vote needs you, or money is ready to collect. Deadlines are in UTC, with your own
          time added on the device. We keep only your wallet address and this device&apos;s push
          address; no name, email or phone number.
        </p>
      </div>

      {r.status !== "on" ? (
        <ReminderGate
          status={r.status}
          otherWallet={r.device?.address}
          onTurnOn={async () => r.turnOn(await circles())}
        />
      ) : (
        <div className="grid gap-6">
          <p className="text-[14px]" data-testid="reminders-on">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-0.5 text-[12.5px] text-good">
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              On
            </span>
            <span className="ml-3 text-muted-foreground">
              for wallet{" "}
              <span className="font-mono text-[13px] text-foreground">
                {shortAddress(displayAddress(r.device?.address ?? ""))}
              </span>
            </span>
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              icon={Send}
              iconAnimation="nudge"
              workingLabel="Sending…"
              doneLabel="Sent"
              onAction={async () => {
                const res = await r.sendTest();
                if (res.gone) throw Object.assign(new Error("gone"), { gone: true });
                if (!res.sent) throw new Error("not sent");
              }}
              onSuccess={() => notify.success(messages.remindersTestSent())}
              onError={(err) =>
                notify.error(
                  (err as { gone?: boolean }).gone
                    ? messages.remindersDeviceGone()
                    : err instanceof Error && err.message === "not sent"
                      ? messages.remindersTestFailed()
                      : reminderError(err),
                )
              }
            >
              Send a test
            </Button>
            <Button
              variant="ghost"
              icon={BellOff}
              workingLabel="Turning off…"
              onAction={() => r.turnOff()}
              onSuccess={() => notify.success(messages.remindersOff())}
              onError={(err) => notify.error(reminderError(err))}
            >
              Turn off on this device
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
