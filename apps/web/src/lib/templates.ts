import { getLocale, t, tn } from "@/i18n/runtime";
import { type AssetSymbol, parseAmount } from "@/lib/asset";
import { DEFAULTS, formAsset, type FormState } from "@/lib/circle-form";
import { formatBps } from "@/lib/rules";

/**
 * Circle templates (ADR 0054): starting points for the create form. A template only fills
 * in the form's existing fields; every value stays editable and is checked by the same
 * `validate` the form uses (unit test S-TPL-01), so each one sits inside the on-chain bounds
 * (ADR 0022). Asset and member cap stay the creator's choice; a template only suggests a cap.
 *
 * Edit the numbers here. Amounts are per asset because AVAX and USDT have different sizes.
 */

export type TemplateId = "friends" | "family" | "office" | "custom";

/** Fields a template sets. Name, asset and founders are never touched. */
export type TemplateFields = Omit<FormState, "name" | "asset" | "founders">;

export interface CircleTemplate {
  id: TemplateId;
  name: string;
  /** One line on the card. */
  blurb: string;
  /** Values per asset (amounts differ; everything else is the same for both). */
  values: Record<AssetSymbol, TemplateFields>;
}

type Shared = Omit<TemplateFields, "installment" | "fee1" | "fee2">;

function both(
  shared: Shared,
  amounts: Record<AssetSymbol, Pick<FormState, "installment" | "fee1" | "fee2">>,
): Record<AssetSymbol, TemplateFields> {
  return {
    AVAX: { ...shared, ...amounts.AVAX },
    USDT: { ...shared, ...amounts.USDT },
  };
}

/** Today's defaults (G1's rules), which is also where Custom starts. */
const FRIENDS: Shared = {
  maxMembers: "12",
  dueDay: "10",
  secondFeeDay: "20",
  holidays: "3",
  dormantAfter: "3",
  minPaidToVote: "2",
  quorumPct: "50",
  passPct: "50",
  interestPct: "1",
  kMultiplier: "2",
  guarantorRequired: "false",
  exitNoticeDays: "30",
};

const FRIENDS_AMOUNTS = {
  AVAX: { installment: "0.5", fee1: "0.01", fee2: "0.01" },
  USDT: { installment: "50", fee1: "1", fee2: "1" },
};

export const TEMPLATES: readonly CircleTemplate[] = [
  {
    id: "friends",
    get name() {
      return t("create.tpl.friends");
    },
    get blurb() {
      return t("create.tpl.friendsBlurb");
    },
    values: both(FRIENDS, FRIENDS_AMOUNTS),
  },
  {
    id: "family",
    get name() {
      return t("create.tpl.family");
    },
    get blurb() {
      return t("create.tpl.familyBlurb");
    },
    values: both(
      {
        maxMembers: "10",
        dueDay: "10",
        secondFeeDay: "25",
        holidays: "6",
        dormantAfter: "6",
        minPaidToVote: "1",
        quorumPct: "50",
        passPct: "50",
        interestPct: "0.5",
        kMultiplier: "3",
        guarantorRequired: "false",
        exitNoticeDays: "60",
      },
      {
        AVAX: { installment: "0.25", fee1: "0.0025", fee2: "0.0025" },
        USDT: { installment: "25", fee1: "0.25", fee2: "0.25" },
      },
    ),
  },
  {
    id: "office",
    get name() {
      return t("create.tpl.office");
    },
    get blurb() {
      return t("create.tpl.officeBlurb");
    },
    values: both(
      {
        maxMembers: "20",
        dueDay: "5",
        secondFeeDay: "15",
        holidays: "2",
        dormantAfter: "2",
        minPaidToVote: "3",
        quorumPct: "66",
        passPct: "60",
        interestPct: "1.5",
        kMultiplier: "1",
        guarantorRequired: "true",
        exitNoticeDays: "30",
      },
      {
        AVAX: { installment: "1", fee1: "0.04", fee2: "0.04" },
        USDT: { installment: "100", fee1: "4", fee2: "4" },
      },
    ),
  },
  {
    id: "custom",
    get name() {
      return t("create.tpl.custom");
    },
    get blurb() {
      return t("create.tpl.customBlurb");
    },
    values: both(FRIENDS, FRIENDS_AMOUNTS),
  },
];

export const DEFAULT_TEMPLATE: TemplateId = "friends";

