"use client";

import { circleFactoryAbi } from "@wealthkart/sdk";
import { Lock, Sparkles } from "lucide-react";
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
  ASSET_DEFAULTS,
  DEFAULTS,
  type FormState,
  MAX_MAX_MEMBERS,
  MIN_MAX_MEMBERS,
  validate,
} from "@/lib/circle-form";
import { cn } from "@/lib/utils";
import { useTx } from "@/lib/use-tx";
import { useBufferedWriteContract } from "@/lib/use-buffered-write";

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
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [touched, setTouched] = useState(false);
  const v = useMemo(() => validate(form, address), [form, address]);
  const set =
    (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = (k: keyof FormState) => (touched ? v.errors[k] : undefined);
  const unit = form.asset;

  /** Switching asset swaps in that asset's example amounts unless the creator typed their own. */
  function pickAsset(next: AssetSymbol) {
    setForm((f) => {
      if (f.asset === next) return f;
      const old = ASSET_DEFAULTS[f.asset];
      const fresh = ASSET_DEFAULTS[next];
      return {
        ...f,
        asset: next,
        installment: f.installment === old.installment ? fresh.installment : f.installment,
        fee1: f.fee1 === old.fee1 ? fresh.fee1 : f.fee1,
        fee2: f.fee2 === old.fee2 ? fresh.fee2 : f.fee2,
      };
    });
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
        <Section title="The basics">
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

        <Section title="Money the circle holds">
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

        <Section title="Monthly installment">
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

        <Section title="Members">
          <Field
            label="Most members the circle can have"
            hint={`${MIN_MAX_MEMBERS} to ${MAX_MAX_MEMBERS}. It can't be raised later.`}
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
          {
            "This runs on the Fuji test network, so use test money only. A circle's money and member limit can't be changed after it's created."
          }
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
