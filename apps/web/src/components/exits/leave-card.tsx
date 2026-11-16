"use client";

import { circleVaultAbi } from "@wealthkart/sdk";
import { DoorOpen, HandCoins, Undo2 } from "lucide-react";
import { useState } from "react";
import { type Address, parseEventLogs } from "viem";

import { Deadline } from "@/components/app/deadline";
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
import { fmt, useCircleAsset } from "@/lib/asset";
import type { CircleGov } from "@/lib/gov-hooks";
import { effectiveNoticeDays, exitPhase, isAhead, noticeText } from "@/lib/governance";
import { messages } from "@/lib/messages";
import { formatBps } from "@/lib/rules";
import { notify } from "@/lib/toast";
import { useVaultAction } from "@/lib/use-vault-action";
import "@/i18n/en/exits";

/**
 * Gas limit for `claimExit`. The exit queue walk stops quietly when less than 150k gas is left
 * (Exits.MIN_GAS_PER_EXIT) instead of reverting, so a wallet's estimate finds the cheapest run,
 * which pays nobody and still succeeds. A fixed limit covers the walk to you; unused gas is
 * refunded. Remove once the contract reverts when it can't reach the caller.
 */
const CLAIM_EXIT_GAS = 1_500_000n;

/**
 * "Leaving the circle" (ADR 0039): ask to leave with the notice and fee spelled out, then
 * follow the exit until the share is collected. Shown on the circle overview to members.
 */
