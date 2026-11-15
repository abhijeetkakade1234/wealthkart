"use client";

import { circleVaultAbi } from "@wealthkart/sdk";
import { PauseCircle, Sunrise } from "lucide-react";
import Link from "next/link";
import type { Address } from "viem";
import { useWriteContract } from "wagmi";

import { Button, InlineAlert, TxTracker } from "@/components/kit";
import { notify } from "@/lib/toast";
import { useTx } from "@/lib/use-tx";

/**
 * Shown to a member the circle voted dormant (ADR 0032). Their savings are untouched; waking
 * restarts payments from this month (or next, if this month's due moment has passed).
 * Paying from the Pay page also wakes them (RT-11).
 */
export function DormantNotice({ circle, onWoke }: { circle: Address; onWoke: () => void }) {
  const { writeContractAsync } = useWriteContract();
  const tx = useTx();
  const working = tx.status === "confirm" || tx.status === "sending";

  async function wake() {
    const receipt = await tx.run(() =>
      writeContractAsync({ abi: circleVaultAbi, address: circle, functionName: "wake" }),
    );
    if (receipt) {
      notify.success("Welcome back. Your payments start again from the next due date.");
      onWoke();
    }
  }

  return (
    <div className="grid gap-4">
      <InlineAlert
        tone="warn"
        icon={PauseCircle}
        title="Your payments are paused"
        action={
          <Button
            icon={Sunrise}
            workingLabel="Waking up…"
            state={working ? "working" : undefined}
            onClick={wake}
          >
            I&apos;m back
          </Button>
        }
      >
        The circle marked you dormant after several missed months. Nothing is owed while you&apos;re
        dormant, and your savings are still yours. Tap &quot;I&apos;m back&quot; to start paying
        again, or{" "}
        <Link
          href={`/app/circle/pay/?id=${circle}`}
          className="font-semibold underline underline-offset-4"
        >
          pay this month
        </Link>{" "}
        to come back straight away.
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
  const { writeContractAsync } = useWriteContract();
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
      notify.success(`Vote started. Your yes is counted. The others can vote on Votes.`);
      onProposed();
    }
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      icon={PauseCircle}
      workingLabel="Starting…"
      state={working ? "working" : undefined}
      onClick={propose}
      aria-label={`Ask the circle to pause ${name}'s payments`}
    >
      Pause payments
    </Button>
  );
}
