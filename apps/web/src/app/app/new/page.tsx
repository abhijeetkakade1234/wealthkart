"use client";

import { circleFactoryAbi } from "@wealthkart/sdk";
import {
  Briefcase,
  Check,
  House,
  Lock,
  type LucideIcon,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { parseEventLogs } from "viem";

import { PageHeader } from "@/components/app/page-header";
import { Button, InlineAlert, TxTracker } from "@/components/kit";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { type AssetSymbol, fmt } from "@/lib/asset";
import { useFactory, useFactoryUsdt } from "@/lib/circle";
import {
  DEFAULTS,
  type FormState,
  MAX_MAX_MEMBERS,
  MAX_QUORUM_PCT,
  MIN_MAX_MEMBERS,
  MIN_QUORUM_PCT,
  validate,
} from "@/lib/circle-form";
import {
  applyTemplate,
  changedFromTemplate,
  type CircleTemplate,
  DEFAULT_TEMPLATE,
  switchAsset,
  templateById,
  type TemplateId,
  TEMPLATES,
  templateSummary,
} from "@/lib/templates";
import { cn } from "@/lib/utils";
import { useTx } from "@/lib/use-tx";
import { useBufferedWriteContract } from "@/lib/use-buffered-write";
import { TARGET_CHAIN } from "@/lib/wagmi";

export default function NewCirclePage() {
  return (
    <RequireWallet>
      <NewCircle />
    </RequireWallet>
  );
}

function NewCircle() {
  const router = useRouter();
  const { address } = useCoreWallet();
  const factory = useFactory();
  const { usdt } = useFactoryUsdt();
  const writeContractAsync = useBufferedWriteContract();
  const tx = useTx();
  const [templateId, setTemplateId] = useState<TemplateId>(DEFAULT_TEMPLATE);
  const template = templateById(templateId) ?? TEMPLATES[0]!;
  const [form, setForm] = useState<FormState>(() => applyTemplate(DEFAULTS, template));
  const [touched, setTouched] = useState(false);
  const v = useMemo(() => validate(form, address), [form, address]);
  const set =
    (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = (k: keyof FormState) => (touched ? v.errors[k] : undefined);
  const unit = form.asset;

  const changed = changedFromTemplate(form, template);

  /** Switching asset swaps in the template's amounts for it, unless the creator typed their own. */
  function pickAsset(next: AssetSymbol) {
    setForm((f) => switchAsset(f, next, template));
  }

  /** A template fills in the rule fields below; name, asset and friends stay as they are. */
  function pickTemplate(next: CircleTemplate) {
    if (next.id === template.id) return;
    setForm((f) => applyTemplate(f, next, template));
    setTemplateId(next.id);
  }

  async function create() {
    setTouched(true);
    if (!v.ok || !v.cfg || !factory) return;
    if (form.asset === "USDT" && !usdt) return;
    const cfg = v.cfg;
    const receipt = await tx.run(() =>
      writeContractAsync({
        abi: circleFactoryAbi,
        address: factory,
        functionName: "createCircle",
        args: [cfg, v.invitees],
      }),
    );
    if (!receipt) return;
    const [created] = parseEventLogs({
      abi: circleFactoryAbi,
      logs: receipt.logs,
      eventName: "CircleCreated",
    });
    if (created) router.push(`/app/circle/?id=${created.args.circle}`);
  }

  if (!factory) {
    return (
      <>
        <PageHeader title="Start a circle" />
        <InlineAlert tone="warn">
          {"WealthKart isn't live on this network yet. Check back soon."}
        </InlineAlert>
      </>
    );
  }

  const busy = tx.status === "confirm" || tx.status === "sending";

  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="Start a circle"
        subtitle="Set the rules once. After that, changes need a vote from the members."
      />

      <div className="grid gap-12">
        <Section title="1. Pick a starting point">
          <TemplatePicker value={template} onChange={pickTemplate} />
          <TemplateSummary template={template} asset={form.asset} changed={changed} />
        </Section>

        <Section title="2. The basics">
          <Field
            label="Circle name"
            hint="Shown to members. Letters, numbers and spaces; no web addresses. It's public on the blockchain, so don't use personal details."
            error={err("name")}
          >
            <input
              id="name"
              className={inputCls}
              value={form.name}
              onChange={set("name")}
              placeholder="College Gang"
              maxLength={60}
            />
          </Field>
        </Section>

        <Section title="3. Money the circle holds">
          <AssetChoice value={form.asset} usdtAvailable={Boolean(usdt)} onChange={pickAsset} />
          {form.asset === "USDT" && (
            <InlineAlert tone="warn" title="Before you pick USDT">
              <span data-testid="usdt-warning">
                Tether, the company behind USDT, can freeze any wallet. If it froze this
                circle&apos;s, nobody could get the money out. If it froze a member&apos;s, their
                payout waits in the circle until Tether lets it through. If Tether ever adds a
                transfer fee, the circle covers small fees (up to 1%) so payments keep working.
                Network fees are still paid in AVAX, so every member needs a little AVAX too.
              </span>
            </InlineAlert>
          )}
        </Section>

        <Section title="4. Monthly installment">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label={`Amount each month (${unit})`} error={err("installment")}>
              <input
                id="installment"
                className={inputCls}
                inputMode="decimal"
                value={form.installment}
                onChange={set("installment")}
              />
            </Field>
            <Field
              label="Due day of the month"
              hint="Payments are due by 23:59 UTC on this day."
              error={err("dueDay")}
            >
              <input
                id="dueDay"
                className={inputCls}
                inputMode="numeric"
                value={form.dueDay}
                onChange={set("dueDay")}
              />
            </Field>
            <Field label={`Late fee after the due day (${unit})`} error={err("fee1")}>
              <input
                id="fee1"
                className={inputCls}
                inputMode="decimal"
                value={form.fee1}
                onChange={set("fee1")}
              />
            </Field>
            <Field label={`Second late fee (${unit})`} error={err("fee2")}>
              <input
                id="fee2"
                className={inputCls}
                inputMode="decimal"
                value={form.fee2}
                onChange={set("fee2")}
              />
            </Field>
            <Field label="Second fee starts after day" error={err("secondFeeDay")}>
              <input
                id="secondFeeDay"
                className={inputCls}
                inputMode="numeric"
                value={form.secondFeeDay}
                onChange={set("secondFeeDay")}
              />
            </Field>
            <Field
              label="Payment holidays per year"
              hint="A holiday delays one month's payment with no late fee."
              error={err("holidays")}
            >
              <input
                id="holidays"
                className={inputCls}
                inputMode="numeric"
                value={form.holidays}
                onChange={set("holidays")}
              />
            </Field>
            <Field
              label="Missed months before a dormant vote"
              hint="If someone loses their wallet, the circle can vote to pause their payments after this many missed months. Their savings stay theirs."
              error={err("dormantAfter")}
            >
              <input
                id="dormantAfter"
                className={inputCls}
                inputMode="numeric"
                value={form.dormantAfter}
                onChange={set("dormantAfter")}
              />
            </Field>
            <Field
              label="Payments before a new member can vote"
              hint="Friends you start with vote straight away. Someone voted in later votes after paying this many months, so nobody can stack the circle with spare wallets."
              error={err("minPaidToVote")}
            >
              <input
                id="minPaidToVote"
                className={inputCls}
                inputMode="numeric"
                value={form.minPaidToVote}
                onChange={set("minPaidToVote")}
              />
            </Field>
          </div>
        </Section>

        <Section title="5. Loans, votes and leaving">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label="Loan interest per month (%)"
              hint="0 to 5. Later loan terms never charge less than this."
              error={err("interestPct")}
            >
              <input
                id="interestPct"
                className={inputCls}
                inputMode="decimal"
                value={form.interestPct}
                onChange={set("interestPct")}
              />
            </Field>
            <Field
              label="Loan limit vs savings"
              hint="A loan can be this many times your savings plus your guarantor's, 1 to 10."
              error={err("kMultiplier")}
            >
              <input
                id="kMultiplier"
                className={inputCls}
                inputMode="numeric"
                value={form.kMultiplier}
                onChange={set("kMultiplier")}
              />
            </Field>
            <Field
              label="Voters who must take part (%)"
              hint={`${MIN_QUORUM_PCT} to ${MAX_QUORUM_PCT}. A vote only counts once this share of voters has voted.`}
              error={err("quorumPct")}
            >
              <input
                id="quorumPct"
                className={inputCls}
                inputMode="numeric"
                value={form.quorumPct}
                onChange={set("quorumPct")}
              />
            </Field>
            <Field
              label="Yes votes needed (%)"
              hint="50 to 100, for loans and rule changes. 50 means more than half."
              error={err("passPct")}
            >
              <input
                id="passPct"
                className={inputCls}
                inputMode="numeric"
                value={form.passPct}
                onChange={set("passPct")}
              />
            </Field>
            <Field
              label="Notice to leave (days)"
              hint="0 to 90. A member who leaves is paid out after this many days."
              error={err("exitNoticeDays")}
            >
              <input
                id="exitNoticeDays"
                className={inputCls}
                inputMode="numeric"
                value={form.exitNoticeDays}
                onChange={set("exitNoticeDays")}
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-border px-5 py-4 transition-colors hover:bg-secondary">
            <input
              id="guarantorRequired"
              type="checkbox"
              className="mt-1 size-4 accent-[var(--brand)]"
              checked={form.guarantorRequired === "true"}
              onChange={(e) =>
                setForm((f) => ({ ...f, guarantorRequired: String(e.target.checked) }))
              }
            />
            <span className="grid gap-1">
              <span className="text-[14px] font-medium">Every loan needs a guarantor</span>
              <span className="text-[13px] text-muted-foreground">
                Another member backs the loan with their savings. Members can change any of these
                rules later by vote.
              </span>
            </span>
          </label>
        </Section>

        <Section title="6. Members">
          <Field
            label="Most members the circle can have"
            hint={`${MIN_MAX_MEMBERS} to ${MAX_MAX_MEMBERS}. It can't be raised later. The starting point only suggests a number; pick what suits your circle.`}
            error={err("maxMembers")}
          >
            <input
              id="maxMembers"
              className={cn(inputCls, "sm:max-w-[200px]")}
              inputMode="numeric"
              value={form.maxMembers}
              onChange={set("maxMembers")}
            />
          </Field>
          {v.bigCircle && !v.errors.maxMembers && (
            <p className="text-[13px] text-muted-foreground" data-testid="big-circle-note">
              Bigger circles mean slower votes: every loan, new member and rule change needs enough
              of them to take part. Most friend circles work best with 20 or fewer.
            </p>
          )}
          <Field
            label="Friends' wallet addresses"
            hint="One per line. You join straight away; each friend gets an invite and becomes a member once they accept it in the app."
            error={err("founders")}
          >
            <textarea
              id="founders"
              className={`${inputCls} min-h-36 font-mono text-[12.5px]`}
              value={form.founders}
              onChange={set("founders")}
              placeholder={"0x…\n0x…"}
            />
          </Field>
          <p className="text-[13px] text-muted-foreground">
            {v.founders.length} {v.founders.length === 1 ? "member" : "members"} · each pays{" "}
            {v.cfg ? fmt(v.cfg.installment, v.asset) : "–"} {unit} a month
          </p>
        </Section>

        <InlineAlert tone="info">
          {TARGET_CHAIN.testnet
            ? "This runs on the Fuji test network, so use test money only. A circle's money and member limit can't be changed after it's created."
            : "This uses real money on Avalanche. A circle's money and member limit can't be changed after it's created."}
        </InlineAlert>

        <div className="grid gap-6">
          <Button
            size="lg"
            icon={Sparkles}
            workingLabel="Creating…"
            state={busy ? "working" : undefined}
            onClick={create}
            disabled={touched && !v.ok}
            disabledReason="Fix the fields marked above"
          >
            Create circle
          </Button>
          {tx.status !== "idle" && (
            <TxTracker
              status={tx.status}
              failedAt={tx.failedAt}
              failedMessage={tx.failedMessage}
              explorerUrl={tx.explorerUrl}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const TEMPLATE_ICON: Record<TemplateId, LucideIcon> = {
  friends: Users,
  family: House,
  office: Briefcase,
  custom: SlidersHorizontal,
};

/**
 * Step 1 (ADR 0054): four starting points as a radio group. Picking one fills in the rule
 * fields below; nothing is locked, and the asset and member cap stay the creator's choice.
 */
function TemplatePicker({
  value,
  onChange,
}: {
  value: CircleTemplate;
  onChange: (t: CircleTemplate) => void;
}) {
  return (
    <fieldset className="grid gap-4">
      <legend className="sr-only">Pick a starting point</legend>
      <p className="text-[14px] text-muted-foreground">
        Each one fills in the rules below. You can change any of them before you create the circle.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const Icon = TEMPLATE_ICON[t.id];
          const on = value.id === t.id;
          return (
            <label
              key={t.id}
              data-testid={`template-${t.id}`}
              className={cn(
                "group flex cursor-pointer items-start gap-4 rounded-[12px] border px-5 py-5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30",
                on ? "border-brand bg-brand-soft" : "border-border hover:bg-secondary",
              )}
            >
              <input
                type="radio"
                name="template"
                value={t.id}
                aria-label={t.name}
                className="sr-only"
                checked={on}
                onChange={() => onChange(t)}
              />
              <span
                className={cn(
                  "inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition-transform group-active:scale-95",
                  on ? "border-brand bg-card text-brand" : "border-border text-muted-foreground",
                )}
                aria-hidden
              >
                {on ? (
                  <Check className="size-4" strokeWidth={1.75} />
                ) : (
                  <Icon className="size-4" strokeWidth={1.5} />
                )}
              </span>
              <span className="grid gap-1">
                <span className="text-[15px] font-medium">{t.name}</span>
                <span className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {t.blurb}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** What the picked template means, in plain sentences, and how far the form has moved from it. */
function TemplateSummary({
  template,
  asset,
  changed,
}: {
  template: CircleTemplate;
  asset: AssetSymbol;
  changed: number;
}) {
  return (
    <div
      className="grid gap-4 rounded-[14px] border border-line-soft bg-card px-6 py-6"
      data-testid="template-summary"
      aria-live="polite"
    >
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-display text-[22px] leading-tight">
          {template.id === "custom" ? "Your own rules" : `What ${template.name} means`}
        </span>
        {changed > 0 && (
          <span className="text-[12.5px] text-muted-foreground" data-testid="template-changed">
            You changed {changed} {changed === 1 ? "setting" : "settings"}
          </span>
        )}
      </p>
      {template.id === "custom" ? (
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          The fields start at the usual rules. Set each one the way your circle wants it.
        </p>
      ) : (
        <ul className="grid gap-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
          {templateSummary(template, asset).map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-brand" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * AVAX or USDT, as a two-option radio group. USDT is offered only where the factory has a
 * USDT token (ADR 0046). The choice is fixed forever, so it says so right here.
 */
function AssetChoice({
  value,
  usdtAvailable,
  onChange,
}: {
  value: AssetSymbol;
  usdtAvailable: boolean;
  onChange: (a: AssetSymbol) => void;
}) {
  const options: Array<{ id: AssetSymbol; body: string }> = [
    {
      id: "AVAX",
      body: "Avalanche's own coin. Its price moves, so savings can rise or fall in value.",
    },
    {
      id: "USDT",
      body: usdtAvailable
        ? "A digital dollar from Tether. Stays close to 1 US dollar."
        : "Not available on this network yet.",
    },
  ];
  return (
    <fieldset className="grid gap-4">
      <legend className="sr-only">Money the circle holds</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => {
          const disabled = o.id === "USDT" && !usdtAvailable;
          return (
            <label
              key={o.id}
              className={cn(
                "flex items-start gap-3 rounded-[12px] border px-5 py-5 transition-colors",
                disabled
                  ? "cursor-not-allowed border-border opacity-55"
                  : value === o.id
                    ? "cursor-pointer border-brand bg-brand-soft"
                    : "cursor-pointer border-border hover:bg-secondary",
              )}
            >
              <input
                type="radio"
                name="asset"
                value={o.id}
                aria-label={o.id}
                className="mt-1 size-4 accent-[var(--brand)]"
                checked={value === o.id}
                disabled={disabled}
                onChange={() => onChange(o.id)}
              />
              <span className="grid gap-1">
                <span className="text-[15px] font-medium">{o.id}</span>
                <span className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {o.body}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Lock className="size-3.5" strokeWidth={1.5} aria-hidden />
        Fixed forever. Members pay, borrow and get paid out in this; it can never be switched.
      </p>
    </fieldset>
  );
}

const inputCls =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6">
      <h2 className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactElement<{ id: string }>;
}) {
  const id = children.props.id;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-[14px] font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-bad" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