export function LeaveCard({
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
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const { asset } = useCircleAsset(circle);
  // Device language in English (as before); the chosen language otherwise.
  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? undefined : intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const request = useVaultAction(circle);
  const cancel = useVaultAction(circle);
  const claim = useVaultAction(circle);
  const rules = gov.rules;
  const rageQuit = isAhead(gov.rageQuitUntil, chainNow);
  const noticeDays = effectiveNoticeDays(rules?.exitNoticeDays ?? 0, gov.rageQuitUntil, chainNow);
  const feeBps = gov.exit
    ? Math.min(gov.exit.feeBps, rules?.exitFeeBps ?? gov.exit.feeBps)
    : (rules?.exitFeeBps ?? 0);
  const phase = exitPhase(gov.exit, chainNow, gov.exitsWaiting);
  const blocked = gov.frozen
    ? messages.memberFrozen()
    : gov.loanTies > 0
      ? messages.hasLoanTies()
      : undefined;

  async function ask() {
    const receipt = await request.send("requestExit");
    if (receipt) {
      setOpen(false);
      request.tx.reset();
      notify.success(
        noticeDays === 0
          ? t("exits.askedNow")
          : t("exits.askedAfter", { notice: noticeText(noticeDays) }),
      );
      onChanged();
    }
  }

  async function stay() {
    const receipt = await cancel.send("cancelExit");
    if (receipt) {
      notify.success(t("exits.stayingToast"));
      onChanged();
    }
  }

  async function collect() {
    const receipt = await claim.send("claimExit", undefined, undefined, CLAIM_EXIT_GAS);
    if (!receipt) return;
    const logs = parseEventLogs({ abi: circleVaultAbi, logs: receipt.logs });
    const paid = logs.find((l) => l.eventName === "ExitPaid");
    if (paid && "payout" in paid.args) {
      notify.success(
        t("exits.paidToast", {
          amount: fmt(paid.args.payout as bigint, asset),
          symbol: asset.symbol,
        }),
      );
    } else {
      notify.info(t("exits.cantPayYet"));
    }
    onChanged();
  }

  return (
    <section
      aria-labelledby="leave-heading"
      className="grid content-start gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
    >
      <div className="grid gap-1.5">
        <h3 id="leave-heading" className="text-[15px] font-semibold">
          {t("exits.title")}
        </h3>
        <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {(rules?.exitFeeBps ?? 0) > 0
            ? t("exits.introWithFee", {
                symbol: asset.symbol,
                fee: formatBps(rules!.exitFeeBps),
              })
            : t("exits.introNoFee", { symbol: asset.symbol })}
        </p>
      </div>

      {phase === "none" && (
        <>
          {rageQuit && (
            <InlineAlert tone="info" title={t("exits.rageTitle")}>
              {t("exits.rageBody", { date: dateFmt.format(new Date(gov.rageQuitUntil * 1000)) })}
            </InlineAlert>
          )}
          <dl className="grid gap-4 sm:grid-cols-3">
            <Fact label={t("exits.notice")} value={noticeText(noticeDays)} />
            <Fact label={t("exits.leavingFee")} value={formatBps(feeBps)} />
            <Fact
              label={t("exits.shareToday")}
              value={`${fmt(gov.exitValue, asset)} ${asset.symbol}`}
            />
          </dl>
          <div>
            <Button
              variant="secondary"
              icon={DoorOpen}
              onClick={() => {
                request.tx.reset();
                setOpen(true);
              }}
              disabled={Boolean(blocked)}
              disabledReason={blocked}
            >
              {t("exits.leave")}
            </Button>
            {blocked && <p className="mt-3 text-[12.5px] text-muted-foreground">{blocked}</p>}
          </div>
        </>
      )}

      {phase !== "none" && gov.exit && (
        <div className="grid gap-5" data-testid="exit-status">
          <div className="grid gap-2">
            <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
              {phase === "notice"
                ? t("exits.phaseNotice")
                : phase === "ready"
                  ? t("exits.phaseReady")
                  : t("exits.phaseWaiting")}
            </span>
            <p className="font-display text-[30px] leading-tight tracking-tight">
              {phase === "notice"
                ? t("exits.askedTitle")
                : `${fmt(gov.exitValue, asset)} ${asset.symbol}`}
            </p>
            <Deadline
              deadline={gov.exit.maturesAt}
              chainNow={chainNow}
              prefix={t("exits.collectFrom")}
              pastText={t("exits.noticeOver")}
            />
          </div>

          {phase === "waiting" && (
            <InlineAlert tone="warn" title={t("exits.phaseWaiting")}>
              {t("exits.waitingBody")}
            </InlineAlert>
          )}
          {phase === "notice" && (
            <p className="text-[13.5px] text-muted-foreground">{t("exits.noticeBody")}</p>
          )}

          <div className="flex flex-wrap gap-3">
            {phase !== "notice" && (
              <Button
                icon={HandCoins}
                workingLabel={t("exits.collecting")}
                state={claim.working ? "working" : undefined}
                onClick={collect}
              >
                {t("exits.collect")}
              </Button>
            )}
            <Button
              variant="secondary"
              icon={Undo2}
              workingLabel={t("exits.withdrawing")}
              state={cancel.working ? "working" : undefined}
              onClick={stay}
            >
              {t("exits.stay")}
            </Button>
          </div>
          <TxFor tx={claim.tx} />
          <TxFor tx={cancel.tx} />
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !request.working && setOpen(v)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("exits.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {noticeDays === 0
                ? t("exits.dialogNoNotice")
                : t("exits.dialogNotice", { notice: noticeText(noticeDays) })}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-4 rounded-[12px] bg-secondary/60 p-5">
            <Fact
              label={t("exits.ifLeft")}
              value={`${fmt(gov.exitValue, asset)} ${asset.symbol}`}
              big
            />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {feeBps > 0
                ? t("exits.finalWithFee", { fee: formatBps(feeBps) })
                : t("exits.finalNoFee")}
            </p>
          </dl>
          <div className="grid gap-4 pt-1">
            <Button
              icon={DoorOpen}
              workingLabel={t("exits.asking")}
              state={request.working ? "working" : undefined}
              onClick={ask}
            >
              {t("exits.yesLeave")}
            </Button>
            <TxFor tx={request.tx} />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Fact({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="grid gap-1">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd
        className={
          big
            ? "font-display text-[34px] leading-none tracking-tight tabular"
            : "font-mono text-[14px] tabular"
        }
      >
        {value}
      </dd>
    </div>
  );
}
