"use client";

import { circleFactoryAbi, formatAvax } from "@wealthkart/sdk";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { parseEventLogs } from "viem";
import { useWriteContract } from "wagmi";

import { PageHeader } from "@/components/app/page-header";
import { Button, InlineAlert, TxTracker } from "@/components/kit";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { useFactory } from "@/lib/circle";
import { DEFAULTS, type FormState, validate } from "@/lib/circle-form";
import { useTx } from "@/lib/use-tx";

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
  const { writeContractAsync } = useWriteContract();
  const tx = useTx();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [touched, setTouched] = useState(false);
  const v = useMemo(() => validate(form, address), [form, address]);
  const set =
    (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = (k: keyof FormState) => (touched ? v.errors[k] : undefined);

  async function create() {
    setTouched(true);
    if (!v.ok || !v.cfg || !factory) return;
    const cfg = v.cfg;
    const receipt = await tx.run(() =>
      writeContractAsync({
        abi: circleFactoryAbi,
        address: factory,
        functionName: "createCircle",
        args: [cfg, v.founders],
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
            hint="Shown to members. It's public on the blockchain, so don't use personal details."
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

        <Section title="Monthly installment">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Amount each month (AVAX)" error={err("installment")}>
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
            <Field label="Late fee after the due day (AVAX)" error={err("fee1")}>
              <input
                id="fee1"
                className={inputCls}
                inputMode="decimal"
                value={form.fee1}
                onChange={set("fee1")}
              />
            </Field>
            <Field label="Second late fee (AVAX)" error={err("fee2")}>
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
          </div>
        </Section>

        <Section title="Members">
          <Field
            label="Friends' wallet addresses"
            hint="One per line. You're added automatically. Only add people who agreed to join."
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
            {v.cfg ? formatAvax(v.cfg.installment) : "–"} AVAX a month
          </p>
        </Section>

        <InlineAlert tone="info">
          {
            "This runs on the Fuji test network. Circles can't be changed after they're created, and this version doesn't support loans or leaving yet, so use test AVAX only."
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
