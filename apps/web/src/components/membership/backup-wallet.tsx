"use client";

import { shortAddress } from "@wealthkart/sdk";
import { HandCoins, LifeBuoy, ShieldCheck, ShieldOff, Undo2, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Address } from "viem";

import { Deadline } from "@/components/app/deadline";
import { TxFor } from "@/components/app/tx-for";
import { Avatar } from "@/components/art";
import { Button, InlineAlert, StateView } from "@/components/kit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { rich, useT } from "@/i18n/react";
import { fmt, type CircleAsset } from "@/lib/asset";
import { messages } from "@/lib/messages";
import { claimNoticeDays, claimPhase, exitsToProcess, nomineeProblem } from "@/lib/nominee";
import { type ClaimState, useExitQueue, useMyBackupWallet, useNamedBy } from "@/lib/nominee-hooks";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useVaultAction } from "@/lib/use-vault-action";

const inputCls =
  "h-11 w-full rounded-[10px] border border-border bg-background px-3.5 font-mono text-[13.5px] outline-none transition focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20 aria-[invalid=true]:border-bad";

/** Gas per exit `processExits` may settle on the way to the claim (Exits.SETTLE_GAS + payout). */
const GAS_PER_EXIT = 320_000n;

/**
 * "Backup wallet" (ADR 0016, 0056): the member names one wallet that can ask for their share
 * if the circle marks them dormant and then votes yes. Shown to members on the circle page.
 */
