"use client";

import { shortAddress } from "@wealthkart/sdk";
import { Gavel, Landmark, Scale, ShieldCheck, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";
import type { Address } from "viem";

import { Deadline } from "@/components/app/deadline";
import { TxFor } from "@/components/app/tx-for";
import { Avatar } from "@/components/art";
import { Button } from "@/components/kit";
import { proposalOutcome, proposalTallyLine } from "@/lib/governance";
import { type LoanRequestView, useLoanTx } from "@/lib/loan-hooks";
import { avax, loanSettledLine } from "@/lib/loans";
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
  const title = settle ? `Settle ${borrower}'s default` : `${avax(r.amount)} AVAX for ${borrower}`;

  async function vote(support: boolean) {
    const ok = await voteA.vote(r.id, support);
    if (ok) {
      notify.success(support ? "Vote counted: yes." : "Vote counted: no.");
      onChanged();
    }
  }
  async function finalize() {
    const ok = await settleA.finalize(r.id);
    if (ok) {
      notify.success("Vote settled.");
      onChanged();
    }
  }
  async function accept() {
    const ok = await otherA.acceptGuarantee(r.borrower);
    if (ok) {
      notify.success(`You're backing ${borrower}'s loan.`);
      onChanged();
    }
  }
  async function withdraw() {
    const ok = await otherA.cancel();
    if (ok) {
      notify.success("Loan request withdrawn.");
      onChanged();
    }
  }

  const why = ended
    ? "Voting time is over."
    : isBorrower
      ? "It's your loan, so you can't vote on it."
      : settle && isGuarantor
        ? "You backed this loan, so you can't vote on settling it."
        : "You've voted on this one, or you can't vote on it: only members who could vote when it started, and are up to date, can.";

  return (
    <article
      className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
      aria-label={settle ? "Settle vote" : "Loan request"}
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
              {settle ? "Settle a default" : r.medical ? "Medical loan request" : "Loan request"}
            </span>
            <h3 className="font-display text-[26px] leading-none tracking-tight">{title}</h3>
          </div>
        </div>
        <Deadline deadline={r.deadline} chainNow={chainNow} />
      </header>

      <div className="grid gap-4 text-[13.5px] leading-relaxed">
        {settle ? (
          <p className="text-muted-foreground">
            {borrower}&apos;s loan is in default with {avax(r.amount)} AVAX still owed. If this
            passes, {borrower}&apos;s savings repay it at today&apos;s value
            {hasGuarantor ? `, then ${guarantor}'s as guarantor` : ""}. Anything still uncovered is
            shared by everyone through the share value. If {borrower} pays up first, the vote is
            called off. {borrower}
            {hasGuarantor ? ` and ${guarantor}` : ""} can&apos;t vote on it.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <Avatar address={r.borrower} size={36} />
            <dl className="grid flex-1 gap-x-8 gap-y-2 sm:grid-cols-3">
              <div>
                <dt className="text-[12px] text-muted-foreground">Borrower</dt>
                <dd className="font-semibold">{borrower}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">Type</dt>
                <dd className="font-semibold">{r.medical ? "Medical" : "Regular"}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">Guarantor</dt>
                <dd className="font-semibold" data-testid="guarantor-state">
                  {!hasGuarantor
                    ? "None"
                    : r.guarantorAccepted
                      ? `${guarantor}, agreed`
                      : `${guarantor}, not agreed yet`}
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
                workingLabel="Settling…"
                state={settleA.working ? "working" : undefined}
                onClick={finalize}
              >
                Settle the vote
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
                workingLabel="Voting…"
                state={voteA.working ? "working" : undefined}
                onClick={() => vote(true)}
              >
                Vote yes
              </Button>
              <Button
                variant="secondary"
                icon={ThumbsDown}
                workingLabel="Voting…"
                state={voteA.working ? "working" : undefined}
                onClick={() => vote(false)}
              >
                Vote no
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
              workingLabel="Agreeing…"
              state={otherA.working ? "working" : undefined}
              onClick={accept}
            >
              Back this loan
            </Button>
          )}
          {isBorrower && !settle && (
            <Button
              variant="ghost"
              icon={Undo2}
              workingLabel="Withdrawing…"
              state={otherA.working ? "working" : undefined}
              onClick={withdraw}
            >
              Withdraw request
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
