"use client";

import { periodLabel, shortAddress } from "@wealthkart/sdk";
import { Gavel, HandCoins, Snowflake, Undo2, Wallet } from "lucide-react";
import { useState } from "react";
import type { Address } from "viem";

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
import { proposalOutcome, proposalTallyLine } from "@/lib/governance";
import { type MyLoan, useLoanAmounts, useLoanRequest, useLoanTx } from "@/lib/loan-hooks";
import {
  avax,
  cureText,
  loanSettledLine,
  parseAvaxInput,
  rateIn,
  repayProblem,
  type LoanState,
} from "@/lib/loans";
import { formatBps, type RulesParams } from "@/lib/rules";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { Fact, inputCls } from "./parts";
import { TenorTimeline } from "./tenor-timeline";

const ZERO = "0x0000000000000000000000000000000000000000";

const card = "grid gap-8 rounded-[14px] border border-border bg-card p-[26px] sm:p-10";

/**
 * "Your loan" (PLAN.md D4b): the running loan with what's owed now, the tenor timeline and
 * the pay and repay actions; or your request while it is voted on; or nothing yet.
 */
export function MyLoanPanel({
  circle,
  my,
  rules,
  currentPeriod,
  chainNow,
  dueDay,
  quorumPct,
  guarantorName,
  onChanged,
}: {
  circle: Address;
  my: MyLoan;
  rules: RulesParams;
  currentPeriod: number;
  chainNow: number;
  dueDay: number;
  quorumPct: number;
  guarantorName: string;
  onChanged: () => void;
}) {
  if (my.loan) {
    return (
      <ActiveLoan
        circle={circle}
        loan={my.loan}
        my={my}
        rules={rules}
        currentPeriod={currentPeriod}
        dueDay={dueDay}
        guarantorName={guarantorName}
        onChanged={onChanged}
      />
    );
  }
  if (my.pendingId > 0n) {
    return (
      <PendingRequest
        circle={circle}
        id={my.pendingId}
        rules={rules}
        chainNow={chainNow}
        quorumPct={quorumPct}
        onChanged={onChanged}
      />
    );
  }
  return (
    <section aria-label="Your loan" className={card} data-testid="no-loan">
      <div className="grid gap-2">
        <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          Your loan
        </span>
        <p className="font-display text-[34px] leading-tight tracking-tight">
          You don&apos;t have a loan
        </p>
        <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
          When you need money, ask the circle. The members vote, and if enough say yes the AVAX
          arrives in your wallet on its own. Interest goes back into the circle and lifts
          everyone&apos;s share, yours included.
        </p>
      </div>
      <dl className="grid gap-6 sm:grid-cols-3">
        <Fact
          label="Interest"
          value={`${formatBps(rules.interestBps)} a month`}
          hint="To start; it steps up each term"
        />
        <Fact
          label="Each term"
          value={`${rules.tenorMonths} months`}
          hint="Three terms, then the loan is due"
        />
        <Fact label="Cash free to lend" value={`${avax(my.lendable)} AVAX`} />
      </dl>
    </section>
  );
}

