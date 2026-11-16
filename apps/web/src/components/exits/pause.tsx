"use client";

import { Pause, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { Address } from "viem";

import { TxFor } from "@/components/app/tx-for";
import { Button, InlineAlert } from "@/components/kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/react";
import { intlLocale } from "@/i18n/runtime";
import { useChainNow } from "@/lib/circle";
import { type CircleGov, useCircleGov } from "@/lib/gov-hooks";
import { isAhead, PAUSE_COOLDOWN_DAYS, PAUSE_DAYS } from "@/lib/governance";
import { notify } from "@/lib/toast";
import { useVaultAction } from "@/lib/use-vault-action";

/**
 * Guardian pause banner (ADR 0020, 0039), shown on circle pages while `pausedUntil` is ahead.
 * The guardian (the creator) also gets Unpause here.
 */
export function PauseBanner({
  circle,
  gov,
  chainNow,
  onChanged,
}: {
  circle: Address;
  gov: CircleGov;
  chainNow: number;
  onChanged: () => void;
}) {
  const { t, locale, formatDate } = useT();
  const unpause = useVaultAction(circle);
  if (!isAhead(gov.pausedUntil, chainNow)) return null;
  const when = formatDate(new Date(gov.pausedUntil * 1000), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  // Device language in English (as before); the chosen language otherwise.
  const local = new Intl.DateTimeFormat(locale === "en" ? undefined : intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(gov.pausedUntil * 1000));

  async function resume() {
    const receipt = await unpause.send("unpause");
    if (receipt) {
      notify.success(t("exits.unpausedToast"));
      onChanged();
    }
  }

  return (
    <div className="grid gap-4" data-testid="pause-banner">
      <InlineAlert
        tone="warn"
        icon={ShieldAlert}
        title={t("exits.bannerTitle", { when })}
        action={
          gov.isGuardian ? (
            <Button
              variant="secondary"
              icon={Play}
              workingLabel={t("exits.ending")}
              state={unpause.working ? "working" : undefined}
              onClick={resume}
            >
              {t("exits.unpause")}
            </Button>
          ) : undefined
        }
      >
        {t("exits.bannerBody", { local })}
      </InlineAlert>
      <TxFor tx={unpause.tx} />
    </div>
  );
}

/**
 * The guardian's Pause button with a confirm dialog that explains the limits: 14 days at most,
 * once every 90 days, and never blocking exits or payments.
 */
export function GuardianPause({
  circle,
  gov,
  chainNow,
  onChanged,
}: {
  circle: Address;
  gov: CircleGov;
  chainNow: number;
  onChanged: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const pause = useVaultAction(circle);
  if (!gov.isGuardian || gov.dissolved || isAhead(gov.pausedUntil, chainNow)) return null;

  async function confirm() {
    const receipt = await pause.send("pause");
    if (receipt) {
      setOpen(false);
      pause.tx.reset();
      notify.success(t("exits.pausedToast", { days: PAUSE_DAYS }));
      onChanged();
    }
  }

  return (
    <section className="grid content-start gap-5 rounded-[14px] border border-border bg-card p-[26px] sm:p-8">
      <div className="grid gap-1.5">
        <h3 className="text-[15px] font-semibold">{t("exits.guardianTitle")}</h3>
        <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {gov.guardianDisabled ? t("exits.guardianOffBody") : t("exits.guardianBody")}
        </p>
      </div>
      {!gov.guardianDisabled && (
        <div>
          <Button
            variant="secondary"
            icon={Pause}
            onClick={() => {
              pause.tx.reset();
              setOpen(true);
            }}
          >
            {t("exits.pauseCircle")}
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={(v) => !pause.working && setOpen(v)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("exits.pauseDialogTitle")}</DialogTitle>
            <DialogDescription>{t("exits.pauseDialogDesc")}</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-3 text-[13.5px] leading-relaxed text-muted-foreground">
            <li>{t("exits.pauseRuleDays", { days: PAUSE_DAYS })}</li>
            <li>{t("exits.pauseRuleCooldown", { days: PAUSE_COOLDOWN_DAYS })}</li>
            <li>{t("exits.pauseRuleStillWorks")}</li>
            <li>{t("exits.pauseRuleVoteOff")}</li>
          </ul>
          <div className="grid gap-4 pt-1">
            <Button
              icon={Pause}
              workingLabel={t("exits.pausing")}
              state={pause.working ? "working" : undefined}
              onClick={confirm}
            >
              {t("exits.pauseFor", { days: PAUSE_DAYS })}
            </Button>
            <TxFor tx={pause.tx} />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The pause banner for pages that don't load governance state themselves (Pay, Activity). */
export function CirclePauseBanner({ circle }: { circle: Address }) {
  const g = useCircleGov(circle);
  const chainNow = useChainNow();
  if (!g.data || !isAhead(g.data.pausedUntil, chainNow)) return null;
  return (
    <div className="mb-10">
      <PauseBanner
        circle={circle}
        gov={g.data}
        chainNow={chainNow}
        onChanged={() => void g.refetch()}
      />
    </div>
  );
}
