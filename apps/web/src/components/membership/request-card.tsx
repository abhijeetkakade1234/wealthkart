"use client";

import { circleVaultAbi, shortAddress } from "@wealthkart/sdk";
import { BadgeCheck, Gavel, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Address } from "viem";
import { useWriteContract } from "wagmi";

import { Deadline } from "@/components/app/deadline";
import { Avatar } from "@/components/art";
import { Button, TxTracker } from "@/components/kit";
import type { JoinRequestView } from "@/lib/circle";
import { settledLine, tallyLine, voteOutcome } from "@/lib/membership";
import { notify } from "@/lib/toast";
import { useTx } from "@/lib/use-tx";

const ZERO = "0x0000000000000000000000000000000000000000";

/** One open join request: who, who vouched, the tally, the deadline, and what you can do. */
export function RequestCard({
  circle,
  request: r,
  quorumPct,
  chainNow,
  onChanged,
}: {
  circle: Address;
  request: JoinRequestView;
  quorumPct: number;
  chainNow: number;
  onChanged: () => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const voteTx = useTx();
  const finalizeTx = useTx();
  const tally = { eligible: r.eligible, yes: r.yes, no: r.no, quorumPct };
  const ended = chainNow > r.deadline;
  const outcome = voteOutcome(tally, ended);
  const voting = voteTx.status === "confirm" || voteTx.status === "sending";
  const finalizing = finalizeTx.status === "confirm" || finalizeTx.status === "sending";
  const hasInviter = r.invitedBy.toLowerCase() !== ZERO;

  async function vote(support: boolean) {
    const receipt = await voteTx.run(() =>
      writeContractAsync({
        abi: circleVaultAbi,
        address: circle,
        functionName: "voteOnJoin",
        args: [r.id, support],
      }),
    );
    if (receipt) {
      notify.success(support ? "Vote counted: yes." : "Vote counted: no.");
      onChanged();
    }
  }

  async function finalize() {
    const receipt = await finalizeTx.run(() =>
      writeContractAsync({
        abi: circleVaultAbi,
        address: circle,
        functionName: "finalizeJoin",
        args: [r.id],
      }),
    );
    if (receipt) {
      const name = r.displayName || "The request";
      notify.success(
        outcome === "approved"
          ? `${name} is now a member.`
          : outcome === "expired"
            ? `Settled: voting time ran out before enough members voted for ${name}.`
            : `Settled: the members didn't vote ${name} in.`,
      );
      onChanged();
    }
  }

  const why = r.hasVoted
    ? "You've voted on this one."
    : ended
      ? "Voting time is over."
      : "You can't vote on this one: only members who joined before the request, and are at most one month behind, can vote.";

  return (
    <article
      className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
      aria-label={`Join request from ${r.displayName || shortAddress(r.applicant)}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar address={r.applicant} size={44} />
          <div className="grid gap-1">
            <h3 className="font-display text-[26px] leading-none tracking-tight">
              {r.displayName || "No name"}
            </h3>
            <span className="font-mono text-[12px] text-muted-foreground">
              {shortAddress(r.applicant)}
            </span>
          </div>
        </div>
        <Deadline deadline={r.deadline} chainNow={chainNow} />
      </header>

      <div className="grid gap-2 text-[13.5px]">
        {hasInviter ? (
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            Says they were invited by{" "}
            <strong className="font-semibold text-foreground">
              {r.inviterName || shortAddress(r.invitedBy)}
            </strong>
            {r.inviterConfirmed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2.5 py-0.5 text-[12px] text-good">
                <BadgeCheck className="size-3.5" strokeWidth={1.5} aria-hidden />
                Confirmed
              </span>
            ) : (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[12px]">
                Not confirmed yet
              </span>
            )}
          </p>
        ) : (
          <p className="text-muted-foreground">No inviter named. Make sure someone knows them.</p>
        )}
        <p className="tabular" data-testid="tally">
          {tallyLine(tally)}
        </p>
      </div>

      {outcome !== "open" ? (
        <div className="grid gap-3">
          <p className="text-[13.5px] text-muted-foreground">{settledLine(outcome)}</p>
          <div>
            <Button
              icon={Gavel}
              workingLabel="Settling…"
              state={finalizing ? "working" : undefined}
              onClick={finalize}
            >
              Settle the vote
            </Button>
          </div>
        </div>
      ) : r.canVote ? (
        <div className="flex flex-wrap gap-3">
          <Button
            icon={ThumbsUp}
            workingLabel="Voting…"
            state={voting ? "working" : undefined}
            onClick={() => vote(true)}
          >
            Vote yes
          </Button>
          <Button
            variant="secondary"
            icon={ThumbsDown}
            workingLabel="Voting…"
            state={voting ? "working" : undefined}
            onClick={() => vote(false)}
          >
            Vote no
          </Button>
        </div>
      ) : (
        <p className="text-[13.5px] text-muted-foreground">{why}</p>
      )}

      {voteTx.status !== "idle" && (
        <TxTracker
          status={voteTx.status}
          failedAt={voteTx.failedAt}
          failedMessage={voteTx.failedMessage}
          explorerUrl={voteTx.explorerUrl}
        />
      )}
      {finalizeTx.status !== "idle" && (
        <TxTracker
          status={finalizeTx.status}
          failedAt={finalizeTx.failedAt}
          failedMessage={finalizeTx.failedMessage}
          explorerUrl={finalizeTx.explorerUrl}
        />
      )}
    </article>
  );
}
