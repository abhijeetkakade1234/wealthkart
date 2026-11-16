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
    name: "Friends",
    blurb: "The usual rules. Small late fees, loans up to twice your savings.",
    values: both(FRIENDS, FRIENDS_AMOUNTS),
  },
  {
    id: "family",
    name: "Family",
    blurb: "Gentler. Tiny late fees, more payment holidays, a longer notice to leave.",
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
    name: "Office",
    blurb: "Stricter, for colleagues. Every loan needs a guarantor and more people must vote.",
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
    name: "Custom",
    blurb: "Start from the usual rules and set every field yourself.",
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

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** What a template means, in a few plain sentences (shown under the template cards). */
export function templateSummary(t: CircleTemplate, symbol: AssetSymbol): string[] {
  const v = t.values[symbol];
  const fee1Share = feeShare(v.fee1, v.installment, symbol);
  const sameFees = v.fee1 === v.fee2;
  const k = Number(v.kMultiplier);
  const quorum = Number(v.quorumPct);
  const pass = Number(v.passPct);
  return [
    `Suggested monthly amount: ${v.installment} ${symbol}, due by ${ordinal(Number(v.dueDay))} of each month.`,
    `Late fee after the due day: ${v.fee1} ${symbol}${fee1Share ? ` (${fee1Share} of the monthly amount)` : ""}, ${
      sameFees ? "and the same again" : `then ${v.fee2} ${symbol}`
    } after day ${v.secondFeeDay}.`,
    `${plural(Number(v.holidays), "payment holiday", "payment holidays")} a year, to pay a month late with no fee.`,
    `Loans at ${v.interestPct}% a month, up to ${k === 1 ? "your savings" : `${String(k)} times your savings`} plus your guarantor's. ${
      v.guarantorRequired === "true" ? "Every loan needs a guarantor." : "A guarantor is optional."
    }`,
    `A vote counts once at least ${quorum === 50 ? "half" : `${String(quorum)}%`} of the voters take part. Loans and rule changes pass with ${
      pass === 50 ? "more than half" : `at least ${String(pass)}%`
    } saying yes.`,
    `${plural(Number(v.exitNoticeDays), "day's", "days'")} notice to leave. New members vote after ${plural(
      Number(v.minPaidToVote),
      "payment",
      "payments",
    )}.`,
    `Suggested size: up to ${v.maxMembers} members.`,
  ];
}
