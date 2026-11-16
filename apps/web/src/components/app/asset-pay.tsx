"use client";

import { Check, CircleDollarSign, LoaderCircle, X, type LucideIcon } from "lucide-react";

import { TxFor } from "@/components/app/tx-for";
import { Button } from "@/components/kit";
import { useT } from "@/i18n/react";
import { type CircleAsset, fmtSmall, isToken } from "@/lib/asset";
import type { AssetPayment, StepStatus } from "@/lib/use-asset-payment";
import { cn } from "@/lib/utils";
import "@/i18n/en/pay";

/**
 * Small pill naming the circle's money ("AVAX" / "USDT"), for circle headers and cards
 * (ADR 0046). Neutral: the asset is a fact about the circle, not a status.
 */
export function AssetBadge({ asset, className }: { asset: CircleAsset; className?: string }) {
  const { t } = useT();
  return (
    <span
      data-testid="asset-badge"
      title={asset.symbol === "USDT" ? t("pay.badgeUsdt") : t("pay.badgeAvax")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-[11.5px] tracking-wide text-muted-foreground",
        className,
      )}
    >
      {asset.symbol}
    </span>
  );
}

/**
 * The pay button for any money going into a circle. AVAX: one step. USDT: the label follows the
 * step (approve, then pay) and a two-row step list under it shows where the payment is, so
 * the member knows to expect two wallet prompts.
 */
export function PayButton({
  payment,
  amount,
  label,
  icon = CircleDollarSign,
  size,
  variant,
  disabled,
  disabledReason,
  onClick,
  testId,
  kind,
}: {
  payment: AssetPayment;
  /** The amount shown on the button (the exact amount is re-read when paying). */
  amount: bigint;
  /** Verb for the pay step, e.g. "Pay", "Pay interest", "Repay". */
  label: string;
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
  testId?: string;
  /** "repay" shows "Repaying…" while it works; also inferred from an English "Repay" label. */
  kind?: "pay" | "repay";
}) {
  const { t } = useT();
  const a = payment.asset;
  const shown = `${fmtSmall(amount, a)} ${a.symbol}`;
  const working = payment.working;
  const workingLabel =
    isToken(a) && payment.step === "approve"
      ? t("pay.approving")
      : kind === "repay" || label === "Repay"
        ? t("pay.repaying")
        : t("pay.paying");
  return (
    <Button
      size={size}
      variant={variant}
      icon={icon}
      workingLabel={workingLabel}
      state={working ? "working" : undefined}
      disabled={disabled || payment.assetPending}
      disabledReason={disabledReason}
      onClick={onClick}
      data-testid={testId}
    >
      {amount > 0n ? t("pay.buttonWithAmount", { label, amount: shown }) : label}
    </Button>
  );
}

/**
 * Where a payment is. USDT: "1 Approve · 2 Pay" with each step's state, then the tracker of the
 * transaction in flight. AVAX: just the tracker.
 */
export function PayProgress({ payment, amount }: { payment: AssetPayment; amount: bigint }) {
  const { t } = useT();
  const a = payment.asset;
  if (!isToken(a)) return <TxFor tx={payment.payTx} />;
  const shown = `${fmtSmall(amount, a)} ${a.symbol}`;
  const approveShown =
    payment.approving !== null ? `${fmtSmall(payment.approving, a)} ${a.symbol}` : shown;
  return (
    <div className="grid gap-4">
      <ol
        aria-label={t("pay.steps")}
        className="grid gap-2.5 rounded-[12px] border border-border bg-card px-5 py-4"
      >
        <StepRow
          n={1}
          status={payment.approveStatus}
          title={t("pay.approveUpTo", { amount: approveShown })}
          hint={t("pay.approveHint")}
          testId="step-approve"
        />
        <StepRow
          n={2}
          status={payment.payStatus}
          title={t("pay.payAmount", { amount: shown })}
          hint={t("pay.payHint")}
          testId="step-pay"
        />
      </ol>
      <TxFor tx={payment.tx} />
    </div>
  );
}

function StepRow({
  n,
  status,
  title,
  hint,
  testId,
}: {
  n: number;
  status: StepStatus;
  title: string;
  hint: string;
  testId: string;
}) {
  const { t } = useT();
  return (
    <li className="flex items-start gap-3.5 py-1" data-testid={testId} data-status={status}>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[12px] tabular",
          status === "done" && "border-good bg-good-soft text-good",
          status === "failed" && "border-bad bg-bad-soft text-bad",
          status === "working" && "border-brand bg-brand-soft text-brand",
          status === "upcoming" && "border-border text-muted-foreground",
        )}
      >
        {status === "done" ? (
          <Check className="size-3.5" strokeWidth={2} />
        ) : status === "failed" ? (
          <X className="size-3.5" strokeWidth={2} />
        ) : status === "working" ? (
          <LoaderCircle
            className="size-3.5 animate-spin motion-reduce:animate-none"
            strokeWidth={2}
          />
        ) : (
          n
        )}
      </span>
      <span className="grid gap-0.5">
        <span className="text-[14px] font-medium">
          {title}
          <span className="sr-only">: {t(`pay.status.${status}`)}</span>
        </span>
        <span className="text-[12.5px] text-muted-foreground">{hint}</span>
      </span>
    </li>
  );
}
