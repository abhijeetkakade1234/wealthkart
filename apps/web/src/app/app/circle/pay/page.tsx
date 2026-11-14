"use client";

import { circleVaultAbi, formatAvax, periodLabel } from "@wealthkart/sdk";
import { CalendarClock, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useBalance, useWriteContract } from "wagmi";

import { CountdownUTC } from "@/components/app/countdown-utc";
import { PageHeader } from "@/components/app/page-header";
import { Button, InlineAlert, StateView, TxTracker } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireWallet } from "@/components/wallet/require-wallet";
import { useCoreWallet } from "@/components/wallet/use-core-wallet";
import { parseCircleId, useCircle } from "@/lib/circle";
import { messages } from "@/lib/messages";
import { notify } from "@/lib/toast";
import { useTx } from "@/lib/use-tx";

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
  const { writeContractAsync } = useWriteContract();
  const payTx = useTx();
  const holidayTx = useTx();

  if (!id || c.notFound) {
    return (
      <StateView
        state="empty"
        message="We couldn't find this circle. Check the link, or make sure your wallet is on the right network."
        action={{ label: "Go to your circles", onAction: () => router.push("/app/") }}
      />
    );
  }
  if (c.isPending || !c.data) {
    return (
      <StateView
        state="loading"
        label="Loading what you owe"
        skeleton={<Skeleton className="h-64 max-w-[640px] rounded-[14px]" />}
      />
    );
  }
  if (c.isError) return <StateView state="error" onRetry={() => c.refetch()} />;

  const d = c.data;
  if (!d.isMember) return <StateView state="access" reason="not-member" />;

  const due = d.due;
  const month = due ? periodLabel(due.period) : "";

  async function pay() {
    if (!id || !due) return;
    const receipt = await payTx.run(() =>
      writeContractAsync({
        abi: circleVaultAbi,
        address: id,
        functionName: "contribute",
        value: due.amount,
      }),
    );
    if (receipt) {
      notify.paid(month, formatAvax(due.amount));
      void c.refetch();
      void balance.refetch();
    }
  }

  async function holiday() {
    if (!id) return;
    const receipt = await holidayTx.run(() =>
      writeContractAsync({ abi: circleVaultAbi, address: id, functionName: "declareHoliday" }),
    );
    if (receipt) {
      notify.success(
        `Payment holiday taken for ${month}. No late fee until next month's due date.`,
      );
      void c.refetch();
    }
  }

  const needed = due ? due.amount + FEE_BUFFER_WEI : 0n;
  const tooPoor = balance.data !== undefined && due?.payable && balance.data.value < needed;
  const paying = payTx.status === "confirm" || payTx.status === "sending";

  return (
    <div className="max-w-[640px]">
      <PageHeader title="Pay" subtitle={d.name} />

      {!due?.payable ? (
        <StateView
          state="empty"
          message={`You're all paid up. Your next installment is for ${due ? periodLabel(due.period) : "next month"}.`}
          action={{ label: "Back to circle", onAction: () => router.push(`/app/circle/?id=${id}`) }}
        />
      ) : (
        <div className="grid gap-8">
          <div className="grid gap-5 rounded-[14px] border border-[#f1e2c4] bg-warn-soft p-8">
            <span className="text-[13px] text-muted-foreground">Installment for {month}</span>
            <span className="font-display text-[56px] leading-none tracking-tight tabular">
              {formatAvax(due.amount)}
              <small className="ml-2 font-sans text-[15px] text-muted-foreground">AVAX</small>
            </span>
            <CountdownUTC period={Number(due.period)} dueDay={d.dueDay} />
            {due.fees > 0n && (
              <p className="text-[13.5px] text-warn">
                Includes {formatAvax(due.fees)} AVAX in late fees. Fees go into the circle, so every
                member shares them.
              </p>
            )}
          </div>

          {tooPoor && (
            <InlineAlert tone="bad">
              {messages.insufficientAvax({
                needed: formatAvax(needed),
                amount: formatAvax(due.amount),
                fee: formatAvax(FEE_BUFFER_WEI),
              })}
            </InlineAlert>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              icon={Send}
              workingLabel="Paying…"
              state={paying ? "working" : undefined}
              onClick={pay}
              disabled={Boolean(tooPoor)}
              disabledReason="Add AVAX to your wallet first"
            >
              Pay {formatAvax(due.amount)} AVAX
            </Button>
            {due.fees === 0n && d.holidaysPerYear > 0 && (
              <Button
                size="lg"
                variant="secondary"
                icon={CalendarClock}
                workingLabel="Saving…"
                state={
                  holidayTx.status === "confirm" || holidayTx.status === "sending"
                    ? "working"
                    : undefined
                }
                onClick={holiday}
              >
                Need more time this month
              </Button>
            )}
          </div>

          {payTx.status !== "idle" && (
            <TxTracker
              status={payTx.status}
              failedAt={payTx.failedAt}
              failedMessage={payTx.failedMessage}
              explorerUrl={payTx.explorerUrl}
            />
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
