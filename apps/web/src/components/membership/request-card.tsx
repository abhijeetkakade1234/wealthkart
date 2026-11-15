"use client";

import { circleVaultAbi, shortAddress } from "@wealthkart/sdk";
import { BadgeCheck, Gavel, PauseCircle, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import type { Address } from "viem";
import { useWriteContract } from "wagmi";

import { Deadline } from "@/components/app/deadline";
import { Avatar } from "@/components/art";
import { Button, TxTracker } from "@/components/kit";
import type { JoinRequestView } from "@/lib/circle";
import {
  invitedTooMany,
  inviterStats,
  settledLine,
  tallyLine,
  voteOutcome,
} from "@/lib/membership";
import { notify } from "@/lib/toast";
import { useTx } from "@/lib/use-tx";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * One open request: who, who vouched (join) or proposed (dormant), the tally, the deadline,
 * and what you can do.
 */
export function RequestCard({
  circle,
  request: r,
  quorumPct,
  memberCount,
  chainNow,
  onChanged,
}: {
  circle: Address;
  request: JoinRequestView;
  quorumPct: number;
  /** Members right now, for the "invited more than a third" warning (RT-03). */
  memberCount: number;
  chainNow: number;
  onChanged: () => void;
}) {
  const { writeContractAsync } = useWriteContract();
  const voteTx = useTx();
  const finalizeTx = useTx();
  const dormant = r.kind === "dormant";
  const tally = { eligible: r.eligible, yes: r.yes, no: r.no, quorumPct, kind: r.kind };
  const who = (dormant ? r.accountName : r.displayName) || shortAddress(r.account);
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
        functionName: "vote",
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
        functionName: "finalize",
        args: [r.id],
      }),
    );
    if (receipt) {
      notify.success(
        outcome === "expired"
          ? `Settled: voting time ran out before enough members voted on ${who}.`
          : dormant
            ? outcome === "approved"
              ? `${who} is now dormant. Their payments are paused and their savings stay theirs.`
              : `Settled: the circle chose not to pause ${who}'s payments.`
            : outcome === "approved"
              ? `${who} is now a member.`
              : `Settled: the members didn't vote ${who} in.`,
      );
      onChanged();
    }
  }

  const why = r.hasVoted
    ? "You've voted on this one."
    : ended
      ? "Voting time is over."
      : dormant
        ? "You can't vote on this one: the member it's about can't vote, and only members who were in the circle before it started, and are at most one month behind, can."
        : "You can't vote on this one: only members who joined before the request, and are at most one month behind, can vote.";

  return (
    <article
      className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
      aria-label={dormant ? `Dormant vote about ${who}` : `Join request from ${who}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar address={r.account} size={44} />
          <div className="grid gap-1">
            <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
              {dormant ? "Pause payments" : "Wants to join"}
            </span>
            <h3 className="font-display text-[26px] leading-none tracking-tight">
              {(dormant ? r.accountName : r.displayName) || "No name"}
            </h3>
            <span className="font-mono text-[12px] text-muted-foreground">
              {shortAddress(r.account)}
            </span>
          </div>
        </div>
        <Deadline deadline={r.deadline} chainNow={chainNow} />
      </header>

      <div className="grid gap-2 text-[13.5px]">
        {dormant ? (
          <p className="flex flex-wrap items-start gap-2 text-muted-foreground">
            <PauseCircle
              className="mt-0.5 size-4 shrink-0 text-brand"
              strokeWidth={1.5}
              aria-hidden
            />
            <span>
              <strong className="font-semibold text-foreground">
                {r.inviterName || shortAddress(r.invitedBy)}
              </strong>{" "}
              asks the circle to mark them dormant, maybe because they lost their wallet. Their
              monthly payments and late fees stop. Their savings stay theirs, and paying again
              brings them back.
            </span>
          </p>
        ) : hasInviter ? (
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
        ) : null}
        {!dormant && hasInviter && (
          <p className="text-muted-foreground" data-testid="inviter-stats">
            {inviterStats(r.inviterOpen, r.inviterAdmitted)}
          </p>
        )}
        {!dormant && hasInviter && invitedTooMany(r.inviterAdmitted, memberCount) && (
          <p className="flex items-start gap-2 text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            This member has brought in more than a third of the circle. Make sure each newcomer is
            someone the group knows.
          </p>
        )}
        {!dormant && !hasInviter && (
          <p className="text-muted-foreground">No inviter named. Make sure someone knows them.</p>
        )}
        <p className="tabular" data-testid="tally">
          {tallyLine(tally)}
        </p>
      </div>

      {outcome !== "open" ? (
        <div className="grid gap-3">
          <p className="text-[13.5px] text-muted-foreground">{settledLine(outcome, r.kind)}</p>
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
