"use client";

import { shortAddress } from "@wealthkart/sdk";
import { Bell, BellOff, Share, Smartphone } from "lucide-react";

import { Button, InlineAlert } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/react";
import { messages } from "@/lib/messages";
import { displayAddress } from "@/lib/push";
import { notify } from "@/lib/toast";
import { reminderError, type ReminderStatus } from "@/lib/use-reminders";

/**
 * Everything before reminders are on for this device (ADR 0052): loading, not set up on this
 * site, unsupported browser, iPhone needing Add to Home Screen, notifications blocked, off, or
 * on for another wallet. Renders nothing once they're on, so cards show their switches.
 */
export function ReminderGate({
  status,
  otherWallet,
  onTurnOn,
  turnOnLabel,
}: {
  status: ReminderStatus;
  otherWallet?: string;
  onTurnOn: () => Promise<void>;
  /** Defaults to "Turn on reminders". */
  turnOnLabel?: string;
}) {
  const { t } = useT();
  if (status === "on") return null;
  if (status === "loading") {
    return (
      <div className="grid gap-3" aria-busy="true" aria-label={t("reminders.loading")}>
        <Skeleton className="h-5 w-2/3 rounded-md" />
        <Skeleton className="h-10 w-44 rounded-[10px]" />
      </div>
    );
  }
  if (status === "not-set-up") {
    return (
      <InlineAlert tone="info" icon={BellOff}>
        {messages.remindersNotSetUp()}
      </InlineAlert>
    );
  }
  if (status === "unsupported") {
    return (
      <InlineAlert tone="info" icon={BellOff}>
        {messages.remindersUnsupported()}
      </InlineAlert>
    );
  }
  if (status === "ios-install") {
    return (
      <InlineAlert tone="info" icon={Smartphone} title={t("reminders.iosTitle")}>
        <span className="inline-flex flex-wrap items-center gap-1">
          {messages.remindersIosInstall()}
          <Share size={14} strokeWidth={1.5} aria-hidden className="ml-1" />
        </span>
      </InlineAlert>
    );
  }
  if (status === "denied") {
    return (
      <InlineAlert tone="warn" icon={BellOff} title={t("reminders.deniedTitle")}>
        {messages.remindersDenied()}
      </InlineAlert>
    );
  }

  const turnOn = (
    <Button
      icon={Bell}
      iconAnimation="lift"
      workingLabel={t("reminders.waitingForCore")}
      doneLabel={t("reminders.remindersOn")}
      onAction={onTurnOn}
      onSuccess={() => notify.success(messages.remindersOn())}
      onError={(err) => notify.error(reminderError(err))}
    >
      {status === "other-wallet"
        ? t("reminders.useThisWallet")
        : (turnOnLabel ?? t("reminders.turnOn"))}
    </Button>
  );

  return (
    <div className="grid gap-5">
      {status === "other-wallet" && otherWallet ? (
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {messages.remindersOtherWallet(shortAddress(displayAddress(otherWallet)))}
        </p>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {t("reminders.signExplain")}
        </p>
      )}
      <div>{turnOn}</div>
    </div>
  );
}
