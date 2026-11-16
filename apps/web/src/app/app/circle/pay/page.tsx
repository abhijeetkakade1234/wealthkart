"use client";

import { circleVaultAbi, formatAvax } from "@wealthkart/sdk";
import { CalendarClock, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useBalance, usePublicClient } from "wagmi";

import { AssetBadge, PayButton, PayProgress } from "@/components/app/asset-pay";

import { CountdownUTC } from "@/components/app/countdown-utc";
import { CircleNotFound } from "@/components/app/circle-not-found";
import { PageHeader } from "@/components/app/page-header";
import { TestUsdtFaucet } from "@/components/app/test-usdt-faucet";
import { CirclePauseBanner } from "@/components/exits/pause";
import { Button, InlineAlert, StateView, TxTracker } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { useT } from "@/i18n/react";
import { fmt, isToken, useTokenBalance } from "@/lib/asset";
import { monthLabel, parseCircleId, useCircle } from "@/lib/circle";
import { messages } from "@/lib/messages";
import { notify } from "@/lib/toast";
import { useAssetPayment } from "@/lib/use-asset-payment";
import { useTx } from "@/lib/use-tx";
import { useBufferedWriteContract } from "@/lib/use-buffered-write";
import "@/i18n/en/pay";

/** Rough upper bound for the network fee shown in the "not enough AVAX" check. */
const FEE_BUFFER_WEI = 10n ** 16n; // 0.01 AVAX

export default function PayPage() {
  return (
    <RequireWallet>
      <Suspense fallback={null}>
        <Pay />
      </Suspense>
    </RequireWallet>
  );
}