function ActiveLoan({
  circle,
  loan,
  my,
  rules,
  currentPeriod,
  dueDay,
  guarantorName,
  onChanged,
}: {
  circle: Address;
  loan: LoanState;
  my: MyLoan;
  rules: RulesParams;
  currentPeriod: number;
  dueDay: number;
  guarantorName: string;
  onChanged: () => void;
}) {
  const pay = useLoanTx(circle);
  const amounts = useLoanAmounts(circle);
  const [repayOpen, setRepayOpen] = useState(false);
  const owedNow = my.interest + my.fees;
  const rate = rateIn(loan, Math.max(currentPeriod, loan.disbursedPeriod + 1));
  const hasGuarantor = loan.guarantor !== "" && loan.guarantor !== ZERO;

  async function payInterest() {
    // Re-read right before paying: a late fee may have started since the page loaded.
    const fresh = await amounts.refetch();
    const due = fresh.data?.[0];
    const total = due ? due[0] + due[1] : owedNow;
    if (total === 0n) {
      notify.info("There's no interest to pay right now.");
      return;
    }
    const r = await pay.payInterest(total);
    if (r) {
      notify.success(`Interest paid: ${avax(total)} AVAX. Thank you.`);
      onChanged();
    }
  }

  return (
    <section aria-label="Your loan" className={card} data-testid="my-loan">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="grid gap-2">
          <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
            Your loan{loan.medical ? " · medical" : ""}
          </span>
          <p
            className="font-display text-[48px] leading-none tracking-tight tabular"
            data-testid="loan-outstanding"
          >
            {avax(loan.principal)}
            <small className="ml-2 font-sans text-[14px] tracking-normal text-muted-foreground">
              AVAX still owed
            </small>
          </p>
          <p className="text-[13px] text-muted-foreground">
            You borrowed {avax(loan.amount)} AVAX in {periodLabel(loan.disbursedPeriod)}
            {hasGuarantor ? ` · backed by ${guarantorName || shortAddress(loan.guarantor)}` : ""}.
          </p>
        </div>
      </header>

      {loan.defaulted ? (
        <InlineAlert tone="bad" icon={Snowflake} title="Your loan is in default, so you're frozen">
          <span data-testid="frozen-notice">
            While frozen you can&apos;t leave the circle or ask for a new loan
            {hasGuarantor ? ", and neither can your guarantor" : ""}. If it stays unpaid, the
            members can vote to repay it from your savings
            {hasGuarantor ? ", then your guarantor's" : ""}.{" "}
            {cureText(loan, owedNow, currentPeriod)}
          </span>
        </InlineAlert>
      ) : my.overdueMonths > 0 ? (
        <InlineAlert tone="warn" title="Your interest is late">
          {my.overdueMonths} {my.overdueMonths === 1 ? "month is" : "months are"} unpaid, with{" "}
          {avax(rules.interestFee)} AVAX added for each late month. After {rules.defaultAfter} late{" "}
          {rules.defaultAfter === 1 ? "month" : "months"}, anyone in the circle can mark the loan as
          defaulted, which freezes you{hasGuarantor ? " and your guarantor" : ""}. Pay now to stay
          clear.
        </InlineAlert>
      ) : null}

      <dl className="grid gap-6 sm:grid-cols-3">
        <Fact
          label="Interest to pay now"
          value={`${avax(owedNow)} AVAX`}
          testId="interest-now"
          hint={
            my.fees > 0n
              ? `Includes ${avax(my.fees)} AVAX in late fees`
              : owedNow > 0n
                ? `Due by day ${dueDay} (UTC); paying early is fine`
                : currentPeriod <= loan.disbursedPeriod
                  ? `Interest starts in ${periodLabel(loan.disbursedPeriod + 1)}`
                  : "All paid up for this month"
          }
        />
        <Fact
          label={currentPeriod <= loan.disbursedPeriod ? "First rate" : "Rate now"}
          value={`${formatBps(rate)} a month`}
          hint={rate === 0 && loan.medical ? "Interest-free month" : undefined}
        />
        <Fact
          label="To close it today"
          value={`${avax(my.payoff)} AVAX`}
          hint={
            my.payoff > loan.principal
              ? `Includes ${avax(my.payoff - loan.principal)} AVAX: one month's minimum interest`
              : owedNow > 0n
                ? "Pay the interest first, then this"
                : "What you still owe; no extra interest"
          }
        />
      </dl>

      <TenorTimeline loan={loan} currentPeriod={currentPeriod} />

      <div className="grid gap-4">
        <div className="flex flex-wrap gap-3">
          <Button
            icon={HandCoins}
            workingLabel="Paying…"
            state={pay.working ? "working" : undefined}
            disabled={owedNow === 0n}
            disabledReason="There's no interest to pay right now"
            onClick={payInterest}
          >
            {owedNow > 0n ? `Pay interest ${avax(owedNow)} AVAX` : "Pay interest"}
          </Button>
          <Button variant="secondary" icon={Wallet} onClick={() => setRepayOpen(true)}>
            Repay
          </Button>
        </div>
        <TxFor tx={pay.tx} />
      </div>

      <RepayDialog
        open={repayOpen}
        onOpenChange={setRepayOpen}
        circle={circle}
        loan={loan}
        my={my}
        onRepaid={onChanged}
      />
    </section>
  );
}

