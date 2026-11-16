"use client";

import { shortAddress } from "@wealthkart/sdk";
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
import { usePeriodText } from "@/components/loans/parts";
import { useT } from "@/i18n/react";
import type { ProposalView } from "@/lib/gov-hooks";
import {
  type ProposalKind,
  proposalOutcome,
  proposalSettledLine,
  proposalTallyLine,
  proposalTitle,
  reasonLabel,
} from "@/lib/governance";
import { useCircleAsset } from "@/lib/asset";
import { ruleDiff, type RulesParams } from "@/lib/rules";
import { notify } from "@/lib/toast";
import { useVaultAction } from "@/lib/use-vault-action";

import { RuleDiffList } from "./rule-diff-list";
import "@/i18n/en/loans";
import "@/i18n/en/votes";

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
  const { t } = useT();
  const period = usePeriodText();
  const { asset } = useCircleAsset(circle);
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
      notify.success(support ? t("loans.voteYesToast") : t("loans.voteNoToast"));
      onChanged();
    }
  }

  async function settle() {
    const receipt = await settleA.send("finalizeProposal", [p.id]);
    if (receipt) {
      notify.success(
        outcome === "approved"
          ? t("votes.card.settledPassed")
          : outcome === "expired"
            ? t("votes.card.settledExpired")
            : t("votes.card.settledFailed"),
      );
      onChanged();
    }
  }

  async function withdraw() {
    const receipt = await cancelA.send("cancelProposal", [p.id]);
    if (receipt) {
      notify.success(t("votes.card.withdrawnToast"));
      onChanged();
    }
  }

  const why = ended
    ? t("loans.whyEnded")
    : aboutMe
      ? t("votes.card.whyAboutMe")
      : mine && p.kind !== "fee-waiver"
        ? t("votes.card.whyMine")
        : t("loans.whyOther");

  return (
    <article
      className="grid gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
      aria-label={t("votes.card.aria", { title })}
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
              {t("votes.card.by", { name: proposer })}
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
              <RuleDiffList changes={ruleDiff(rules, p.newRules, asset)} />
            ) : (
              <p className="text-muted-foreground">{t("votes.card.loadingChanges")}</p>
            )}
            <p className="text-muted-foreground">
              {t("votes.card.ruleChangeNote", { days: rules?.ruleChangeDelayDays ?? 7 })}
            </p>
          </>
        )}
        {p.kind === "fee-waiver" && (
          <div className="flex flex-wrap items-center gap-4">
            <Avatar address={p.subject} size={36} />
            <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-3">
              <div>
                <dt className="text-[12px] text-muted-foreground">{t("votes.card.member")}</dt>
                <dd className="font-semibold" data-testid="waiver-member">
                  {subject}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">{t("votes.card.month")}</dt>
                <dd className="font-semibold">{period.long(p.period)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">{t("votes.card.reason")}</dt>
                <dd className="font-semibold">{reasonLabel(p.reason)}</dd>
              </div>
            </dl>
            <p className="basis-full text-muted-foreground">
              {t("votes.card.waiverNote", { name: subject })}
            </p>
          </div>
        )}
        {p.kind === "dissolve" && (
          <div className="grid gap-2 rounded-[12px] border border-warn/20 bg-warn-soft px-5 py-4">
            <p className="font-semibold text-foreground">{t("votes.card.dissolveTitle")}</p>
            <p className="text-foreground/80">{t("votes.card.dissolveBody")}</p>
          </div>
        )}
        {p.kind === "guardian-off" && (
          <p className="text-muted-foreground">{t("votes.card.guardianBody")}</p>
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
              workingLabel={t("loans.settling")}
              state={settleA.working ? "working" : undefined}
              onClick={settle}
            >
              {t("loans.settleVote")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {p.canVote ? (
            <>
              <Button
                icon={ThumbsUp}
                workingLabel={t("loans.voting")}
                state={voteA.working ? "working" : undefined}
                onClick={() => vote(true)}
              >
                {t("loans.voteYes")}
              </Button>
              <Button
                variant="secondary"
                icon={ThumbsDown}
                workingLabel={t("loans.voting")}
                state={voteA.working ? "working" : undefined}
                onClick={() => vote(false)}
              >
                {t("loans.voteNo")}
              </Button>
            </>
          ) : (
            <p className="text-[13.5px] text-muted-foreground">{why}</p>
          )}
          {mine && (
            <Button
              variant="ghost"
              icon={Undo2}
              workingLabel={t("loans.withdrawing")}
              state={cancelA.working ? "working" : undefined}
              onClick={withdraw}
            >
              {t("votes.card.withdraw")}
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
