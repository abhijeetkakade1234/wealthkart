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
import { useT } from "@/i18n/react";
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
  const { t, tn, locale } = useT();
  const [templateId, setTemplateId] = useState<TemplateId>(DEFAULT_TEMPLATE);
  const template = templateById(templateId) ?? TEMPLATES[0]!;
  const [form, setForm] = useState<FormState>(() => applyTemplate(DEFAULTS, template));
  const [touched, setTouched] = useState(false);
  // Messages come from the active language, so a switch re-validates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const v = useMemo(() => validate(form, address), [form, address, locale]);
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
        <PageHeader title={t("create.title")} />
        <InlineAlert tone="warn">{t("create.notLive")}</InlineAlert>
      </>
    );
  }

  const busy = tx.status === "confirm" || tx.status === "sending";

  return (
    <div className="max-w-[720px]">
      <PageHeader title={t("create.title")} subtitle={t("create.subtitle")} />

      <div className="grid gap-12">
        <Section title={t("create.section.template")}>
          <TemplatePicker value={template} onChange={pickTemplate} />
          <TemplateSummary template={template} asset={form.asset} changed={changed} />
        </Section>

        <Section title={t("create.section.basics")}>
          <Field
            label={t("create.field.name")}
            hint={t("create.field.nameHint")}
            error={err("name")}
          >
            <input
              id="name"
              className={inputCls}
              value={form.name}
              onChange={set("name")}
              placeholder={t("create.field.namePlaceholder")}
              maxLength={60}
            />
          </Field>
        </Section>

        <Section title={t("create.section.asset")}>
          <AssetChoice value={form.asset} usdtAvailable={Boolean(usdt)} onChange={pickAsset} />
          {form.asset === "USDT" && (
            <InlineAlert tone="warn" title={t("create.usdtWarningTitle")}>
              <span data-testid="usdt-warning">{t("create.usdtWarning")}</span>
            </InlineAlert>
          )}
        </Section>

        <Section title={t("create.section.installment")}>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label={t("create.field.amount", { unit })} error={err("installment")}>
              <input
                id="installment"
                className={inputCls}
                inputMode="decimal"
                value={form.installment}
                onChange={set("installment")}
              />
            </Field>
            <Field
              label={t("create.field.dueDay")}
              hint={t("create.field.dueDayHint")}
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
            <Field label={t("create.field.fee1", { unit })} error={err("fee1")}>
              <input
                id="fee1"
                className={inputCls}
                inputMode="decimal"
                value={form.fee1}
                onChange={set("fee1")}
              />
            </Field>
            <Field label={t("create.field.fee2", { unit })} error={err("fee2")}>
              <input
                id="fee2"
                className={inputCls}
                inputMode="decimal"
                value={form.fee2}
                onChange={set("fee2")}
              />
            </Field>
            <Field label={t("create.field.secondFeeDay")} error={err("secondFeeDay")}>
              <input
                id="secondFeeDay"
                className={inputCls}
                inputMode="numeric"
                value={form.secondFeeDay}
                onChange={set("secondFeeDay")}
              />
            </Field>
            <Field
              label={t("create.field.holidays")}
              hint={t("create.field.holidaysHint")}
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
              label={t("create.field.dormantAfter")}
              hint={t("create.field.dormantAfterHint")}
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
              label={t("create.field.minPaidToVote")}
              hint={t("create.field.minPaidToVoteHint")}
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

        <Section title={t("create.section.loans")}>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field
              label={t("create.field.interestPct")}
              hint={t("create.field.interestPctHint")}
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
              label={t("create.field.kMultiplier")}
              hint={t("create.field.kMultiplierHint")}
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
              label={t("create.field.quorumPct")}
              hint={t("create.field.quorumPctHint", { min: MIN_QUORUM_PCT, max: MAX_QUORUM_PCT })}
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
              label={t("create.field.passPct")}
              hint={t("create.field.passPctHint")}
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
              label={t("create.field.exitNoticeDays")}
              hint={t("create.field.exitNoticeDaysHint")}
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
              <span className="text-[14px] font-medium">{t("create.field.guarantor")}</span>
              <span className="text-[13px] text-muted-foreground">
                {t("create.field.guarantorHint")}
              </span>
            </span>
          </label>
        </Section>

        <Section title={t("create.section.members")}>
          <Field
            label={t("create.field.maxMembers")}
            hint={t("create.field.maxMembersHint", { min: MIN_MAX_MEMBERS, max: MAX_MAX_MEMBERS })}
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
              {t("create.field.bigCircle")}
            </p>
          )}
          <Field
            label={t("create.field.founders")}
            hint={t("create.field.foundersHint")}
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
            {tn("create.field.foundersCount", v.founders.length, {
              amount: v.cfg ? fmt(v.cfg.installment, v.asset) : "–",
              unit,
            })}
          </p>
        </Section>

        <InlineAlert tone="info">
          {TARGET_CHAIN.testnet ? t("create.testnetNote") : t("create.mainnetNote")}
        </InlineAlert>

        <div className="grid gap-6">
          <Button
            size="lg"
            icon={Sparkles}
            workingLabel={t("create.submitting")}
            state={busy ? "working" : undefined}
            onClick={create}
            disabled={touched && !v.ok}
            disabledReason={t("create.fixFields")}
          >
            {t("create.submit")}
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
  onChange: (tpl: CircleTemplate) => void;
}) {
  const { t } = useT();
  return (
    <fieldset className="grid gap-4">
      <legend className="sr-only">{t("create.picker.legend")}</legend>
      <p className="text-[14px] text-muted-foreground">{t("create.picker.intro")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((tpl) => {
          const Icon = TEMPLATE_ICON[tpl.id];
          const on = value.id === tpl.id;
          return (
            <label
              key={tpl.id}
              data-testid={`template-${tpl.id}`}
              className={cn(
                "group flex cursor-pointer items-start gap-4 rounded-[12px] border px-5 py-5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30",
                on ? "border-brand bg-brand-soft" : "border-border hover:bg-secondary",
              )}
            >
              <input
                type="radio"
                name="template"
                value={tpl.id}
                aria-label={tpl.name}
                className="sr-only"
                checked={on}
                onChange={() => onChange(tpl)}
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
                <span className="text-[15px] font-medium">{tpl.name}</span>
                <span className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {tpl.blurb}
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
  const { t, tn } = useT();
  return (
    <div
      className="grid gap-4 rounded-[14px] border border-line-soft bg-card px-6 py-6"
      data-testid="template-summary"
      aria-live="polite"
    >
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-display text-[22px] leading-tight">
          {template.id === "custom"
            ? t("create.summary.custom")
            : t("create.summary.means", { name: template.name })}
        </span>
        {changed > 0 && (
          <span className="text-[12.5px] text-muted-foreground" data-testid="template-changed">
            {tn("create.summary.changed", changed)}
          </span>
        )}
      </p>
      {template.id === "custom" ? (
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {t("create.summary.customBody")}
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
  const { t } = useT();
  const options: Array<{ id: AssetSymbol; body: string }> = [
    { id: "AVAX", body: t("create.assetChoice.avax") },
    {
      id: "USDT",
      body: usdtAvailable ? t("create.assetChoice.usdt") : t("create.assetChoice.usdtUnavailable"),
    },
  ];
  return (
    <fieldset className="grid gap-4">
      <legend className="sr-only">{t("create.assetChoice.legend")}</legend>
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
        {t("create.assetChoice.fixed")}
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