function Pay() {
  const router = useRouter();
  const id = parseCircleId(useSearchParams().get("id"));
  const { address } = useCoreWallet();
  const c = useCircle(id);
  const balance = useBalance({ address });
  const writeContractAsync = useBufferedWriteContract();
  const client = usePublicClient();
  const payment = useAssetPayment(id);
  const asset = payment.asset;
  const token = useTokenBalance(asset, address);
  const holidayTx = useTx();
  const { t } = useT();

  if (!id || c.notFound) return <CircleNotFound notACircle={c.notACircle} />;
  if (c.isPending || !c.data || payment.assetPending) {
    return (
      <StateView
        state="loading"
        label={t("pay.loading")}
        skeleton={<Skeleton className="h-64 max-w-[640px] rounded-[14px]" />}
      />
    );
  }
  if (c.isError) return <StateView state="error" onRetry={() => c.refetch()} />;

  const d = c.data;
  if (!d.isMember) return <StateView state="access" reason="not-member" />;

  const due = d.due;
  const month = due ? monthLabel(due.period) : "";

  /** Re-read right before paying (and again before a second approve): a late fee may have started. */
  async function amountNow(): Promise<bigint> {
    if (!id || !address || !client) return due?.amount ?? 0n;
    const [, amount] = await client.readContract({
      abi: circleVaultAbi,
      address: id,
      functionName: "amountDue",
      args: [address],
    });
    return amount;
  }

  /**
   * USDT: approve the installment plus both late fees (each capped at half the installment on
   * chain), so a due day passing between approve and pay doesn't fail the payment.
   */
  async function installmentCeiling(amount: bigint): Promise<bigint> {
    if (!id || !client) return amount;
    const vault = { abi: circleVaultAbi, address: id } as const;
    const [installment, fee1, fee2] = await Promise.all([
      client.readContract({ ...vault, functionName: "installment" }),
      client.readContract({ ...vault, functionName: "fee1" }),
      client.readContract({ ...vault, functionName: "fee2" }),
    ]);
    const ceiling = BigInt(installment) + BigInt(fee1) + BigInt(fee2);
    return ceiling > amount ? ceiling : amount;
  }

  async function pay() {
    if (!id || !due) return;
    const r = await payment.pay({
      fn: "contribute",
      amount: amountNow,
      approveCeiling: installmentCeiling,
    });
    if (r) {
      notify.paid(month, fmt(r.amount, asset), asset.symbol);
      void c.refetch();
      void balance.refetch();
      void token.refetch();
    }
  }

  async function holiday() {
    if (!id) return;
    const receipt = await holidayTx.run(() =>
      writeContractAsync({ abi: circleVaultAbi, address: id, functionName: "declareHoliday" }),
    );
    if (receipt) {
      notify.success(t("pay.holidayTaken", { month }));
      void c.refetch();
    }
  }

  // AVAX circles: the installment and the fee both come out of AVAX. USDT circles: the
  // installment comes out of USDT and only the network fee out of AVAX (ADR 0046).
  const needed = due ? (isToken(asset) ? 0n : due.amount) + FEE_BUFFER_WEI : 0n;
  const tooPoorAvax = balance.data !== undefined && due?.payable && balance.data.value < needed;
  const tooPoorToken =
    isToken(asset) && token.balance !== undefined && due?.payable && token.balance < due.amount;
  const tooPoor = tooPoorAvax || tooPoorToken;

  return (
    <div className="max-w-[640px]">
      <PageHeader
        title={t("pay.title")}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2.5">
            {d.name}
            <AssetBadge asset={asset} />
          </span>
        }
      />
      <CirclePauseBanner circle={id} />

      {!due?.payable ? (
        <StateView
          state="empty"
          message={due ? t("pay.allPaid", { month: monthLabel(due.period) }) : t("pay.allPaidNext")}
          action={{
            label: t("pay.backToCircle"),
            onAction: () => router.push(`/app/circle/?id=${id}`),
          }}
        />
      ) : (
        <div className="grid gap-8">
          {d.iAmDormant && (
            <InlineAlert tone="info" title={t("pay.dormantTitle")}>
              {t("pay.dormantBody", { month })}
            </InlineAlert>
          )}
          <div className="grid gap-5 rounded-[14px] border border-[#f1e2c4] bg-warn-soft p-8">
            <span className="text-[13px] text-muted-foreground">
              {t("pay.installmentFor", { month })}
            </span>
            <span
              className="font-display text-[56px] leading-none tracking-tight tabular"
              data-testid="pay-amount"
            >
              {fmt(due.amount, asset)}
              <small className="ml-2 font-sans text-[15px] text-muted-foreground">
                {asset.symbol}
              </small>
            </span>
            <CountdownUTC period={Number(due.period)} dueDay={d.dueDay} />
            {due.fees > 0n && (
              <p className="text-[13.5px] text-warn">
                {t("pay.includesFees", { amount: fmt(due.fees, asset), symbol: asset.symbol })}
              </p>
            )}
          </div>

          {tooPoorToken && token.balance !== undefined && (
            <InlineAlert tone="bad">
              {messages.notEnoughToken({
                needed: fmt(due.amount, asset),
                have: fmt(token.balance, asset),
                symbol: asset.symbol,
              })}
            </InlineAlert>
          )}
          {tooPoorAvax &&
            (isToken(asset) ? (
              <InlineAlert tone="bad">
                {messages.needGasAvax(formatAvax(FEE_BUFFER_WEI))}
              </InlineAlert>
            ) : (
              <InlineAlert tone="bad">
                {messages.insufficientAvax({
                  needed: formatAvax(needed),
                  amount: formatAvax(due.amount),
                  fee: formatAvax(FEE_BUFFER_WEI),
                })}
              </InlineAlert>
            ))}
          {isToken(asset) && <TestUsdtFaucet onMinted={() => void token.refetch()} />}
          {isToken(asset) && !tooPoor && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {t("pay.usdtSteps")}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <PayButton
              size="lg"
              icon={Send}
              payment={payment}
              amount={due.amount}
              label={t("pay.payVerb")}
              onClick={pay}
              disabled={Boolean(tooPoor)}
              disabledReason={
                tooPoorToken
                  ? t("pay.addTokenFirst", { symbol: asset.symbol })
                  : t("pay.addAvaxFirst")
              }
            />
            {due.fees === 0n && d.holidaysPerYear > 0 && (
              <Button
                size="lg"
                variant="secondary"
                icon={CalendarClock}
                workingLabel={t("pay.saving")}
                state={
                  holidayTx.status === "confirm" || holidayTx.status === "sending"
                    ? "working"
                    : undefined
                }
                onClick={holiday}
              >
                {t("pay.needMoreTime")}
              </Button>
            )}
          </div>

          {(isToken(asset) || payment.payTx.status !== "idle") && (
            <PayProgress payment={payment} amount={due.amount} />
          )}
          {holidayTx.status !== "idle" && (
            <TxTracker
              status={holidayTx.status}
              failedAt={holidayTx.failedAt}
              failedMessage={holidayTx.failedMessage}
              explorerUrl={holidayTx.explorerUrl}
            />
          )}
        </div>
      )}
    </div>
  );
}
