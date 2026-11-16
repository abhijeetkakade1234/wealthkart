"use client";

import { periodLabel, shortAddress } from "@wealthkart/sdk";
import {
  Gavel,
  Landmark,
  ReceiptText,
  ScrollText,
  ShieldOff,
  ThumbsDown,
  ThumbsUp,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { Address } from "viem";

import { Deadline } from "@/components/app/deadline";
import { TxFor } from "@/components/app/tx-for";
import { Avatar } from "@/components/art";
import { Button } from "@/components/kit";
import type { ProposalView } from "@/lib/gov-hooks";
import {
  type ProposalKind,
  proposalOutcome,
  proposalSettledLine,
  proposalTallyLine,
  proposalTitle,
  reasonLabel,
} from "@/lib/governance";
import { ruleDiff, type RulesParams } from "@/lib/rules";
import { notify } from "@/lib/toast";
import { useVaultAction } from "@/lib/use-vault-action";

import { RuleDiffList } from "./rule-diff-list";

const ICONS: Record<ProposalKind, LucideIcon> = {
  "rule-change": ScrollText,
  "fee-waiver": ReceiptText,
  dissolve: Landmark,
  "guardian-off": ShieldOff,
};

/** One open circle proposal on the Votes page: what it does, the tally, and what you can do. */
export function ProposalCard({
  circle,
  proposal: p,
  quorumPct,
  chainNow,
  rules,
  me,
  onChanged,
}: {
  circle: Address;
  proposal: ProposalView;
  quorumPct: number;
  chainNow: number;
  /** Current rules, for the before/after list of a rule change. */
  rules: RulesParams | null;
  me: Address | undefined;
  onChanged: () => void;
}) {
  const voteA = useVaultAction(circle);
  const settleA = useVaultAction(circle);
  const cancelA = useVaultAction(circle);
  const tally = { eligible: p.eligible, yes: p.yes, no: p.no, passPct: p.passPct, quorumPct };
  const ended = chainNow > p.deadline;
  const outcome = proposalOutcome(tally, ended);
  const Icon = ICONS[p.kind];
  const mine = Boolean(me && me.toLowerCase() === p.proposer.toLowerCase());
  const aboutMe = Boolean(
    me && p.kind === "fee-waiver" && me.toLowerCase() === p.subject.toLowerCase(),
  );
  const proposer = p.proposerName || shortAddress(p.proposer);
  const subject = p.subjectName || shortAddress(p.subject);
  const title = proposalTitle(p.kind);

  async function vote(support: boolean) {
    const receipt = await voteA.send("voteProposal", [p.id, support]);
    if (receipt) {
      notify.success(support ? "Vote counted: yes." : "Vote counted: no.");
      onChanged();
    }
  }

  async function settle() {
    const receipt = await settleA.send("finalizeProposal", [p.id]);
    if (receipt) {
      notify.success(
        outcome === "approved"
          ? "Settled: the proposal passed."
          : outcome === "expired"
            ? "Settled: voting time ran out before enough members voted."
            : "Settled: the proposal didn't pass.",
      );
      onChanged();
    }
  }

  async function withdraw() {
    const receipt = await cancelA.send("cancelProposal", [p.id]);
    if (receipt) {
      notify.success("Proposal withdrawn.");
      onChanged();
    }
  }

  const why = ended
    ? "Voting time is over."
    : aboutMe
      ? "This one is about you, so you can't vote on it."
      : mine && p.kind !== "fee-waiver"
        ? "Your yes was counted when you proposed it."
        : "You've voted on this one, or you can't vote on it: only members who could vote when it started, and are up to date, can.";

  return (
    <article
      className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
      aria-label={`Proposal: ${title}`}
      data-kind={p.kind}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span
            className={`grid size-11 place-items-center rounded-full ${p.kind === "dissolve" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand"}`}
          >
            <Icon className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="grid gap-1">
            <span className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
              Proposal by {proposer}
            </span>
            <h3 className="font-display text-[26px] leading-none tracking-tight">{title}</h3>
          </div>
        </div>
        <Deadline deadline={p.deadline} chainNow={chainNow} />
      </header>

      <div className="grid gap-4 text-[13.5px] leading-relaxed">
        {p.kind === "rule-change" && (
          <>
            {rules && p.newRules ? (
              <RuleDiffList changes={ruleDiff(rules, p.newRules)} />
            ) : (
              <p className="text-muted-foreground">Loading the changes…</p>
            )}
            <p className="text-muted-foreground">
              If it passes, the new rules wait {rules?.ruleChangeDelayDays ?? 7} days and then start
              on the 1st of the next month. Anyone who asks to leave before then is out under
              today&apos;s rules.
            </p>
          </>
        )}
        {p.kind === "fee-waiver" && (
          <div className="flex flex-wrap items-center gap-4">
            <Avatar address={p.subject} size={36} />
            <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-3">
              <div>
                <dt className="text-[12px] text-muted-foreground">Member</dt>
                <dd className="font-semibold" data-testid="waiver-member">
                  {subject}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">Month</dt>
                <dd className="font-semibold">{periodLabel(p.period)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">Reason</dt>
                <dd className="font-semibold">{reasonLabel(p.reason)}</dd>
              </div>
            </dl>
            <p className="basis-full text-muted-foreground">
              If it passes, the late fees for that month are cancelled and {subject} pays only the
              installment. The member it&apos;s about can&apos;t vote.
            </p>
          </div>
        )}
        {p.kind === "dissolve" && (
          <div className="grid gap-2 rounded-[12px] border border-warn/20 bg-warn-soft px-5 py-4">
            <p className="font-semibold text-foreground">This closes the circle for good.</p>
            <p className="text-foreground/80">
              If it passes, payments stop at once and no new loans start. Each member then claims
              their share at its value on the day, as soon as every loan is repaid. Talk it over
              with the group before you vote.
            </p>
          </div>
        )}
        {p.kind === "guardian-off" && (
          <p className="text-muted-foreground">
            If it passes, the circle&apos;s creator can no longer pause new members and loans, and
            any pause running now ends. This can&apos;t be undone.
          </p>
        )}
        <p className="tabular" data-testid="tally">
          {proposalTallyLine(tally)}
        </p>
      </div>

      {outcome !== "open" ? (
        <div className="grid gap-3">
          <p className="text-[13.5px] text-muted-foreground">{proposalSettledLine(outcome)}</p>
          <div>
            <Button
              icon={Gavel}
              workingLabel="Settling…"
              state={settleA.working ? "working" : undefined}
              onClick={settle}
            >
              Settle the vote
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {p.canVote ? (
            <>
              <Button
                icon={ThumbsUp}
                workingLabel="Voting…"
                state={voteA.working ? "working" : undefined}
                onClick={() => vote(true)}
              >
                Vote yes
              </Button>
              <Button
                variant="secondary"
                icon={ThumbsDown}
                workingLabel="Voting…"
                state={voteA.working ? "working" : undefined}
                onClick={() => vote(false)}
              >
                Vote no
              </Button>
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">{why}</p>
          )}
          {mine && (
            <Button
              variant="ghost"
              icon={Undo2}
              workingLabel="Withdrawing…"
              state={cancelA.working ? "working" : undefined}
              onClick={withdraw}
            >
              Withdraw proposal
            </Button>
          )}
        </div>
      )}

      <TxFor tx={voteA.tx} />
      <TxFor tx={settleA.tx} />
      <TxFor tx={cancelA.tx} />
    </article>
  );
}
