import Link from "next/link";
import type { Address } from "viem";

import { useT } from "@/i18n/react";
import { useCircleAsset } from "@/lib/asset";
import { formatRule, RULE_META, type RuleKey, type RulesParams } from "@/lib/rules";

/** The settings most members ask about, in this order. The full list is in the proposal form. */
const SHOWN: readonly RuleKey[] = [
  "interestBps",
  "reserveBps",
  "maxLoanBps",
  "kMultiplier",
  "exitNoticeDays",
  "exitFeeBps",
  "passPct",
  "dissolvePassPct",
  "ruleChangeDelayDays",
];

/** "Circle rules" on the overview: the current settings in plain words (ADR 0022, 0040). */
export function RulesCard({ circle, rules }: { circle: Address; rules: RulesParams }) {
  const { asset } = useCircleAsset(circle);
  // Re-render on a language switch: labels and values come from the active language.
  const { t } = useT();
  return (
    <section
      aria-labelledby="rules-heading"
      className="grid content-start gap-6 rounded-[14px] border border-border bg-card p-[26px] sm:p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1.5">
          <h3 id="rules-heading" className="text-[15px] font-semibold">
            {t("rules.card.title")}
          </h3>
          <p className="text-[13.5px] text-muted-foreground">{t("rules.card.body")}</p>
        </div>
        <Link
          href={`/app/circle/votes/?id=${circle}`}
          className="text-[13px] font-medium text-brand underline-offset-4 hover:underline"
        >
          {t("rules.card.propose")}
        </Link>
      </div>
      <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2" data-testid="rules-list">
        {SHOWN.map((k) => (
          <div
            key={k}
            className="flex items-baseline justify-between gap-4 border-b border-line-soft pb-3"
          >
            <dt className="text-[13.5px] text-muted-foreground">{RULE_META[k].label}</dt>
            <dd className="font-mono text-[13.5px] tabular">{formatRule(k, rules[k], asset)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
