"use client";

import { circleVaultAbi } from "@wealthkart/sdk";
import { PauseCircle, Sunrise } from "lucide-react";
import Link from "next/link";
import type { Address } from "viem";

import { Button, InlineAlert, TxTracker } from "@/components/kit";
import { rich, useT } from "@/i18n/react";
import { notify } from "@/lib/toast";
import { useTx } from "@/lib/use-tx";
import { useBufferedWriteContract } from "@/lib/use-buffered-write";
import "@/i18n/en/membership";

/**
 * Shown to a member the circle voted dormant (ADR 0032). Their savings are untouched; waking
 * restarts payments from this month (or next, if this month's due moment has passed).
 * Paying from the Pay page also wakes them (RT-11).
 */
export function DormantNotice({ circle, onWoke }: { circle: Address; onWoke: () => void }) {
  const { t } = useT();
  const writeContractAsync = useBufferedWriteContract();
  const tx = useTx();
  const working = tx.status === "confirm" || tx.status === "sending";

  async function wake() {
    const receipt = await tx.run(() =>
      writeContractAsync({ abi: circleVaultAbi, address: circle, functionName: "wake" }),
    );
    if (receipt) {
      notify.success(t("membership.wokeToast"));
      onWoke();
    }
  }

  return (
    <div className="grid gap-4">
      <InlineAlert
        tone="warn"
        icon={PauseCircle}
        title={t("membership.pausedTitle")}
        action={
          <Button
            icon={Sunrise}
            workingLabel={t("membership.waking")}
            state={working ? "working" : undefined}
            onClick={wake}
          >
            {t("membership.imBack")}
          </Button>
        }
      >
        {rich(t("membership.dormantBody"), {
          link: (c) => (
            <Link
              href={`/app/circle/pay/?id=${circle}`}
              className="font-semibold underline underline-offset-4"
            >
              {c}
            </Link>
          ),
        })}
      </InlineAlert>
      {tx.status !== "idle" && (
        <TxTracker
          status={tx.status}
          failedAt={tx.failedAt}
          failedMessage={tx.failedMessage}
          explorerUrl={tx.explorerUrl}
        />
      )}
    </div>
  );
}

/**
 * Members-table action: ask the circle to mark `member` dormant. Shown only once they have
 * missed `dormantAfter` months and no vote about them is open. The proposer's yes counts.
 */
export function ProposeDormantButton({
  circle,
  member,
  name,
  onProposed,
}: {
  circle: Address;
  member: Address;
  name: string;
  onProposed: () => void;
}) {
  const { t } = useT();
  const writeContractAsync = useBufferedWriteContract();
  const tx = useTx();
  const working = tx.status === "confirm" || tx.status === "sending";

  async function propose() {
    const receipt = await tx.run(() =>
      writeContractAsync({
        abi: circleVaultAbi,
        address: circle,
        functionName: "proposeDormant",
        args: [member],
      }),
    );
    if (receipt) {
      notify.success(t("membership.proposedToast"));
      onProposed();
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      icon={PauseCircle}
      workingLabel={t("membership.starting")}
      state={working ? "working" : undefined}
      onClick={propose}
      aria-label={t("membership.pauseAria", { name })}
    >
      {t("membership.pausePayments")}
    </Button>
  );
}
