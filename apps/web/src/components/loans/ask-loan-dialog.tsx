"use client";

import { periodLabel, shortAddress } from "@wealthkart/sdk";
import { Check, HandCoins, Landmark, X } from "lucide-react";
import { useMemo, useState } from "react";
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
import { type MyLoan, useLoanMembers, useLoanTx } from "@/lib/loan-hooks";
import { avax, loanLimits, loanPreview, parseAvaxInput } from "@/lib/loans";
import { formatBps, type RulesParams } from "@/lib/rules";
import { notify } from "@/lib/toast";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

import { inputCls } from "./parts";

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
        Ask for a loan
      </Button>
      <Dialog open={open} onOpenChange={(v) => !action.working && setOpen(v)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Ask for a loan</DialogTitle>
            <DialogDescription>
              The other members vote. If enough say yes, the AVAX is sent to your wallet straight
              away. Nobody approves it by hand.
            </DialogDescription>
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
                notify.success("Loan request sent. The other members can vote on it in Votes.");
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
  const amount = parseAvaxInput(typed);
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

  const limits = useMemo(
    () =>
      loanLimits({
        totalAssets: my.totalAssets,
        myStake: my.stake,
        guarantorStake: chosen?.stake ?? 0n,
        lendable: my.lendable,
        rules,
        medical,
      }),
    [my.totalAssets, my.stake, my.lendable, chosen, rules, medical],
  );
  const preview = loanPreview(amount ?? limits.limit, rules, medical, currentPeriod);
  const needsGuarantor = rules.guarantorRequired && !chosen;
  const tooBig = amount !== null && amount > limits.limit;
  const problem =
    typed.trim() !== "" && amount === null
      ? "Type an amount in AVAX, like 0.25."
      : tooBig
        ? `That's more than you can ask for right now. The most is ${avax(limits.limit)} AVAX.`
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
        <legend className="mb-3 text-[13px] font-medium">Type of loan</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <TypeOption
            checked={!medical}
            onChange={() => setMedical(false)}
            title="Regular"
            text={`${formatBps(rules.interestBps)} a month to start.`}
          />
          <TypeOption
            checked={medical}
            onChange={() => setMedical(true)}
            disabled={!medicalOn}
            title="Medical"
            text={
              medicalOn
                ? `Up to ${avax(rules.medicalCap)} AVAX, ${rules.medicalFreeMonths} months interest-free, once a year. Faster vote.`
                : "This circle doesn't offer medical loans."
            }
          />
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor="loan-amount" className="text-[13px] font-medium">
          Amount in AVAX
        </label>
        <input
          id="loan-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder={`Up to ${avax(limits.limit)}`}
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
          {problem ?? `You can ask for up to ${avax(limits.limit)} AVAX right now.`}
        </span>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="loan-guarantor" className="text-[13px] font-medium">
          {rules.guarantorRequired ? "Guarantor" : "Guarantor (optional)"}
        </label>
        <select
          id="loan-guarantor"
          className={inputCls}
          value={guarantor}
          onChange={(e) => setGuarantor(e.target.value)}
          disabled={isPending}
        >
          <option value="">{rules.guarantorRequired ? "Pick a member" : "No guarantor"}</option>
          {options.map((m) => (
            <option key={m.address} value={m.address}>
              {m.name || shortAddress(m.address)} · {avax(m.stake)} AVAX saved
            </option>
          ))}
        </select>
        <span className="text-[12px] leading-relaxed text-muted-foreground">
          A guarantor is a member who backs your loan. Their savings raise your limit, and if the
          loan goes unpaid their share can be frozen and used. They must agree before the AVAX is
          sent.
        </span>
      </div>

      <section aria-label="Limits" className="grid gap-3">
        <h4 className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          Your limits
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
                    fits === false ? "Over this limit" : fits ? "Within this limit" : undefined
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
                <span className="font-mono text-[13.5px] tabular">{avax(l.cap)} AVAX</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="What it costs" className="grid gap-4 rounded-[12px] bg-secondary/60 p-6">
        <h4 className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          What it costs{amount === null ? ` (at ${avax(limits.limit)} AVAX)` : ""}
        </h4>
        <ol className="grid gap-3 sm:grid-cols-3">
          {preview.tenors.map((t) => (
            <li key={t.tenor} className="grid gap-1 rounded-[10px] bg-card px-4 py-3.5">
              <span className="text-[12px] text-muted-foreground">
                {periodLabel(t.from).slice(0, 3)} {periodLabel(t.from).slice(-4)} to{" "}
                {periodLabel(t.to).slice(0, 3)} {periodLabel(t.to).slice(-4)}
              </span>
              <span className="font-mono text-[14px] tabular">{avax(t.monthly)} AVAX a month</span>
              <span className="text-[12px] text-muted-foreground">
                {formatBps(t.rateBps)} a month
              </span>
            </li>
          ))}
        </ol>
        <ul className="grid gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <li>
            Interest starts in {periodLabel(preview.firstCharged)}
            {preview.freeMonths > 1 ? ` (the first ${preview.freeMonths} months are free)` : ""}.
            Pay it by day {dueDay} of each month (UTC); it&apos;s worked out on what you still owe
            at the start of the month.
          </li>
          <li>
            Repay any part whenever you like. The whole loan is due by the end of{" "}
            {periodLabel(preview.repayBy)}.
          </li>
          {preview.minimum > 0n && (
            <li>
              Repaying in the month you borrow still costs one month&apos;s interest (
              {avax(preview.minimum)} AVAX).
            </li>
          )}
          <li>
            Late interest costs {avax(rules.interestFee)} AVAX a month extra. After{" "}
            {rules.defaultAfter} late {rules.defaultAfter === 1 ? "month" : "months"}, anyone can
            mark the loan as defaulted, which freezes you{chosen ? " and your guarantor" : ""}.
          </li>
        </ul>
      </section>

      {my.lendable === 0n && (
        <InlineAlert tone="warn" title="No cash free to lend">
          Everything above the reserve is lent out right now. Try again after someone repays.
        </InlineAlert>
      )}

      <div className="grid gap-4">
        <Button
          type="submit"
          icon={Landmark}
          workingLabel="Sending…"
          state={action.working ? "working" : undefined}
          disabled={!canSend}
          disabledReason={
            needsGuarantor ? "This circle needs a guarantor for every loan" : "Type an amount first"
          }
        >
          Ask the circle
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