function RepayDialog({
  open,
  onOpenChange,
  circle,
  loan,
  my,
  onRepaid,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  circle: Address;
  loan: LoanState;
  my: MyLoan;
  onRepaid: () => void;
}) {
  const action = useLoanTx(circle);
  const amounts = useLoanAmounts(circle);
  const [mode, setMode] = useState<"part" | "full">("full");
  const [text, setText] = useState("");
  const amount = parseAvaxInput(text);
  const problem = repayProblem(mode, amount, loan.principal, my.interest, my.overdueMonths);
  const sending = mode === "full" ? my.payoff : (amount ?? 0n);

  async function repay() {
    if (problem) return;
    let value = sending;
    if (mode === "full") {
      const fresh = await amounts.refetch();
      value = fresh.data?.[1] ?? my.payoff;
    }
    const r = await action.repay(value);
    if (!r) return;
    onOpenChange(false);
    action.tx.reset();
    setText("");
    notify.success(
      mode === "full"
        ? "Loan repaid in full. It's closed, and you're free to ask again whenever you need."
        : `Repaid ${avax(value)} AVAX. ${avax(loan.principal - value)} AVAX left to repay.`,
    );
    onRepaid();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !action.working && onOpenChange(v)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Repay your loan</DialogTitle>
          <DialogDescription>
            Repaying lowers next month&apos;s interest. This month&apos;s interest stays on what you
            owed at the start of the month.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-7 pt-2">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">How much</legend>
            {(["full", "part"] as const).map((m) => (
              <label
                key={m}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-4 transition-colors",
                  mode === m ? "border-brand bg-brand-soft" : "border-border hover:bg-secondary",
                )}
              >
                <input
                  type="radio"
                  name="repay-mode"
                  className="mt-1 size-4 accent-[var(--brand)]"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                <span className="grid gap-0.5">
                  <span className="text-[14px] font-medium">
                    {m === "full" ? "Repay in full" : "Repay part"}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {m === "full"
                      ? `${avax(my.payoff)} AVAX closes the loan`
                      : "Any amount below what you owe"}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {mode === "part" && (
            <div className="grid gap-1.5">
              <label htmlFor="repay-amount" className="text-[13px] font-medium">
                Amount in AVAX
              </label>
              <input
                id="repay-amount"
                inputMode="decimal"
                autoComplete="off"
                className={inputCls}
                value={text}
                placeholder={`Less than ${avax(loan.principal)}`}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}
          {mode === "full" && my.payoff > loan.principal && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              This includes {avax(my.payoff - loan.principal)} AVAX: a loan repaid before any
              interest was charged still pays one month&apos;s interest (rule 17).
            </p>
          )}
          {problem && (mode === "full" || text !== "") && (
            <p className="text-[13px] text-bad">{problem}</p>
          )}

          <div className="grid gap-4">
            <Button
              icon={Wallet}
              workingLabel="Repaying…"
              state={action.working ? "working" : undefined}
              disabled={Boolean(problem)}
              disabledReason={problem ?? undefined}
              onClick={repay}
            >
              {sending > 0n ? `Repay ${avax(sending)} AVAX` : "Repay"}
            </Button>
            <TxFor tx={action.tx} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PendingRequest({
  circle,
  id,
  rules,
  chainNow,
  quorumPct,
  onChanged,
}: {
  circle: Address;
  id: bigint;
  rules: RulesParams;
  chainNow: number;
  quorumPct: number;
  onChanged: () => void;
}) {
  const q = useLoanRequest(circle, id);
  const cancel = useLoanTx(circle);
  const settle = useLoanTx(circle);
  const r = q.request;
  if (!r) {
    return (
      <section aria-label="Your loan" className={card}>
        <p className="text-[13.5px] text-muted-foreground">Loading your loan request…</p>
      </section>
    );
  }
  const tally = { eligible: r.eligible, yes: r.yes, no: r.no, passPct: rules.passPct, quorumPct };
  const ended = chainNow > r.deadline;
  const outcome = proposalOutcome(tally, ended);
  const hasGuarantor = r.guarantor !== ZERO;
  const waiting = hasGuarantor && !r.guarantorAccepted;
  const gName = r.guarantorName || shortAddress(r.guarantor);

  async function withdraw() {
    const ok = await cancel.cancel();
    if (ok) {
      notify.success("Loan request withdrawn.");
      onChanged();
    }
  }
  async function finalize() {
    const ok = await settle.finalize(id);
    if (ok) {
      notify.success("Vote settled.");
      onChanged();
    }
  }

  return (
    <section aria-label="Your loan" className={card} data-testid="my-request">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="grid gap-2">
          <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
            Your loan request{r.medical ? " · medical" : ""}
          </span>
          <p className="font-display text-[48px] leading-none tracking-tight tabular">
            {avax(r.amount)}
            <small className="ml-2 font-sans text-[14px] tracking-normal text-muted-foreground">
              AVAX asked for
            </small>
          </p>
        </div>
        <Deadline deadline={r.deadline} chainNow={chainNow} />
      </header>
      <dl className="grid gap-6 sm:grid-cols-2">
        <Fact
          label="Votes"
          value={<span data-testid="my-request-tally">{proposalTallyLine(tally)}</span>}
        />
        <Fact
          label="Guarantor"
          value={hasGuarantor ? gName : "None"}
          hint={
            hasGuarantor
              ? r.guarantorAccepted
                ? "Has agreed to back your loan"
                : "Hasn't agreed yet. The AVAX goes out only after they do."
              : undefined
          }
        />
      </dl>
      {outcome !== "open" && (
        <p className="text-[13.5px] text-muted-foreground">
          {loanSettledLine(outcome, "loan", waiting)}
        </p>
      )}
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-3">
          {outcome !== "open" && !(outcome === "approved" && waiting && !ended) && (
            <Button
              icon={Gavel}
              workingLabel="Settling…"
              state={settle.working ? "working" : undefined}
              onClick={finalize}
            >
              Settle the vote
            </Button>
          )}
          <Button
            variant="ghost"
            icon={Undo2}
            workingLabel="Withdrawing…"
            state={cancel.working ? "working" : undefined}
            onClick={withdraw}
          >
            Withdraw request
          </Button>
        </div>
        <TxFor tx={settle.tx} />
        <TxFor tx={cancel.tx} />
      </div>
    </section>
  );
}
