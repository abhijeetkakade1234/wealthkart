"use client";

import Link from "next/link";
import { shortAddress } from "@wealthkart/sdk";
import { BellOff, BellRing, Send } from "lucide-react";

import { Button } from "@/components/kit";
import { useT } from "@/i18n/react";
import { messages } from "@/lib/messages";
import { displayAddress } from "@/lib/push";
import { notify } from "@/lib/toast";
import { reminderError, type useReminders } from "@/lib/use-reminders";

import { ReminderGate } from "./reminder-gate";
import "@/i18n/en/reminders";

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
  const { t } = useT();
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
          {t("reminders.deviceTitle")}
        </h2>
        <p className="max-w-[60ch] text-[14px] leading-relaxed text-muted-foreground">
          {t("reminders.deviceIntro")}{" "}
          <Link
            href="/privacy/#reminders"
            className="font-medium text-brand underline-offset-4 hover:underline"
          >
            {t("reminders.whatWeKeep")}
          </Link>
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
              {t("reminders.on")}
            </span>
            <span className="ml-3 text-muted-foreground">
              {t("reminders.forWallet")}{" "}
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
              workingLabel={t("reminders.sending")}
              doneLabel={t("reminders.sent")}
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
              {t("reminders.sendTest")}
            </Button>
            <Button
              variant="ghost"
              icon={BellOff}
              workingLabel={t("reminders.turningOff")}
              onAction={() => r.turnOff()}
              onSuccess={() => notify.success(messages.remindersOff())}
              onError={(err) => notify.error(reminderError(err))}
            >
              {t("reminders.turnOff")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