export function templateById(id: string | null | undefined): CircleTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * The form with a template applied. Name, founders and asset stay as they are. The member
 * cap is a suggestion: it's only replaced while it still holds the previous template's
 * suggestion (or the default), so a cap the creator typed is kept.
 */
export function applyTemplate(
  form: FormState,
  next: CircleTemplate,
  previous?: CircleTemplate,
): FormState {
  const values = next.values[form.asset];
  const oldCap = previous?.values[form.asset].maxMembers ?? DEFAULTS.maxMembers;
  const keepCap = form.maxMembers !== oldCap;
  return {
    ...form,
    ...values,
    maxMembers: keepCap ? form.maxMembers : values.maxMembers,
  };
}

/**
 * Switching asset swaps each amount to the template's amount for the new asset, unless the
 * creator typed their own.
 */
export function switchAsset(form: FormState, next: AssetSymbol, t: CircleTemplate): FormState {
  if (form.asset === next) return form;
  const old = t.values[form.asset];
  const fresh = t.values[next];
  const pick = (k: "installment" | "fee1" | "fee2") => (form[k] === old[k] ? fresh[k] : form[k]);
  return {
    ...form,
    asset: next,
    installment: pick("installment"),
    fee1: pick("fee1"),
    fee2: pick("fee2"),
  };
}

/** How many of the template's fields the creator has changed (for "Family, 1 change"). */
export function changedFromTemplate(form: FormState, t: CircleTemplate): number {
  const values = t.values[form.asset];
  return (Object.keys(values) as (keyof TemplateFields)[]).filter(
    (k) => form[k].trim() !== values[k],
  ).length;
}

/** "the 10th", "the 1st", "the 22nd". */
export function ordinal(n: number): string {
  const last = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th";
  return `the ${String(n)}${suffix}`;
}

/** Fee as a share of the installment, e.g. "2%", or "" if it can't be worked out. */
function feeShare(fee: string, installment: string, symbol: AssetSymbol): string {
  const asset = formAsset(symbol);
  const f = parseAmount(fee, asset);
  const i = parseAmount(installment, asset);
  if (f === null || i === null || i === 0n) return "";
  return formatBps(Number((f * 10_000n) / i));
}

/** What a template means, in a few plain sentences (shown under the template cards). */
export function templateSummary(tpl: CircleTemplate, symbol: AssetSymbol): string[] {
  const v = tpl.values[symbol];
  const fee1Share = feeShare(v.fee1, v.installment, symbol);
  const sameFees = v.fee1 === v.fee2;
  const k = Number(v.kMultiplier);
  const quorum = Number(v.quorumPct);
  const pass = Number(v.passPct);
  const dueDay = Number(v.dueDay);
  const share = fee1Share ? t("create.tpl.feeShare", { share: fee1Share }) : "";
  return [
    t("create.tpl.amount", {
      amount: v.installment,
      symbol,
      // "the 10th" in English; Hindi and Marathi write the plain number before "तारीख".
      due: getLocale() === "en" ? ordinal(dueDay) : String(dueDay),
    }),
    sameFees
      ? t("create.tpl.feeSame", { fee: v.fee1, symbol, share, day: v.secondFeeDay })
      : t("create.tpl.feeThen", {
          fee: v.fee1,
          symbol,
          share,
          fee2: v.fee2,
          day: v.secondFeeDay,
        }),
    tn("create.tpl.holidays", Number(v.holidays)),
    t("create.tpl.loans", {
      rate: v.interestPct,
      limit: k === 1 ? t("create.tpl.limitSavings") : t("create.tpl.limitTimes", { k }),
      guarantor:
        v.guarantorRequired === "true"
          ? t("create.tpl.guarantorNeeded")
          : t("create.tpl.guarantorOptional"),
    }),
    t("create.tpl.votes", {
      quorum: quorum === 50 ? t("create.tpl.quorumHalf") : t("create.tpl.pct", { pct: quorum }),
      pass:
        pass === 50 ? t("create.tpl.passMoreThanHalf") : t("create.tpl.passAtLeast", { pct: pass }),
    }),
    t("create.tpl.notice", {
      days: tn("create.tpl.noticeDays", Number(v.exitNoticeDays)),
      payments: tn("create.tpl.payments", Number(v.minPaidToVote)),
    }),
    t("create.tpl.size", { max: v.maxMembers }),
  ];
}
