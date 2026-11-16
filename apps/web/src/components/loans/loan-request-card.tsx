"use client";

import { shortAddress } from "@wealthkart/sdk";
import { Gavel, Landmark, Scale, ShieldCheck, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";
import type { Address } from "viem";

import { Deadline } from "@/components/app/deadline";
import { TxFor } from "@/components/app/tx-for";
import { Avatar } from "@/components/art";
import { Button } from "@/components/kit";
import { useT } from "@/i18n/react";
import { proposalOutcome, proposalTallyLine } from "@/lib/governance";
import { money, useCircleAsset } from "@/lib/asset";
import { type LoanRequestView, useLoanTx } from "@/lib/loan-hooks";
import { loanSettledLine } from "@/lib/loans";
import { notify } from "@/lib/toast";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * A loan request or a "settle this default" vote on the Votes page: what is asked, the
 * guarantor's answer, the tally, and what you can do (vote, back it, withdraw, settle).
 */
export function LoanRequestCard({
  circle,
  request: r,
  passPct,
  quorumPct,
  chainNow,
  me,
  onChanged,
}: {
  circle: Address;
  request: LoanRequestView;
  passPct: number;
  quorumPct: number;
  chainNow: number;
  me: Address | undefined;
  onChanged: () => void;
}) {
  const voteA = useLoanTx(circle);
  const { t } = useT();
  const { asset } = useCircleAsset(circle);
  const settleA = useLoanTx(circle);
  const otherA = useLoanTx(circle);
  const tally = { eligible: r.eligible, yes: r.yes, no: r.no, passPct, quorumPct };
  const ended = chainNow > r.deadline;
  const outcome = proposalOutcome(tally, ended);
  const settle = r.kind === "settle";
  const lower = me?.toLowerCase();
  const isBorrower = lower === r.borrower.toLowerCase();
  const isGuarantor = lower === r.guarantor.toLowerCase();
  const hasGuarantor = r.guarantor !== ZERO;
  const waiting = !settle && hasGuarantor && !r.guarantorAccepted;
  const borrower = r.borrowerName || shortAddress(r.borrower);
  const guarantor = r.guarantorName || shortAddress(r.guarantor);
  const title = settle
    ? t("loans.request.titleSettle", { name: borrower })
    : t("loans.request.titleLoan", { amount: money(r.amount, asset), name: borrower });

  async function vote(support: boolean) {
    const ok = await voteA.vote(r.id, support);
    if (ok) {
      notify.success(support ? t("loans.voteYesToast") : t("loans.voteNoToast"));
      onChanged();
    }
  }
  async function finalize() {
    const ok = await settleA.finalize(r.id);
    if (ok) {
      notify.success(t("loans.voteSettledToast"));
      onChanged();
    }
  }
  async function accept() {
    const ok = await otherA.acceptGuarantee(r.borrower);
    if (ok) {
      notify.success(t("loans.backingToast", { name: borrower }));
      onChanged();
    }
  }
  async function withdraw() {
    const ok = await otherA.cancel();
    if (ok) {
      notify.success(t("loans.withdrawnToast"));
      onChanged();
    }
  }

  const why = ended
    ? t("loans.whyEnded")
    : isBorrower
      ? t("loans.request.whyBorrower")
      : settle && isGuarantor
        ? t("loans.request.whyGuarantor")
        : t("loans.whyOther");

  return (
    <article
      className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
      aria-label={settle ? t("loans.request.ariaSettle") : t("loans.request.ariaLoan")}
      data-kind={r.kind}
      data-testid="loan-request-card"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className={`grid size-11 place-items-center rounded-full ${settle ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand"}`}
          >
            {settle ? (
              <Scale className="size-5" strokeWidth={1.5} aria-hidden />
            ) : (
              <Landmark className="size-5" strokeWidth={1.5} aria-hidden />
            )}
          </span>
          <div className="grid gap-1">
            <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
              {settle
                ? t("loans.request.eyebrowSettle")
                : r.medical
                  ? t("loans.request.eyebrowMedical")
                  : t("loans.request.eyebrowLoan")}
            </span>
            <h3 className="font-display text-[26px] leading-none tracking-tight">{title}</h3>
          </div>
        </div>
        <Deadline deadline={r.deadline} chainNow={chainNow} />
      </header>

      <div className="grid gap-4 text-[13.5px] leading-relaxed">
        {settle ? (
          <p className="text-muted-foreground">
            {hasGuarantor
              ? t("loans.request.settleBodyGuarantor", {
                  name: borrower,
                  guarantor,
                  amount: money(r.amount, asset),
                })
              : t("loans.request.settleBody", { name: borrower, amount: money(r.amount, asset) })}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <Avatar address={r.borrower} size={36} />
            <dl className="grid flex-1 gap-x-8 gap-y-2 sm:grid-cols-3">
              <div>
                <dt className="text-[12px] text-muted-foreground">{t("loans.borrower")}</dt>
                <dd className="font-semibold">{borrower}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">{t("loans.type")}</dt>
                <dd className="font-semibold">
                  {r.medical ? t("loans.medical") : t("loans.regular")}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">{t("loans.guarantor")}</dt>
                <dd className="font-semibold" data-testid="guarantor-state">
                  {!hasGuarantor
                    ? t("loans.none")
                    : r.guarantorAccepted
                      ? t("loans.request.agreed", { name: guarantor })
                      : t("loans.request.notAgreed", { name: guarantor })}
                </dd>
              </div>
            </dl>
          </div>
        )}
        <p className="tabular" data-testid="tally">
          {proposalTallyLine(tally)}
        </p>
      </div>

      {outcome !== "open" ? (
        <div className="grid gap-3">
          <p className="text-[13.5px] text-muted-foreground">
            {loanSettledLine(outcome, r.kind, waiting && !ended)}
          </p>
          {!(outcome === "approved" && waiting && !ended) && (
            <div>
              <Button
                icon={Gavel}
                workingLabel={t("loans.settling")}
                state={settleA.working ? "working" : undefined}
                onClick={finalize}
              >
                {t("loans.settleVote")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {r.canVote ? (
            <>
              <Button
                icon={ThumbsUp}
                workingLabel={t("loans.voting")}
                state={voteA.working ? "working" : undefined}
                onClick={() => vote(true)}
              >
                {t("loans.voteYes")}
              </Button>
              <Button
                variant="secondary"
                icon={ThumbsDown}
                workingLabel={t("loans.voting")}
                state={voteA.working ? "working" : undefined}
                onClick={() => vote(false)}
              >
                {t("loans.voteNo")}
              </Button>
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">{why}</p>
          )}
        </div>
      )}

      {(waiting && isGuarantor && !ended) || (isBorrower && !settle) ? (
        <div className="flex flex-wrap gap-3">
          {waiting && isGuarantor && !ended && (
            <Button
              icon={ShieldCheck}
              workingLabel={t("loans.agreeing")}
              state={otherA.working ? "working" : undefined}
              onClick={accept}
            >
              {t("loans.backThisLoan")}
            </Button>
          )}
          {isBorrower && !settle && (
            <Button
              variant="ghost"
              icon={Undo2}
              workingLabel={t("loans.withdrawing")}
              state={otherA.working ? "working" : undefined}
              onClick={withdraw}
            >
              {t("loans.withdrawRequest")}
            </Button>
          )}
        </div>
      ) : null}

      <TxFor tx={voteA.tx} />
      <TxFor tx={settleA.tx} />
      <TxFor tx={otherA.tx} />
    </article>
  );
}
