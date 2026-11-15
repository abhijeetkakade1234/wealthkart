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
import { useChainNow } from "@/lib/circle";
import { type CircleGov, useCircleGov } from "@/lib/gov-hooks";
import { isAhead, PAUSE_COOLDOWN_DAYS, PAUSE_DAYS } from "@/lib/governance";
import { notify } from "@/lib/toast";
import { useVaultAction } from "@/lib/use-vault-action";

const whenFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

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
  const unpause = useVaultAction(circle);
  if (!isAhead(gov.pausedUntil, chainNow)) return null;
  const local = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(gov.pausedUntil * 1000));

  async function resume() {
    const receipt = await unpause.send("unpause");
    if (receipt) {
      notify.success("The pause is over. New members and loans can go ahead again.");
      onChanged();
    }
  }

  return (
    <div className="grid gap-4" data-testid="pause-banner">
      <InlineAlert
        tone="warn"
        icon={ShieldAlert}
        title={`New members and loans are paused until ${whenFmt.format(new Date(gov.pausedUntil * 1000))} UTC`}
        action={
          gov.isGuardian ? (
            <Button
              variant="secondary"
              icon={Play}
              workingLabel="Ending…"
              state={unpause.working ? "working" : undefined}
              onClick={resume}
            >
              Unpause
            </Button>
          ) : undefined
        }
      >
        Your time: {local}. The guardian paused the circle for safety. Leaving and paying still work
        as usual, and no late fees come from the pause.
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
  const [open, setOpen] = useState(false);
  const pause = useVaultAction(circle);
  if (!gov.isGuardian || gov.dissolved || isAhead(gov.pausedUntil, chainNow)) return null;

  async function confirm() {
    const receipt = await pause.send("pause");
    if (receipt) {
      setOpen(false);
      pause.tx.reset();
      notify.success(`Paused for ${PAUSE_DAYS} days. Members see a note on every circle page.`);
      onChanged();
    }
  }

  return (
    <section className="grid content-start gap-5 rounded-[14px] border border-border bg-card p-[26px] sm:p-8">
      <div className="grid gap-1.5">
        <h3 className="text-[15px] font-semibold">You&apos;re this circle&apos;s guardian</h3>
        <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {gov.guardianDisabled
            ? "The members voted the guardian off, so pausing isn't possible any more."
            : "If something looks wrong, you can pause new members and loans for a short time while the circle talks it over."}
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
            Pause the circle
          </Button>
        </div>
      )}
      <Dialog open={open} onOpenChange={(v) => !pause.working && setOpen(v)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Pause new members and loans?</DialogTitle>
            <DialogDescription>
              Use this only when something looks wrong, for example a wallet you don&apos;t
              recognise asking to join.
            </DialogDescription>
          </DialogHeader>
          <ul className="grid gap-3 text-[13.5px] leading-relaxed text-muted-foreground">
            <li>The pause lasts {PAUSE_DAYS} days at most. You can end it sooner with Unpause.</li>
            <li>You can pause once every {PAUSE_COOLDOWN_DAYS} days, counted from the start.</li>
            <li>
              Members can still pay, leave and collect their share. Nobody gets a late fee because
              of the pause.
            </li>
            <li>The members can vote to take this power away from the guardian.</li>
          </ul>
          <div className="grid gap-4 pt-1">
            <Button
              icon={Pause}
              workingLabel="Pausing…"
              state={pause.working ? "working" : undefined}
              onClick={confirm}
            >
              Pause for {PAUSE_DAYS} days
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
