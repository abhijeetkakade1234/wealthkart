"use client";

import { shortAddress } from "@wealthkart/sdk";
import { periodOf } from "@wealthkart/rules";
import { Landmark, Plus, ReceiptText, ScrollText, ShieldOff, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { Address } from "viem";

import { TxFor } from "@/components/app/tx-for";
import { Button, InlineAlert } from "@/components/kit";
import { usePeriodText } from "@/components/loans/parts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/react";
import type { PlainKey } from "@/i18n/types";
import { type CircleAsset, useCircleAsset } from "@/lib/asset";
import { useMemberOptions } from "@/lib/gov-hooks";
import { type ProposalKind, proposalTitle, WAIVER_REASONS, waiverMonths } from "@/lib/governance";
import {
  RULE_KEYS,
  RULE_META,
  type RuleKey,
  type RulesForm,
  type RulesParams,
  ruleDiff,
  rulesFromForm,
  rulesToForm,
} from "@/lib/rules";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useVaultAction } from "@/lib/use-vault-action";

import { RuleDiffList } from "./rule-diff-list";
import "@/i18n/en/loans";
import "@/i18n/en/votes";

const KINDS: Array<{ kind: ProposalKind; icon: LucideIcon; short: PlainKey }> = [
  { kind: "rule-change", icon: ScrollText, short: "votes.dialog.shortRules" },
  { kind: "fee-waiver", icon: ReceiptText, short: "votes.dialog.shortWaiver" },
  { kind: "dissolve", icon: Landmark, short: "votes.dialog.shortClose" },
  { kind: "guardian-off", icon: ShieldOff, short: "votes.dialog.shortGuardian" },
];

const GROUPS: Array<{ group: "loans" | "voting" | "leaving"; title: PlainKey }> = [
  { group: "leaving", title: "votes.dialog.groupLeaving" },
  { group: "voting", title: "votes.dialog.groupVoting" },
  { group: "loans", title: "votes.dialog.groupLoans" },
];

const inputCls =
  "h-11 w-full rounded-[10px] border border-border bg-background px-3.5 text-[14px] tabular outline-none transition focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20 aria-[invalid=true]:border-bad";

/**
 * "New proposal": one dialog, four kinds (ADR 0040). The rule-change form is checked against
 * the same bounds as `Rules.validate` before anything is sent.
 */
