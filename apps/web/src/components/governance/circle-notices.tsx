"use client";

import { CalendarClock, HandCoins, Landmark } from "lucide-react";
import type { Address } from "viem";

import { Deadline } from "@/components/app/deadline";
import { TxFor } from "@/components/app/tx-for";
import { Button, InlineAlert } from "@/components/kit";
import { useT } from "@/i18n/react";
import { fmt, useCircleAsset } from "@/lib/asset";
import type { CircleGov } from "@/lib/gov-hooks";
import { messages } from "@/lib/messages";
import { ruleDiff } from "@/lib/rules";
import { notify } from "@/lib/toast";
import { useVaultAction } from "@/lib/use-vault-action";

import { RuleDiffList } from "./rule-diff-list";
import "@/i18n/en/votes";

const DATE: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
};

/**
 * A passed rule change waiting to apply (ADR 0019, 0040): what changes, when, the no-notice
 * exit window until then, and "Apply new rules" once the date has come.
 */
export function RuleChangeBanner({
  circle,
  gov,
  chainNow,
  onChanged,
}: {
  circle: Address;
  gov: CircleGov;
  chainNow: number;
  onChanged: () => void;
}) {
  const apply = useVaultAction(circle);
  const { t, formatDate } = useT();
  const { asset } = useCircleAsset(circle);
  if (!gov.pendingRules || gov.pendingAt === 0 || !gov.rules) return null;
  const due = chainNow >= gov.pendingAt;
  const changes = ruleDiff(gov.rules, gov.pendingRules, asset);

  async function applyNow() {
    const receipt = await apply.send("applyRuleChange");
    if (receipt) {
      notify.success(t("votes.ruleChange.appliedToast"));
      onChanged();
    }
  }

  return (
    <div
      className="grid gap-5 rounded-[14px] border border-brand/15 bg-brand-soft px-6 py-6 sm:px-8"
      data-testid="rule-change-banner"
    >
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-3.5">
          <CalendarClock
            className="mt-1 size-[18px] shrink-0 text-brand"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="grid gap-1.5">
            <p className="text-[15px] font-semibold">
              {due
                ? t("votes.ruleChange.readyTitle")
                : t("votes.ruleChange.applyOn", {
                    date: formatDate(new Date(gov.pendingAt * 1000), DATE),
                  })}
            </p>
            <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-foreground/80">
              {due ? t("votes.ruleChange.readyBody") : t("votes.ruleChange.waitBody")}
            </p>
            <Deadline
              deadline={gov.pendingAt}
              chainNow={chainNow}
              prefix={t("votes.ruleChange.starts")}
              pastText={t("votes.ruleChange.readyNow")}
            />
          </div>
        </div>
        {due && (
          <Button
            icon={CalendarClock}
            workingLabel={t("votes.ruleChange.applying")}
            state={apply.working ? "working" : undefined}
            onClick={applyNow}
          >
            {t("votes.ruleChange.apply")}
          </Button>
        )}
      </div>
      <div className="bg-card rounded-[12px]">
        <RuleDiffList changes={changes} />
      </div>
      <TxFor tx={apply.tx} />
    </div>
  );
}

/**
 * The circle voted to close (ADR 0021, 0040). Each member claims their share once no loans are
 * out; until then the button is disabled with a plain reason.
 */
export function DissolvedNotice({
  circle,
  gov,
  isMember,
  share,
  onChanged,
}: {
  circle: Address;
  gov: CircleGov;
  isMember: boolean;
  /** This member's share at today's value (stakeOf). */
  share: bigint;
  onChanged: () => void;
}) {
  const claim = useVaultAction(circle);
  const { t } = useT();
  const { asset } = useCircleAsset(circle);
  if (!gov.dissolved) return null;
  // Claims pay your share of the cash now; while loans are out, claim again as they're repaid
  // (ADR 0043). Members tied to a loan or frozen wait until it's repaid or settled.
  const blocked = gov.frozen || gov.loanTies > 0 ? messages.claimBlockedByLoan() : undefined;
  const partial = gov.loansOutstanding > 0n;

  async function claimShare() {
    const value = share;
    const receipt = await claim.send("claimDissolution");
    if (receipt) {
      notify.success(
        t("votes.dissolved.claimedToast", { amount: fmt(value, asset), symbol: asset.symbol }),
      );
      onChanged();
    }
  }

  return (
    <div className="grid gap-4" data-testid="dissolved-notice">
      <InlineAlert
        tone="warn"
        icon={Landmark}
        title={t("votes.dissolved.title")}
        action={
          isMember ? (
            <Button
              icon={HandCoins}
              workingLabel={t("votes.dissolved.claiming")}
              state={claim.working ? "working" : undefined}
              onClick={claimShare}
              disabled={Boolean(blocked)}
              disabledReason={blocked}
            >
              {t("votes.dissolved.claim")}
            </Button>
          ) : undefined
        }
      >
        {`${t("votes.dissolved.stopped")} ${
          isMember
            ? blocked
              ? t("votes.dissolved.blocked", { reason: blocked })
              : partial
                ? t("votes.dissolved.partial", { amount: fmt(share, asset), symbol: asset.symbol })
                : t("votes.dissolved.full", { amount: fmt(share, asset), symbol: asset.symbol })
            : t("votes.dissolved.nonMember")
        }`}
      </InlineAlert>
      <TxFor tx={claim.tx} />
    </div>
  );
}
