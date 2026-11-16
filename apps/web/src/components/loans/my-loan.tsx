"use client";

import { shortAddress } from "@wealthkart/sdk";
import { Gavel, HandCoins, Snowflake, Undo2, Wallet } from "lucide-react";
import { useState } from "react";
import type { Address } from "viem";

import { Deadline } from "@/components/app/deadline";
import { PayButton, PayProgress } from "@/components/app/asset-pay";
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
import { money, useCircleAsset } from "@/lib/asset";
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
import { useAssetPayment } from "@/lib/use-asset-payment";
import { cn } from "@/lib/utils";

import { Fact, inputCls, usePeriodText } from "./parts";
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
  const { asset } = useCircleAsset(circle);
  const { t } = useT();
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
    <section aria-label={t("loans.page.yourLoan")} className={card} data-testid="no-loan">
      <div className="grid gap-2">
        <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          {t("loans.page.yourLoan")}
        </span>
        <p className="font-display text-[34px] leading-tight tracking-tight">
          {t("loans.my.none")}
        </p>
        <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {t("loans.my.noneBody", { symbol: asset.symbol })}
        </p>
      </div>
      <dl className="grid gap-6 sm:grid-cols-3">
        <Fact
          label={t("loans.my.interest")}
          value={t("loans.rateMonth", { rate: formatBps(rules.interestBps) })}
          hint={t("loans.my.interestHint")}
        />
        <Fact
          label={t("loans.my.eachTerm")}
          value={t("loans.my.termMonths", { months: rules.tenorMonths })}
          hint={t("loans.my.termHint")}
        />
        <Fact label={t("loans.limits.cash")} value={money(my.lendable, asset)} />
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
  const payment = useAssetPayment(circle);
  const asset = payment.asset;
  const amounts = useLoanAmounts(circle);
  const [repayOpen, setRepayOpen] = useState(false);
  const { t, tn } = useT();
  const period = usePeriodText();
  const owedNow = my.interest + my.fees;
  const rate = rateIn(loan, Math.max(currentPeriod, loan.disbursedPeriod + 1));
  const hasGuarantor = loan.guarantor !== "" && loan.guarantor !== ZERO;

  /** Re-read right before paying (and before a second approve): a late fee may have started. */
  async function interestNow(): Promise<bigint> {
    const fresh = await amounts.refetch();
    const due = fresh.data?.[0];
    return due ? due[0] + due[1] : owedNow;
  }

  async function payInterest() {
    if ((await interestNow()) === 0n) {
      notify.info(t("loans.my.noInterestToast"));
      return;
    }
    const r = await payment.pay({ fn: "payInterest", amount: interestNow });
    if (r) {
      notify.success(t("loans.my.interestPaid", { amount: money(r.amount, asset) }));
      onChanged();
    }
  }

  return (
    <section aria-label={t("loans.page.yourLoan")} className={card} data-testid="my-loan">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="grid gap-2">
          <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
            {loan.medical ? t("loans.my.eyebrowMedical") : t("loans.page.yourLoan")}
          </span>
          <p
            className="font-display text-[48px] leading-none tracking-tight tabular"
            data-testid="loan-outstanding"
          >
            {avax(loan.principal, asset)}
            <small className="ml-2 font-sans text-[14px] tracking-normal text-muted-foreground">
              {t("loans.my.stillOwed", { symbol: asset.symbol })}
            </small>
          </p>
          <p className="text-[13px] text-muted-foreground">
            {hasGuarantor
              ? t("loans.my.borrowedBacked", {
                  amount: money(loan.amount, asset),
                  month: period.long(loan.disbursedPeriod),
                  name: guarantorName || shortAddress(loan.guarantor),
                })
              : t("loans.my.borrowed", {
                  amount: money(loan.amount, asset),
                  month: period.long(loan.disbursedPeriod),
                })}
          </p>
        </div>
      </header>

      {loan.defaulted ? (
        <InlineAlert tone="bad" icon={Snowflake} title={t("loans.my.frozenTitle")}>
          <span data-testid="frozen-notice">
            {t(hasGuarantor ? "loans.my.frozenBodyGuarantor" : "loans.my.frozenBody", {
              cure: cureText(loan, owedNow, currentPeriod, asset),
            })}
          </span>
        </InlineAlert>
      ) : my.overdueMonths > 0 ? (
        <InlineAlert tone="warn" title={t("loans.my.lateTitle")}>
          {`${tn("loans.my.lateUnpaid", my.overdueMonths, {
            fee: money(loan.interestFee || rules.interestFee, asset),
          })} ${tn(
            hasGuarantor ? "loans.my.lateAfterGuarantor" : "loans.my.lateAfter",
            loan.defaultAfter || rules.defaultAfter,
          )}`}
        </InlineAlert>
      ) : null}

      <dl className="grid gap-6 sm:grid-cols-3">
        <Fact
          label={t("loans.my.interestNow")}
          value={money(owedNow, asset)}
          testId="interest-now"
          hint={
            my.fees > 0n
              ? t("loans.my.includesFees", { amount: money(my.fees, asset) })
              : owedNow > 0n
                ? t("loans.my.dueByDay", { day: dueDay })
                : currentPeriod <= loan.disbursedPeriod
                  ? t("loans.my.interestStartsIn", {
                      month: period.long(loan.disbursedPeriod + 1),
                    })
                  : t("loans.my.allPaid")
          }
        />
        <Fact
          label={
            currentPeriod <= loan.disbursedPeriod ? t("loans.my.firstRate") : t("loans.my.rateNow")
          }
          value={t("loans.rateMonth", { rate: formatBps(rate) })}
          hint={rate === 0 && loan.medical ? t("loans.my.freeMonth") : undefined}
        />
        <Fact
          label={t("loans.my.closeToday")}
          value={money(my.payoff, asset)}
          hint={
            my.payoff > loan.principal
              ? t("loans.my.includesMinimum", { amount: money(my.payoff - loan.principal, asset) })
              : owedNow > 0n
                ? t("loans.my.interestFirst")
                : t("loans.my.noExtra")
          }
        />
      </dl>

      <TenorTimeline loan={loan} currentPeriod={currentPeriod} />

      <div className="grid gap-4">
        <div className="flex flex-wrap gap-3">
          <PayButton
            icon={HandCoins}
            payment={payment}
            amount={owedNow}
            label={t("loans.my.payInterest")}
            disabled={owedNow === 0n}
            disabledReason={t("loans.my.noInterest")}
            onClick={payInterest}
          />
          <Button variant="secondary" icon={Wallet} onClick={() => setRepayOpen(true)}>
            {t("loans.my.repay")}
          </Button>
        </div>
        {(payment.step !== null || payment.payTx.status !== "idle") && (
          <PayProgress payment={payment} amount={owedNow} />
        )}
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
  const payment = useAssetPayment(circle);
  const asset = payment.asset;
  const amounts = useLoanAmounts(circle);
  const [mode, setMode] = useState<"part" | "full">("full");
  const { t } = useT();
  const [text, setText] = useState("");
  const amount = parseAvaxInput(text, asset);
  const problem = repayProblem(mode, amount, loan.principal, my.interest, my.overdueMonths, asset);
  const sending = mode === "full" ? my.payoff : (amount ?? 0n);

  /** Full: the exact payoff, re-read right before paying. Part: what was typed. */
  async function repayAmount(): Promise<bigint> {
    if (mode !== "full") return sending;
    const fresh = await amounts.refetch();
    return fresh.data?.[1] ?? my.payoff;
  }

  async function repay() {
    if (problem) return;
    const r = await payment.pay({ fn: "repay", amount: repayAmount });
    if (!r) return;
    const value = r.amount;
    onOpenChange(false);
    payment.reset();
    setText("");
    notify.success(
      mode === "full"
        ? t("loans.my.repaidFull")
        : t("loans.my.repaidPart", {
            amount: money(value, asset),
            left: money(loan.principal - value, asset),
          }),
    );
    onRepaid();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !payment.working && onOpenChange(v)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("loans.my.repayTitle")}</DialogTitle>
          <DialogDescription>{t("loans.my.repayDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-7 pt-2">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">{t("loans.my.howMuch")}</legend>
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
                    {m === "full" ? t("loans.my.repayFull") : t("loans.my.repayPart")}
                  </span>
                  <span className="text-[12px] text-muted-foreground">
                    {m === "full"
                      ? t("loans.my.fullHint", { amount: money(my.payoff, asset) })
                      : t("loans.my.partHint")}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {mode === "part" && (
            <div className="grid gap-1.5">
              <label htmlFor="repay-amount" className="text-[13px] font-medium">
                {t("loans.amountIn", { symbol: asset.symbol })}
              </label>
              <input
                id="repay-amount"
                inputMode="decimal"
                autoComplete="off"
                className={inputCls}
                value={text}
                placeholder={t("loans.my.lessThan", { amount: avax(loan.principal, asset) })}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}
          {mode === "full" && my.payoff > loan.principal && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {t("loans.my.includesRule17", { amount: money(my.payoff - loan.principal, asset) })}
            </p>
          )}
          {problem && (mode === "full" || text !== "") && (
            <p className="text-[13px] text-bad">{problem}</p>
          )}

          <div className="grid gap-4">
            <PayButton
              icon={Wallet}
              payment={payment}
              amount={sending}
              label={t("loans.my.repay")}
              disabled={Boolean(problem)}
              disabledReason={problem ?? undefined}
              onClick={repay}
            />
            {(payment.step !== null || payment.payTx.status !== "idle") && (
              <PayProgress payment={payment} amount={sending} />
            )}
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
  const { asset } = useCircleAsset(circle);
  const cancel = useLoanTx(circle);
  const settle = useLoanTx(circle);
  const { t } = useT();
  const r = q.request;
  if (!r) {
    return (
      <section aria-label={t("loans.page.yourLoan")} className={card}>
        <p className="text-[13.5px] text-muted-foreground">{t("loans.my.loadingRequest")}</p>
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
      notify.success(t("loans.withdrawnToast"));
      onChanged();
    }
  }
  async function finalize() {
    const ok = await settle.finalize(id);
    if (ok) {
      notify.success(t("loans.voteSettledToast"));
      onChanged();
    }
  }

  return (
    <section aria-label={t("loans.page.yourLoan")} className={card} data-testid="my-request">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="grid gap-2">
          <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
            {r.medical ? t("loans.my.eyebrowRequestMedical") : t("loans.my.eyebrowRequest")}
          </span>
          <p className="font-display text-[48px] leading-none tracking-tight tabular">
            {avax(r.amount, asset)}
            <small className="ml-2 font-sans text-[14px] tracking-normal text-muted-foreground">
              {t("loans.my.askedFor", { symbol: asset.symbol })}
            </small>
          </p>
        </div>
        <Deadline deadline={r.deadline} chainNow={chainNow} />
      </header>
      <dl className="grid gap-6 sm:grid-cols-2">
        <Fact
          label={t("loans.votes")}
          value={<span data-testid="my-request-tally">{proposalTallyLine(tally)}</span>}
        />
        <Fact
          label={t("loans.guarantor")}
          value={hasGuarantor ? gName : t("loans.none")}
          hint={
            hasGuarantor
              ? r.guarantorAccepted
                ? t("loans.my.agreedHint")
                : t("loans.my.notAgreedHint")
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
              workingLabel={t("loans.settling")}
              state={settle.working ? "working" : undefined}
              onClick={finalize}
            >
              {t("loans.settleVote")}
            </Button>
          )}
          <Button
            variant="ghost"
            icon={Undo2}
            workingLabel={t("loans.withdrawing")}
            state={cancel.working ? "working" : undefined}
            onClick={withdraw}
          >
            {t("loans.withdrawRequest")}
          </Button>
        </div>
        <TxFor tx={settle.tx} />
        <TxFor tx={cancel.tx} />
      </div>
    </section>
  );
}