export function NewProposalButton({
  circle,
  rules,
  installment,
  guardianDisabled,
  chainNow,
  me,
  onCreated,
}: {
  circle: Address;
  rules: RulesParams;
  installment: bigint;
  guardianDisabled: boolean;
  chainNow: number;
  me: Address | undefined;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ProposalKind>("rule-change");
  const action = useVaultAction(circle);
  const { t } = useT();
  const { asset } = useCircleAsset(circle);

  function done(message: string) {
    setOpen(false);
    action.tx.reset();
    notify.success(message);
    onCreated();
  }

  return (
    <>
      <Button
        icon={Plus}
        onClick={() => {
          action.tx.reset();
          setOpen(true);
        }}
      >
        {t("votes.dialog.newProposal")}
      </Button>
      <Dialog open={open} onOpenChange={(v) => !action.working && setOpen(v)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t("votes.dialog.newProposal")}</DialogTitle>
            <DialogDescription>{t("votes.dialog.description")}</DialogDescription>
          </DialogHeader>

          <div
            role="tablist"
            aria-label={t("votes.dialog.kindAria")}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                role="tab"
                aria-selected={kind === k.kind}
                onClick={() => {
                  action.tx.reset();
                  setKind(k.kind);
                }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-[10px] border px-3 py-2.5 text-[13px] transition",
                  kind === k.kind
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-secondary",
                )}
              >
                <k.icon className="size-4" strokeWidth={1.5} aria-hidden />
                {t(k.short)}
              </button>
            ))}
          </div>

          <div role="tabpanel" aria-label={proposalTitle(kind)} className="grid gap-6 pt-2">
            {kind === "rule-change" && (
              <RuleChangeForm
                asset={asset}
                rules={rules}
                installment={installment}
                working={action.working}
                onSubmit={async (next) => {
                  const r = await action.send("proposeRuleChange", [next]);
                  if (r) done(t("votes.dialog.sentRules"));
                }}
              />
            )}
            {kind === "fee-waiver" && (
              <FeeWaiverForm
                circle={circle}
                chainNow={chainNow}
                me={me}
                working={action.working}
                onSubmit={async (member, period, reason) => {
                  const r = await action.send("proposeFeeWaiver", [member, BigInt(period), reason]);
                  if (r) done(t("votes.dialog.sentWaiver"));
                }}
              />
            )}
            {kind === "dissolve" && (
              <div className="grid gap-5">
                <InlineAlert tone="warn" icon={Landmark} title={t("votes.dialog.closingTitle")}>
                  {t("votes.dialog.closingBody", { pct: rules.dissolvePassPct })}
                </InlineAlert>
                <div>
                  <Button
                    variant="danger"
                    icon={Landmark}
                    workingLabel={t("loans.sending")}
                    state={action.working ? "working" : undefined}
                    onClick={async () => {
                      const r = await action.send("proposeDissolve");
                      if (r) done(t("votes.dialog.sentDissolve"));
                    }}
                  >
                    {t("votes.dialog.proposeClose")}
                  </Button>
                </div>
              </div>
            )}
            {kind === "guardian-off" && (
              <div className="grid gap-5">
                <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                  {t("votes.dialog.guardianExplain")}
                </p>
                <div>
                  <Button
                    icon={ShieldOff}
                    workingLabel={t("loans.sending")}
                    state={action.working ? "working" : undefined}
                    disabled={guardianDisabled}
                    disabledReason={t("votes.dialog.guardianAlreadyOff")}
                    onClick={async () => {
                      const r = await action.send("proposeGuardianOff");
                      if (r) done(t("votes.dialog.sentGuardian"));
                    }}
                  >
                    {t("votes.dialog.proposeGuardianOff")}
                  </Button>
                </div>
              </div>
            )}
            <TxFor tx={action.tx} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RuleChangeForm({
  asset,
  rules,
  installment,
  working,
  onSubmit,
}: {
  asset: CircleAsset;
  rules: RulesParams;
  installment: bigint;
  working: boolean;
  onSubmit: (next: RulesParams) => void;
}) {
  const { t } = useT();
  const [form, setForm] = useState<RulesForm>(() => rulesToForm(rules, asset));
  const parsed = useMemo(() => rulesFromForm(form, installment, asset), [form, installment, asset]);
  const changes = parsed.params ? ruleDiff(rules, parsed.params, asset) : [];
  const set = (k: RuleKey, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      className="grid gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed.params && changes.length > 0) onSubmit(parsed.params);
      }}
    >
      {GROUPS.map((g) => (
        <fieldset key={g.group} className="grid gap-5">
          <legend className="mb-4 text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
            {t(g.title)}
          </legend>
          <div className="grid gap-5 sm:grid-cols-2">
            {RULE_KEYS.filter((k) => RULE_META[k].group === g.group).map((k) => {
              const meta = RULE_META[k];
              const id = `rule-${k}`;
              const error = parsed.errors[k];
              if (meta.unit === "bool") {
                return (
                  <label
                    key={k}
                    htmlFor={id}
                    className="flex items-start gap-3 text-[13.5px] sm:col-span-2"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--brand)]"
                      checked={form[k] === "true"}
                      onChange={(e) => set(k, String(e.target.checked))}
                    />
                    <span className="grid gap-0.5">
                      <span>{meta.label}</span>
                      <span className="text-[12px] text-muted-foreground">{meta.hint}</span>
                    </span>
                  </label>
                );
              }
              return (
                <div key={k} className="grid content-start gap-1.5">
                  <label htmlFor={id} className="text-[13px] font-medium">
                    {meta.label}
                    {meta.unit === "avax" ? ` (${asset.symbol})` : ""}
                  </label>
                  <input
                    id={id}
                    inputMode="decimal"
                    className={inputCls}
                    value={form[k]}
                    aria-invalid={Boolean(error)}
                    aria-describedby={`${id}-hint`}
                    onChange={(e) => set(k, e.target.value)}
                  />
                  <span
                    id={`${id}-hint`}
                    className={cn("text-[12px]", error ? "text-bad" : "text-muted-foreground")}
                  >
                    {error ?? meta.hint}
                  </span>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="grid gap-3">
        <h4 className="text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
          {t("votes.dialog.whatChanges")}
        </h4>
        {parsed.params ? (
          <RuleDiffList changes={changes} />
        ) : (
          <p className="text-[13.5px] text-bad">{t("votes.dialog.fixFirstSentence")}</p>
        )}
      </div>
      <div>
        <Button
          type="submit"
          icon={ScrollText}
          workingLabel={t("loans.sending")}
          state={working ? "working" : undefined}
          disabled={!parsed.params || changes.length === 0}
          disabledReason={!parsed.params ? t("votes.dialog.fixFirst") : t("votes.dialog.changeOne")}
        >
          {t("votes.dialog.proposeRules")}
        </Button>
      </div>
    </form>
  );
}

function FeeWaiverForm({
  circle,
  chainNow,
  me,
  working,
  onSubmit,
}: {
  circle: Address;
  chainNow: number;
  me: Address | undefined;
  working: boolean;
  onSubmit: (member: Address, period: number, reason: number) => void;
}) {
  const m = useMemberOptions(circle);
  const { t } = useT();
  const periods = usePeriodText();
  const current = periodOf(chainNow);
  const behind = m.options.filter((o) => o.nextPeriod <= current);
  const [member, setMember] = useState<string>("");
  const [period, setPeriod] = useState<string>("");
  const [reason, setReason] = useState<string>("0");
  const chosen = behind.find((o) => o.address === member) ?? behind[0];
  const months = chosen ? waiverMonths(chosen.nextPeriod, current) : [];
  const month = months.includes(Number(period)) ? Number(period) : months[0];

  if (m.isPending) {
    return (
      <p className="text-[13.5px] text-muted-foreground">{t("votes.dialog.loadingMembers")}</p>
    );
  }
  if (behind.length === 0) {
    return <p className="text-[13.5px] text-muted-foreground">{t("votes.dialog.everyonePaid")}</p>;
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (chosen && month !== undefined) onSubmit(chosen.address, month, Number(reason));
      }}
    >
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        {t("votes.dialog.waiverIntro")}
      </p>
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="grid content-start gap-1.5">
          <label htmlFor="waiver-member" className="text-[13px] font-medium">
            {t("votes.card.member")}
          </label>
          <select
            id="waiver-member"
            className={inputCls}
            value={chosen?.address ?? ""}
            onChange={(e) => setMember(e.target.value)}
          >
            {behind.map((o) => (
              <option key={o.address} value={o.address}>
                {me && o.address.toLowerCase() === me.toLowerCase()
                  ? t("votes.dialog.memberYou", { name: o.name || shortAddress(o.address) })
                  : o.name || shortAddress(o.address)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor="waiver-month" className="text-[13px] font-medium">
            {t("votes.card.month")}
          </label>
          <select
            id="waiver-month"
            className={inputCls}
            value={month ?? ""}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {months.map((p) => (
              <option key={p} value={p}>
                {periods.long(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor="waiver-reason" className="text-[13px] font-medium">
            {t("votes.card.reason")}
          </label>
          <select
            id="waiver-reason"
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {WAIVER_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.label)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">{t("votes.dialog.reasonNote")}</p>
      <div>
        <Button
          type="submit"
          icon={ReceiptText}
          workingLabel={t("loans.sending")}
          state={working ? "working" : undefined}
        >
          {t("votes.dialog.proposeWaiver")}
        </Button>
      </div>
    </form>
  );
}
