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
import { fmt, useCircleAsset } from "@/lib/asset";
import type { CircleGov } from "@/lib/gov-hooks";
import { effectiveNoticeDays, exitPhase, isAhead, noticeText } from "@/lib/governance";
import { messages } from "@/lib/messages";
import { formatBps } from "@/lib/rules";
import { notify } from "@/lib/toast";
import { useVaultAction } from "@/lib/use-vault-action";

/**
 * Gas limit for `claimExit`. The exit queue walk stops quietly when less than 150k gas is left
 * (Exits.MIN_GAS_PER_EXIT) instead of reverting, so a wallet's estimate finds the cheapest run,
 * which pays nobody and still succeeds. A fixed limit covers the walk to you; unused gas is
 * refunded. Remove once the contract reverts when it can't reach the caller.
 */
const CLAIM_EXIT_GAS = 1_500_000n;

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

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
  const [open, setOpen] = useState(false);
  const { asset } = useCircleAsset(circle);
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
          ? "You asked to leave. Your share is ready to collect now."
          : `You asked to leave. Your share is ready to collect after ${noticeText(noticeDays)}.`,
      );
      onChanged();
    }
  }

  async function stay() {
    const receipt = await cancel.send("cancelExit");
    if (receipt) {
      notify.success("You're staying. Your request to leave is withdrawn.");
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
        `Done. ${fmt(paid.args.payout as bigint, asset)} ${asset.symbol} was sent to your wallet. You've left the circle.`,
      );
    } else {
      notify.info(
        "The circle can't pay you yet. You keep your place and are paid first when cash comes in.",
      );
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
          Leaving the circle
        </h3>
        <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
          You can leave at any time. Your share is paid in {asset.symbol} at its value on the day
          you collect it
          {(rules?.exitFeeBps ?? 0) > 0
            ? `, minus a ${formatBps(rules!.exitFeeBps)} leaving fee that stays with the circle`
            : ", with no leaving fee"}
          .
        </p>
      </div>

      {phase === "none" && (
        <>
          {rageQuit && (
            <InlineAlert tone="info" title="You can leave before the new rules start">
              New rules start on {dateFmt.format(new Date(gov.rageQuitUntil * 1000))}. If you ask to
              leave now, your notice ends by then and you leave under today&apos;s rules.
            </InlineAlert>
          )}
          <dl className="grid gap-4 sm:grid-cols-3">
            <Fact label="Notice" value={noticeText(noticeDays)} />
            <Fact label="Leaving fee" value={formatBps(feeBps)} />
            <Fact label="Your share today" value={`${fmt(gov.exitValue, asset)} ${asset.symbol}`} />
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
              Leave this circle
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
                ? "Notice period"
                : phase === "ready"
                  ? "Ready to collect"
                  : "Waiting for cash"}
            </span>
            <p className="font-display text-[30px] leading-tight tracking-tight">
              {phase === "notice"
                ? "You asked to leave"
                : `${fmt(gov.exitValue, asset)} ${asset.symbol}`}
            </p>
            <Deadline
              deadline={gov.exit.maturesAt}
              chainNow={chainNow}
              prefix="You can collect from"
              pastText="your notice is over"
            />
          </div>

          {phase === "waiting" && (
            <InlineAlert tone="warn" title="Waiting for cash">
              The circle can&apos;t pay you yet: some of its money is lent out, or someone who asked
              to leave before you is paid first. You keep your place, new loans stop until
              you&apos;re paid, and you can try again at any time.
            </InlineAlert>
          )}
          {phase === "notice" && (
            <p className="text-[13.5px] text-muted-foreground">
              Your share keeps earning with the circle until you collect it. You can change your
              mind until then.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            {phase !== "notice" && (
              <Button
                icon={HandCoins}
                workingLabel="Collecting…"
                state={claim.working ? "working" : undefined}
                onClick={collect}
              >
                Collect my share
              </Button>
            )}
            <Button
              variant="secondary"
              icon={Undo2}
              workingLabel="Withdrawing…"
              state={cancel.working ? "working" : undefined}
              onClick={stay}
            >
              Stay in the circle
            </Button>
          </div>
          <TxFor tx={claim.tx} />
          <TxFor tx={cancel.tx} />
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => !request.working && setOpen(v)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Leave this circle?</DialogTitle>
            <DialogDescription>
              {noticeDays === 0
                ? "There's no notice right now, so you can collect your share straight away."
                : `You give ${noticeText(noticeDays)} notice. After that you collect your share; until then it keeps earning with the circle and you can change your mind.`}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid gap-4 rounded-[12px] bg-secondary/60 p-5">
            <Fact
              label="If you left today you'd get"
              value={`${fmt(gov.exitValue, asset)} ${asset.symbol}`}
              big
            />
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              The final amount is your share at its value on the day you collect it
              {feeBps > 0 ? `, minus the ${formatBps(feeBps)} leaving fee` : ""}. Your name is freed
              and you stop owing installments once you&apos;re paid.
            </p>
          </dl>
          <div className="grid gap-4 pt-1">
            <Button
              icon={DoorOpen}
              workingLabel="Asking…"
              state={request.working ? "working" : undefined}
              onClick={ask}
            >
              Yes, ask to leave
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
