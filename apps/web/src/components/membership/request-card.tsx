"use client";

import { circleVaultAbi, shortAddress } from "@wealthkart/sdk";
import {
  BadgeCheck,
  Gavel,
  LifeBuoy,
  PauseCircle,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import type { Address } from "viem";

import { Deadline } from "@/components/app/deadline";
import { Avatar } from "@/components/art";
import { Button, TxTracker } from "@/components/kit";
import { rich, useT } from "@/i18n/react";
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
import { useBufferedWriteContract } from "@/lib/use-buffered-write";

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * One open request: who, who vouched (join), proposed (dormant) or asks as their backup wallet
 * (claim, ADR 0056), the tally, the deadline, and what you can do.
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
  const { t } = useT();
  const writeContractAsync = useBufferedWriteContract();
  const voteTx = useTx();
  const finalizeTx = useTx();
  const dormant = r.kind === "dormant";
  const claim = r.kind === "claim";
  /** About an existing member (dormant vote or backup-wallet claim), not a newcomer. */
  const aboutMember = dormant || claim;
  const tally = { eligible: r.eligible, yes: r.yes, no: r.no, quorumPct, kind: r.kind };
  const who = (aboutMember ? r.accountName : r.displayName) || shortAddress(r.account);
  const nominee = r.inviterName || shortAddress(r.invitedBy);
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
      notify.success(support ? t("membership.votedYes") : t("membership.votedNo"));
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
          ? t("membership.toastExpired", { who })
          : claim
            ? outcome === "approved"
              ? t("membership.toastClaimApproved", { who })
              : t("membership.toastClaimRejected", { who })
            : dormant
              ? outcome === "approved"
                ? t("membership.toastDormantApproved", { who })
                : t("membership.toastDormantRejected", { who })
              : outcome === "approved"
                ? t("membership.toastJoinApproved", { who })
                : t("membership.toastJoinRejected", { who }),
      );
      onChanged();
    }
  }

  const why = r.hasVoted
    ? t("membership.whyVoted")
    : ended
      ? t("membership.whyOver")
      : claim
        ? t("membership.whyClaim")
        : dormant
          ? t("membership.whyDormant")
          : t("membership.whyJoin");

  return (
    <article
      className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
      aria-label={
        claim
          ? t("membership.ariaClaim", { who })
          : dormant
            ? t("membership.ariaDormant", { who })
            : t("membership.ariaJoin", { who })
      }
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar address={r.account} size={44} />
          <div className="grid gap-1">
            <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
              {claim
                ? t("membership.kindClaim")
                : dormant
                  ? t("membership.pausePayments")
                  : t("membership.kindJoin")}
            </span>
            <h3 className="font-display text-[26px] leading-none tracking-tight">
              {(aboutMember ? r.accountName : r.displayName) || t("membership.noName")}
            </h3>
            <span className="font-mono text-[12px] text-muted-foreground">
              {shortAddress(r.account)}
            </span>
          </div>
        </div>
        <Deadline deadline={r.deadline} chainNow={chainNow} />
      </header>

      <div className="grid gap-2 text-[13.5px]">
        {claim ? (
          <p className="flex items-start gap-2 text-muted-foreground">
            <LifeBuoy className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} aria-hidden />
            <span>
              {rich(t("membership.claimBody", { nominee, who }), {
                b: (c) => <strong className="font-semibold text-foreground">{c}</strong>,
              })}
            </span>
          </p>
        ) : dormant ? (
          <p className="flex flex-wrap items-start gap-2 text-muted-foreground">
            <PauseCircle
              className="mt-0.5 size-4 shrink-0 text-brand"
              strokeWidth={1.5}
              aria-hidden
            />
            <span>
              {rich(
                t("membership.dormantVoteBody", {
                  name: r.inviterName || shortAddress(r.invitedBy),
                }),
                { b: (c) => <strong className="font-semibold text-foreground">{c}</strong> },
              )}
            </span>
          </p>
        ) : hasInviter ? (
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            {rich(t("membership.invitedBy", { name: r.inviterName || shortAddress(r.invitedBy) }), {
              b: (c) => <strong className="font-semibold text-foreground">{c}</strong>,
            })}
            {r.inviterConfirmed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-good-soft px-2.5 py-0.5 text-[12px] text-good">
                <BadgeCheck className="size-3.5" strokeWidth={1.5} aria-hidden />
                {t("membership.confirmed")}
              </span>
            ) : (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[12px]">
                {t("membership.notConfirmed")}
              </span>
            )}
          </p>
        ) : null}
        {!aboutMember && hasInviter && (
          <p className="text-muted-foreground" data-testid="inviter-stats">
            {inviterStats(r.inviterOpen, r.inviterAdmitted)}
          </p>
        )}
        {!aboutMember && hasInviter && invitedTooMany(r.inviterAdmitted, memberCount) && (
          <p className="flex items-start gap-2 text-warn">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            {t("membership.tooManyInvited")}
          </p>
        )}
        {!aboutMember && !hasInviter && (
          <p className="text-muted-foreground">{t("membership.noInviter")}</p>
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
              workingLabel={t("membership.settling")}
              state={finalizing ? "working" : undefined}
              onClick={finalize}
            >
              {t("membership.settle")}
            </Button>
          </div>
        </div>
      ) : r.canVote ? (
        <div className="flex flex-wrap gap-3">
          <Button
            icon={ThumbsUp}
            workingLabel={t("membership.voting")}
            state={voting ? "working" : undefined}
            onClick={() => vote(true)}
          >
            {t("membership.voteYes")}
          </Button>
          <Button
            variant="secondary"
            icon={ThumbsDown}
            workingLabel={t("membership.voting")}
            state={voting ? "working" : undefined}
            onClick={() => vote(false)}
          >
            {t("membership.voteNo")}
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