export function BackupWalletCard({
  circle,
  me,
  exitNoticeDays,
  onChanged,
}: {
  circle: Address;
  me: Address;
  exitNoticeDays: number;
  onChanged: () => void;
}) {
  const { t } = useT();
  const b = useMyBackupWallet(circle);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [touched, setTouched] = useState(false);
  const save = useVaultAction(circle);
  const clear = useVaultAction(circle);
  const problem = nomineeProblem(draft, me, circle);
  const claimOpen = Boolean(b.data && claimPhase(b.data.claim, 0) !== "none");

  async function submit() {
    setTouched(true);
    if (problem) return;
    const receipt = await save.send("setNominee", [draft.trim() as Address]);
    if (receipt) {
      notify.success(messages.nomineeSaved());
      setOpen(false);
      save.tx.reset();
      b.refetch();
      onChanged();
    }
  }

  async function remove() {
    const receipt = await clear.send("setNominee", ["0x0000000000000000000000000000000000000000"]);
    if (receipt) {
      notify.success(messages.nomineeCleared());
      b.refetch();
      onChanged();
    }
  }

  return (
    <section
      aria-labelledby="backup-heading"
      data-testid="backup-wallet-card"
      className="grid content-start gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
    >
      <div className="grid gap-1.5">
        <h3 id="backup-heading" className="text-[15px] font-semibold">
          {t("nominee.title")}
        </h3>
        <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {t("nominee.body")}
        </p>
      </div>

      {b.isPending ? (
        <StateView
          state="loading"
          label={t("nominee.loading")}
          skeleton={<Skeleton className="h-14 w-full rounded-[12px]" />}
        />
      ) : b.isError || !b.data ? (
        <StateView state="error" onRetry={() => b.refetch()} />
      ) : b.data.nominee ? (
        <div className="flex items-center gap-4" data-testid="backup-wallet-set">
          <Avatar address={b.data.nominee} size={40} />
          <div className="grid gap-0.5">
            <span className="font-medium">{b.data.nomineeName || t("nominee.noNameHere")}</span>
            <span className="font-mono text-[12.5px] text-muted-foreground" title={b.data.nominee}>
              {shortAddress(b.data.nominee)}
            </span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2.5 py-0.5 text-[12px] text-good">
            <ShieldCheck className="size-3.5" strokeWidth={1.5} aria-hidden />
            {t("nominee.set")}
          </span>
        </div>
      ) : (
        <p className="text-[13.5px] text-muted-foreground" data-testid="backup-wallet-empty">
          {t("nominee.empty")}
        </p>
      )}

      {b.data && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant={b.data.nominee ? "secondary" : "primary"}
            icon={LifeBuoy}
            onClick={() => {
              setDraft("");
              setTouched(false);
              save.tx.reset();
              setOpen(true);
            }}
            disabled={claimOpen}
            disabledReason={claimOpen ? t("nominee.cancelClaimFirst") : undefined}
          >
            {b.data.nominee ? t("nominee.change") : t("nominee.add")}
          </Button>
          {b.data.nominee && !claimOpen && (
            <Button
              variant="ghost"
              icon={ShieldOff}
              workingLabel={t("nominee.removing")}
              state={clear.working ? "working" : undefined}
              onClick={remove}
            >
              {t("nominee.remove")}
            </Button>
          )}
        </div>
      )}
      <TxFor tx={clear.tx} />

      <Dialog open={open} onOpenChange={(v) => !save.working && setOpen(v)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("nominee.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("nominee.dialogDesc")}</DialogDescription>
          </DialogHeader>
          <InlineAlert tone="warn" title={t("nominee.whatTitle")}>
            {t("nominee.whatBody", { days: claimNoticeDays(exitNoticeDays) })}
          </InlineAlert>
          <div className="grid gap-2">
            <label htmlFor="nominee-address" className="text-[14px] font-medium">
              {t("nominee.addrLabel")}
            </label>
            <input
              id="nominee-address"
              className={inputCls}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={touched && Boolean(problem)}
              aria-describedby="nominee-address-note"
            />
            <p
              id="nominee-address-note"
              className={cn(
                "text-[13px]",
                touched && problem ? "text-bad" : "text-muted-foreground",
              )}
              role={touched && problem ? "alert" : undefined}
              aria-live="polite"
            >
              {touched && problem ? problem : t("nominee.addrHint")}
            </p>
          </div>
          <div className="grid gap-4 pt-1">
            <Button
              icon={ShieldCheck}
              workingLabel={t("nominee.saving")}
              state={save.working ? "working" : undefined}
              onClick={submit}
            >
              {t("nominee.save")}
            </Button>
            <TxFor tx={save.tx} />
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/**
 * The member's alert while a claim about them is open or approved: what it means and a
 * Cancel button. Cancelling also brings them back from dormant (ADR 0056).
 */
export function NomineeClaimAlert({
  circle,
  chainNow,
  onChanged,
}: {
  circle: Address;
  chainNow: number;
  onChanged: () => void;
}) {
  const { t } = useT();
  const b = useMyBackupWallet(circle);
  const cancel = useVaultAction(circle);
  if (!b.data) return null;
  const phase = claimPhase(b.data.claim, chainNow);
  if (phase === "none") return null;
  const who = b.data.nomineeName || t("nominee.defaultWho");

  async function stop() {
    const receipt = await cancel.send("cancelNomineeClaim");
    if (receipt) {
      notify.success(messages.nomineeClaimCancelled());
      b.refetch();
      onChanged();
    }
  }

  return (
    <div className="grid gap-4" data-testid="nominee-claim-alert">
      <InlineAlert
        tone="bad"
        icon={HandCoins}
        title={phase === "voting" ? t("nominee.alertTitleVoting") : t("nominee.alertTitlePaid")}
        action={
          <Button
            icon={Undo2}
            workingLabel={t("nominee.cancelling")}
            state={cancel.working ? "working" : undefined}
            onClick={stop}
          >
            {t("nominee.cancelClaim")}
          </Button>
        }
      >
        {phase === "voting" ? t("nominee.alertVoting", { who }) : t("nominee.alertNotice", { who })}
        {phase !== "voting" && (
          <span className="mt-2 block">
            <Deadline
              deadline={b.data.claim.maturesAt}
              chainNow={chainNow}
              prefix={t("nominee.paidOutFrom")}
              pastText={t("nominee.noticeOver")}
            />
          </span>
        )}
      </InlineAlert>
      <TxFor tx={cancel.tx} />
    </div>
  );
}

/**
 * For the wallet someone named as their backup: "You are the backup wallet for <name>". Works
 * for members and outsiders. Shows the member's state and the next step: wait, ask the circle,
 * follow the vote, wait out the notice, or collect.
 */
export function BackupForCards({
  circle,
  asset,
  exitNoticeDays,
  dormantAfter,
  chainNow,
}: {
  circle: Address;
  asset: CircleAsset;
  exitNoticeDays: number;
  dormantAfter: number;
  chainNow: number;
}) {
  const named = useNamedBy(circle);
  if (named.isPending || named.rows.length === 0) return null;
  if (named.isError) return <StateView state="error" onRetry={() => named.refetch()} />;
  return (
    <div className="grid gap-5">
      {named.rows.map((r) => (
        <BackupForCard
          key={r.member}
          circle={circle}
          asset={asset}
          member={r.member}
          name={r.name}
          active={r.active}
          dormant={r.dormant}
          overdue={r.overdue}
          value={r.value}
          claim={r.claim}
          exitNoticeDays={exitNoticeDays}
          dormantAfter={dormantAfter}
          chainNow={chainNow}
          onChanged={named.refetch}
        />
      ))}
    </div>
  );
}

function BackupForCard({
  circle,
  asset,
  member,
  name,
  active,
  dormant,
  overdue,
  value,
  claim,
  exitNoticeDays,
  dormantAfter,
  chainNow,
  onChanged,
}: {
  circle: Address;
  asset: CircleAsset;
  member: Address;
  name: string;
  active: boolean;
  dormant: boolean;
  overdue: number;
  value: bigint;
  claim: ClaimState;
  exitNoticeDays: number;
  dormantAfter: number;
  chainNow: number;
  onChanged: () => void;
}) {
  const { t, tn } = useT();
  const ask = useVaultAction(circle);
  const collect = useVaultAction(circle);
  const phase = claimPhase(claim, chainNow);
  const q = useExitQueue(circle, phase === "ready");
  const who = name || shortAddress(member);
  if (!active) return null;

  async function request() {
    const receipt = await ask.send("requestNomineeClaim", [member]);
    if (receipt) {
      notify.success(messages.nomineeClaimRequested());
      onChanged();
    }
  }

  async function payOut() {
    const n = BigInt(Math.max(exitsToProcess(q.queue, member), 1));
    const receipt = await collect.send("processExits", [n], undefined, GAS_PER_EXIT * n + 200_000n);
    if (receipt) {
      notify.success(t("nominee.paidToast", { who }));
      q.refetch();
      onChanged();
    }
  }

  return (
    <section
      aria-label={t("nominee.forTitle", { who })}
      data-testid="backup-for-card"
      className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
    >
      <header className="flex items-center gap-4">
        <Avatar address={member} size={44} />
        <div className="grid gap-1">
          <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
            {t("nominee.title")}
          </span>
          <h3 className="font-display text-[26px] leading-none tracking-tight">
            {t("nominee.forTitle", { who })}
          </h3>
        </div>
      </header>

      {phase === "none" && !dormant && (
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {tn("nominee.activeBody", dormantAfter, { who })}
          {overdue > 0 && t("nominee.missedSoFar", { overdue })}
        </p>
      )}

      {phase === "none" && dormant && (
        <div className="grid gap-5">
          <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
            {t("nominee.dormantBody", { who, days: claimNoticeDays(exitNoticeDays) })}
          </p>
          <dl className="grid gap-1">
            <dt className="text-[12.5px] text-muted-foreground">{t("nominee.shareToday")}</dt>
            <dd className="font-display text-[34px] leading-none tracking-tight tabular">
              {fmt(value, asset)} {asset.symbol}
            </dd>
          </dl>
          <div>
            <Button
              icon={UserRoundCheck}
              workingLabel={t("nominee.asking")}
              state={ask.working ? "working" : undefined}
              onClick={request}
            >
              {t("nominee.askFor", { who })}
            </Button>
          </div>
        </div>
      )}

      {phase === "voting" && (
        <p className="text-[13.5px] text-muted-foreground">
          {rich(t("nominee.votingBody", { who }), {
            link: (c) => (
              <Link
                href={`/app/circle/votes/?id=${circle}`}
                className="font-semibold text-brand underline-offset-4 hover:underline"
              >
                {c}
              </Link>
            ),
          })}
        </p>
      )}

      {(phase === "notice" || phase === "ready") && (
        <div className="grid gap-5" data-testid="backup-for-status">
          <dl className="grid gap-1">
            <dt className="text-[12.5px] text-muted-foreground">
              {phase === "notice" ? t("nominee.statusNotice") : t("nominee.statusReady")}
            </dt>
            <dd className="font-display text-[34px] leading-none tracking-tight tabular">
              {fmt(value, asset)} {asset.symbol}
            </dd>
          </dl>
          <Deadline
            deadline={claim.maturesAt}
            chainNow={chainNow}
            prefix={t("nominee.canBePaidFrom")}
            pastText={t("nominee.noticeOver")}
          />
          {claim.waiting && (
            <InlineAlert tone="warn" title={t("nominee.waitingCash")}>
              {t("nominee.waitingCashBody")}
            </InlineAlert>
          )}
          {phase === "ready" ? (
            <div>
              <Button
                icon={HandCoins}
                workingLabel={t("nominee.payingOut")}
                state={collect.working ? "working" : undefined}
                onClick={payOut}
              >
                {t("nominee.payOut")}
              </Button>
            </div>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">
              {t("nominee.stillCancel", { who })}
            </p>
          )}
        </div>
      )}
      <TxFor tx={ask.tx} />
      <TxFor tx={collect.tx} />
    </section>
  );
}
