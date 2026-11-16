"use client";

import { shortAddress } from "@wealthkart/sdk";
import { Check, HandCoins, Landmark, X } from "lucide-react";
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
import { money, useCircleAsset } from "@/lib/asset";
import { type MyLoan, useLoanMembers, useLoanTx } from "@/lib/loan-hooks";
import { avax, loanLimits, loanPreview, parseAvaxInput } from "@/lib/loans";
import { formatBps, type RulesParams } from "@/lib/rules";
import { notify } from "@/lib/toast";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

import { inputCls, usePeriodText } from "./parts";

/**
 * "Ask for a loan" (ADR 0038, PLAN.md D4b): amount with live checks against every limit, the
 * type, an optional guarantor, and what it would cost month by month before anything is sent.
 */
export function AskLoanButton({
  circle,
  me,
  rules,
  my,
  currentPeriod,
  dueDay,
  blocked,
  tied,
  onAsked,
}: {
  circle: Address;
  me: Address;
  rules: RulesParams;
  my: MyLoan;
  currentPeriod: number;
  dueDay: number;
  /** Why asking isn't possible now (shown on the disabled button). */
  blocked: string | null;
  /** Members already tied to a loan (borrowers and guarantors), left out of the picker. */
  tied: { borrowers: Set<string>; guarantors: Set<string> };
  onAsked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const action = useLoanTx(circle);
  const { t } = useT();
  return (
    <>
      <Button
        icon={HandCoins}
        disabled={Boolean(blocked)}
        disabledReason={blocked ?? undefined}
        onClick={() => {
          action.tx.reset();
          setOpen(true);
        }}
      >
        {t("loans.ask.button")}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !action.working && setOpen(v)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t("loans.ask.button")}</DialogTitle>
            <DialogDescription>{t("loans.ask.description")}</DialogDescription>
          </DialogHeader>
          {open && (
            <AskForm
              circle={circle}
              me={me}
              rules={rules}
              my={my}
              currentPeriod={currentPeriod}
              dueDay={dueDay}
              tied={tied}
              action={action}
              onDone={() => {
                setOpen(false);
                action.tx.reset();
                notify.success(t("loans.ask.sent"));
                onAsked();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AskForm({
  circle,
  me,
  rules,
  my,
  currentPeriod,
  dueDay,
  tied,
  action,
  onDone,
}: {
  circle: Address;
  me: Address;
  rules: RulesParams;
  my: MyLoan;
  currentPeriod: number;
  dueDay: number;
  tied: { borrowers: Set<string>; guarantors: Set<string> };
  action: ReturnType<typeof useLoanTx>;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [medical, setMedical] = useState(false);
  const [guarantor, setGuarantor] = useState<string>("");
  const typed = useDebounced(text, 300);
  const { t, tn } = useT();
  const period = usePeriodText();
  const { asset } = useCircleAsset(circle);
  const amount = parseAvaxInput(typed, asset);
  const { members, isPending } = useLoanMembers(circle);
  // One stake backs one loan (ADR 0043): nobody with a loan, a request or a guarantee of
  // their own can back yours.
  const options = members.filter((m) => {
    const a = m.address.toLowerCase();
    return (
      m.canGuarantee && a !== me.toLowerCase() && !tied.borrowers.has(a) && !tied.guarantors.has(a)
    );
  });
  const chosen = options.find((m) => m.address === guarantor) ?? null;
  const medicalOn = rules.medicalCap > 0n;

  // Not memoised: cheap, and the limit labels must follow a language switch.
  const limits = loanLimits({
    totalAssets: my.totalAssets,
    myStake: my.stake,
    guarantorStake: chosen?.stake ?? 0n,
    lendable: my.lendable,
    rules,
    medical,
  });
  const preview = loanPreview(amount ?? limits.limit, rules, medical, currentPeriod);
  const needsGuarantor = rules.guarantorRequired && !chosen;
  const tooBig = amount !== null && amount > limits.limit;
  const problem =
    typed.trim() !== "" && amount === null
      ? asset.symbol === "USDT"
        ? t("loans.typeAmountUsdt")
        : t("loans.typeAmountAvax")
      : tooBig
        ? t("loans.ask.tooBig", { amount: money(limits.limit, asset) })
        : null;
  const canSend = amount !== null && !tooBig && !needsGuarantor && text === typed;

  async function send() {
    if (!canSend || amount === null) return;
    const r = await action.request(amount, medical, (chosen?.address as Address) ?? null);
    if (r) onDone();
  }

  return (
    <form
      className="grid gap-8 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-[13px] font-medium">{t("loans.ask.typeLegend")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <TypeOption
            checked={!medical}
            onChange={() => setMedical(false)}
            title={t("loans.regular")}
            text={t("loans.ask.regularText", { rate: formatBps(rules.interestBps) })}
          />
          <TypeOption
            checked={medical}
            onChange={() => setMedical(true)}
            disabled={!medicalOn}
            title={t("loans.medical")}
            text={
              medicalOn
                ? t("loans.ask.medicalText", {
                    amount: money(rules.medicalCap, asset),
                    months: rules.medicalFreeMonths,
                  })
                : t("loans.ask.medicalOff")
            }
          />
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor="loan-amount" className="text-[13px] font-medium">
          {t("loans.amountIn", { symbol: asset.symbol })}
        </label>
        <input
          id="loan-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder={t("loans.ask.placeholder", { amount: avax(limits.limit, asset) })}
          className={inputCls}
          value={text}
          aria-invalid={Boolean(problem)}
          aria-describedby="loan-amount-hint"
          onChange={(e) => setText(e.target.value)}
        />
        <span
          id="loan-amount-hint"
          className={cn("text-[12px]", problem ? "text-bad" : "text-muted-foreground")}
        >
          {problem ?? t("loans.ask.canAsk", { amount: money(limits.limit, asset) })}
        </span>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="loan-guarantor" className="text-[13px] font-medium">
          {rules.guarantorRequired ? t("loans.guarantor") : t("loans.ask.guarantorOptional")}
        </label>
        <select
          id="loan-guarantor"
          className={inputCls}
          value={guarantor}
          onChange={(e) => setGuarantor(e.target.value)}
          disabled={isPending}
        >
          <option value="">
            {rules.guarantorRequired ? t("loans.ask.pickMember") : t("loans.ask.noGuarantor")}
          </option>
          {options.map((m) => (
            <option key={m.address} value={m.address}>
              {t("loans.ask.memberOption", {
                name: m.name || shortAddress(m.address),
                amount: money(m.stake, asset),
              })}
            </option>
          ))}
        </select>
        <span className="text-[12px] leading-relaxed text-muted-foreground">
          {t("loans.ask.guarantorHelp")}
        </span>
      </div>

      <section aria-label={t("loans.ask.limitsAria")} className="grid gap-3">
        <h4 className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          {t("loans.ask.yourLimits")}
        </h4>
        <ul className="grid divide-y divide-line-soft rounded-[12px] border border-border">
          {limits.lines.map((l) => {
            const fits = amount === null ? null : amount <= l.cap;
            return (
              <li key={l.key} className="flex items-start gap-3.5 px-5 py-4" data-limit={l.key}>
                <span
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                    fits === false
                      ? "bg-bad-soft text-bad"
                      : fits
                        ? "bg-good-soft text-good"
                        : "bg-secondary text-faint",
                  )}
                  aria-label={
                    fits === false
                      ? t("loans.ask.overLimit")
                      : fits
                        ? t("loans.ask.withinLimit")
                        : undefined
                  }
                >
                  {fits === false ? (
                    <X className="size-3.5" strokeWidth={2} aria-hidden />
                  ) : (
                    <Check className="size-3.5" strokeWidth={2} aria-hidden />
                  )}
                </span>
                <span className="grid flex-1 gap-0.5">
                  <span className="text-[13.5px] font-medium">{l.label}</span>
                  <span className="text-[12px] text-muted-foreground">{l.explain}</span>
                </span>
                <span className="font-mono text-[13.5px] tabular">{money(l.cap, asset)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-label={t("loans.ask.costAria")}
        className="grid gap-4 rounded-[12px] bg-secondary/60 p-6"
      >
        <h4 className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          {amount === null
            ? t("loans.ask.costAt", { amount: money(limits.limit, asset) })
            : t("loans.ask.cost")}
        </h4>
        <ol className="grid gap-3 sm:grid-cols-3">
          {preview.tenors.map((step) => (
            <li key={step.tenor} className="grid gap-1 rounded-[10px] bg-card px-4 py-3.5">
              <span className="text-[12px] text-muted-foreground">
                {t("loans.range", { from: period.short(step.from), to: period.short(step.to) })}
              </span>
              <span className="font-mono text-[14px] tabular">
                {t("loans.amountMonth", { amount: money(step.monthly, asset) })}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {t("loans.rateMonth", { rate: formatBps(step.rateBps) })}
              </span>
            </li>
          ))}
        </ol>
        <ul className="grid gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <li>
            {preview.freeMonths > 1
              ? t("loans.ask.interestStartsFree", {
                  month: period.long(preview.firstCharged),
                  free: preview.freeMonths,
                  day: dueDay,
                })
              : t("loans.ask.interestStarts", {
                  month: period.long(preview.firstCharged),
                  day: dueDay,
                })}
          </li>
          <li>{t("loans.ask.repayAny", { month: period.long(preview.repayBy) })}</li>
          {preview.minimum > 0n && (
            <li>{t("loans.ask.minimum", { amount: money(preview.minimum, asset) })}</li>
          )}
          <li>
            {tn(chosen ? "loans.ask.lateGuarantor" : "loans.ask.late", rules.defaultAfter, {
              fee: money(rules.interestFee, asset),
            })}
          </li>
        </ul>
      </section>

      {my.lendable === 0n && (
        <InlineAlert tone="warn" title={t("loans.ask.noCashTitle")}>
          {t("loans.ask.noCashBody")}
        </InlineAlert>
      )}

      <div className="grid gap-4">
        <Button
          type="submit"
          icon={Landmark}
          workingLabel={t("loans.sending")}
          state={action.working ? "working" : undefined}
          disabled={!canSend}
          disabledReason={needsGuarantor ? t("loans.ask.needsGuarantor") : t("loans.ask.typeFirst")}
        >
          {t("loans.ask.submit")}
        </Button>
        <TxFor tx={action.tx} />
      </div>
    </form>
  );
}

function TypeOption({
  checked,
  onChange,
  title,
  text,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  text: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-4 transition-colors",
        checked ? "border-brand bg-brand-soft" : "border-border hover:bg-secondary",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name="loan-type"
        className="mt-1 size-4 accent-[var(--brand)]"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="grid gap-0.5">
        <span className="text-[14px] font-medium">{title}</span>
        <span className="text-[12px] leading-relaxed text-muted-foreground">{text}</span>
      </span>
    </label>
  );
}
