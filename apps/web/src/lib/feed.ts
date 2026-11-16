import { shortAddress } from "@wealthkart/sdk";

import { t } from "@/i18n/runtime";
import type { PlainKey } from "@/i18n/types";
import { periodName } from "@/lib/analytics";
import { AVAX, type CircleAsset, fmt, money } from "@/lib/asset";

import type { DecodedLog } from "@/lib/events";
import "@/i18n/en/activity";

/**
 * Activity feed (PLAN.md D7): every circle event as one plain sentence, newest first, with
 * its transaction for the Snowtrace link. Pure, so it is unit tested; the page adds names,
 * times and paging.
 */

export type FeedKind = "payment" | "member" | "vote" | "loan";

export interface FeedItem {
  id: string;
  kind: FeedKind;
  event: string;
  /** Addresses mentioned, first one is who did it; used for names and search. */
  people: string[];
  block: bigint;
  logIndex: number;
  tx: string;
  /** Builds the sentence once display names are known. */
  text: (name: (address: string) => string) => string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** LoanBook.Status order. */
const LOAN_STATUS = [
  "none",
  "open",
  "approved",
  "rejected",
  "expired",
  "cancelled",
  "failed",
] as const;

/** Membership.Status order. */
const STATUS = ["none", "open", "approved", "rejected", "expired", "cancelled", "full"] as const;

const STATUS_KEY: Record<(typeof STATUS)[number], PlainKey> = {
  none: "activity.statusNone",
  open: "activity.statusOpen",
  approved: "activity.statusApproved",
  rejected: "activity.statusRejected",
  expired: "activity.statusExpired",
  cancelled: "activity.statusCancelled",
  full: "activity.statusFull",
};

const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v as bigint);

/** Turns decoded vault logs into feed items, newest first. Unknown events are skipped. */
export function toFeed(logs: readonly DecodedLog[], asset: CircleAsset = AVAX): FeedItem[] {
  // Small loan amounts (interest) keep four decimals so they don't read as 0.00.
  const amt = (units: bigint) => money(units, asset);
  // Request id -> who it is about, so "closed" lines can say who got in or was paused.
  const requests = new Map<number, { kind: "join" | "dormant"; account: string; name: string }>();
  // Loan request id -> borrower and kind, so loan votes and results can say whose loan it is.
  const loanRequests = new Map<number, { settle: boolean; borrower: string; amount: bigint }>();
  const items: FeedItem[] = [];

  const ordered = [...logs].sort((a, b) => {
    const ab = a.blockNumber ?? 0n;
    const bb = b.blockNumber ?? 0n;
    return ab === bb ? (a.logIndex ?? 0) - (b.logIndex ?? 0) : ab < bb ? -1 : 1;
  });

  for (const l of ordered) {
    const a = l.args;
    const base = {
      id: `${l.transactionHash ?? ""}-${l.logIndex ?? 0}`,
      event: l.eventName,
      block: l.blockNumber ?? 0n,
      logIndex: l.logIndex ?? 0,
      tx: l.transactionHash ?? "",
    };
    const push = (kind: FeedKind, people: string[], text: FeedItem["text"]) =>
      items.push({ ...base, kind, people, text });

    switch (l.eventName) {
      case "Contributed": {
        const fees = a.lateFees as bigint;
        const m = str(a.member);
        push("payment", [m], (n) => {
          const p = {
            name: n(m),
            month: periodName(num(a.period)),
            amount: fmt(a.installment as bigint, asset),
            symbol: asset.symbol,
          };
          return fees > 0n
            ? t("activity.paidLate", { ...p, fees: fmt(fees, asset) })
            : t("activity.paidOnTime", p);
        });
        break;
      }
      case "HolidayDeclared": {
        const m = str(a.member);
        push("payment", [m], (n) =>
          t("activity.holiday", { name: n(m), month: periodName(num(a.period)) }),
        );
        break;
      }
      case "MemberAdded": {
        const m = str(a.member);
        push("member", [m], (n) => t("activity.joined", { name: n(m) }));
        break;
      }
      case "FounderInvited": {
        const m = str(a.account);
        push("member", [m], (n) => t("activity.founderInvited", { name: n(m) }));
        break;
      }
      case "FounderInviteDeclined": {
        const m = str(a.account);
        push("member", [m], (n) => t("activity.founderDeclined", { name: n(m) }));
        break;
      }
      case "DisplayNameSet": {
        const m = str(a.member);
        const name = str(a.displayName);
        push("member", [m], () => t("activity.renamed", { address: shortAddress(m), name }));
        break;
      }
      case "VotingRightsGranted": {
        const m = str(a.member);
        push("member", [m], (n) => t("activity.canVote", { name: n(m) }));
        break;
      }
      case "MemberDormant": {
        const m = str(a.member);
        push("member", [m], (n) => t("activity.dormant", { name: n(m) }));
        break;
      }
      case "MemberWoke": {
        const m = str(a.member);
        push("member", [m], (n) => t("activity.woke", { name: n(m) }));
        break;
      }
      case "JoinRequested": {
        const m = str(a.applicant);
        const name = str(a.displayName);
        const by = str(a.invitedBy);
        requests.set(num(a.requestId), { kind: "join", account: m, name });
        const named = by !== ZERO;
        push("vote", named ? [m, by] : [m], (n) =>
          named
            ? t("activity.askedToJoinInvited", { name: name || shortAddress(m), inviter: n(by) })
            : t("activity.askedToJoin", { name: name || shortAddress(m) }),
        );
        break;
      }
      case "DormantProposed": {
        const m = str(a.member);
        const by = str(a.proposer);
        requests.set(num(a.requestId), { kind: "dormant", account: m, name: "" });
        push("vote", [by, m], (n) =>
          t("activity.dormantProposed", { proposer: n(by), name: n(m) }),
        );
        break;
      }
      case "Voted": {
        const v = str(a.voter);
        const r = requests.get(num(a.requestId));
        const yes = Boolean(a.support);
        push("vote", r ? [v, r.account] : [v], (n) => {
          if (!r) {
            const p = { voter: n(v), id: num(a.requestId) };
            return yes ? t("activity.votedYesRequest", p) : t("activity.votedNoRequest", p);
          }
          if (r.kind === "join") {
            const p = { voter: n(v), name: r.name || shortAddress(r.account) };
            return yes ? t("activity.votedYesJoin", p) : t("activity.votedNoJoin", p);
          }
          const p = { voter: n(v), name: n(r.account) };
          return yes ? t("activity.votedYesPause", p) : t("activity.votedNoPause", p);
        });
        break;
      }
      case "LoanRequested": {
        const b = str(a.borrower);
        const g = str(a.guarantor);
        const amount = a.amount as bigint;
        loanRequests.set(num(a.requestId), { settle: false, borrower: b, amount });
        const backed = g !== "" && g !== ZERO;
        const medical = Boolean(a.medical);
        push("loan", backed ? [b, g] : [b], (n) => {
          const p = { name: n(b), amount: amt(amount) };
          if (backed) {
            const q = { ...p, guarantor: n(g) };
            return medical ? t("activity.medicalAskedBacked", q) : t("activity.loanAskedBacked", q);
          }
          return medical ? t("activity.medicalAsked", p) : t("activity.loanAsked", p);
        });
        break;
      }
      case "GuaranteeAccepted": {
        const b = str(a.borrower);
        const g = str(a.guarantor);
        push("loan", [g, b], (n) =>
          t("activity.guaranteeAccepted", { guarantor: n(g), name: n(b) }),
        );
        break;
      }
      case "SettleProposed": {
        const b = str(a.borrower);
        const by = str(a.proposer);
        loanRequests.set(num(a.requestId), { settle: true, borrower: b, amount: 0n });
        push("loan", [by, b], (n) => t("activity.settleProposed", { proposer: n(by), name: n(b) }));
        break;
      }
      case "LoanVoted": {
        const v = str(a.voter);
        const r = loanRequests.get(num(a.requestId));
        const yes = Boolean(a.support);
        push("loan", r ? [v, r.borrower] : [v], (n) => {
          if (!r) {
            const p = { voter: n(v), id: num(a.requestId) };
            return yes ? t("activity.loanVotedYesRequest", p) : t("activity.loanVotedNoRequest", p);
          }
          const p = { voter: n(v), name: n(r.borrower) };
          if (r.settle) {
            return yes ? t("activity.loanVotedYesSettle", p) : t("activity.loanVotedNoSettle", p);
          }
          return yes ? t("activity.loanVotedYes", p) : t("activity.loanVotedNo", p);
        });
        break;
      }
      case "LoanRequestClosed": {
        const r = loanRequests.get(num(a.requestId));
        const status = LOAN_STATUS[num(a.status)] ?? "none";
        // An approved loan is told by LoanDisbursed, an approved settle by LoanSettled.
        if (status === "approved") break;
        push("loan", r ? [r.borrower] : [], (n) => {
          if (!r) {
            switch (status) {
              case "rejected":
                return t("activity.loanRejectedAnon");
              case "expired":
                return t("activity.loanExpiredAnon");
              case "cancelled":
                return t("activity.loanCancelledAnon");
              case "failed":
                return t("activity.loanFailedAnon");
              default:
                return t("activity.loanClosedAnon");
            }
          }
          const p = { name: n(r.borrower) };
          switch (status) {
            case "rejected":
              return r.settle ? t("activity.settleRejected", p) : t("activity.loanRejected", p);
            case "expired":
              return r.settle ? t("activity.settleExpired", p) : t("activity.loanExpired", p);
            case "cancelled":
              return r.settle ? t("activity.settleCancelled", p) : t("activity.loanCancelled", p);
            case "failed":
              return t("activity.loanFailed", p);
            default:
              return r.settle ? t("activity.settleClosed", p) : t("activity.loanClosed", p);
          }
        });
        break;
      }
      case "LoanDisbursed": {
        const b = str(a.borrower);
        const amount = a.amount as bigint;
        push("loan", [b], (n) => t("activity.disbursed", { name: n(b), amount: amt(amount) }));
        break;
      }
      case "InterestPaid": {
        const b = str(a.borrower);
        const fees = a.fees as bigint;
        const interest = a.interest as bigint;
        push("loan", [b], (n) =>
          fees > 0n
            ? t("activity.interestPaidFees", {
                name: n(b),
                interest: amt(interest),
                fees: amt(fees),
              })
            : t("activity.interestPaid", { name: n(b), interest: amt(interest) }),
        );
        break;
      }
      case "LoanRepaid": {
        const b = str(a.borrower);
        const part = a.principal as bigint;
        const remaining = a.remaining as bigint;
        const min = a.minInterest as bigint;
        push("loan", [b], (n) =>
          remaining === 0n
            ? min > 0n
              ? t("activity.repaidFullMin", { name: n(b), amount: amt(part), min: amt(min) })
              : t("activity.repaidFull", { name: n(b), amount: amt(part) })
            : t("activity.repaidPart", {
                name: n(b),
                amount: amt(part),
                remaining: amt(remaining),
              }),
        );
        break;
      }
      case "LoanDefaulted": {
        const b = str(a.borrower);
        const g = str(a.guarantor);
        const backed = g !== "" && g !== ZERO;
        push("loan", backed ? [b, g] : [b], (n) =>
          backed
            ? t("activity.defaultedBacked", { name: n(b), guarantor: n(g) })
            : t("activity.defaulted", { name: n(b) }),
        );
        break;
      }
      case "LoanCured": {
        const b = str(a.borrower);
        push("loan", [b], (n) => t("activity.cured", { name: n(b) }));
        break;
      }
      case "LoanSettled": {
        const b = str(a.borrower);
        const g = str(a.guarantor);
        const fromG = a.fromGuarantor as bigint;
        const lost = a.writtenOff as bigint;
        const people = g !== "" && g !== ZERO ? [b, g] : [b];
        push("loan", people, (n) => {
          const fromBorrower = amt(a.fromBorrower as bigint);
          const s =
            fromG > 0n
              ? t("activity.settledWithGuarantor", {
                  name: n(b),
                  fromBorrower,
                  fromGuarantor: amt(fromG),
                  guarantor: n(g),
                })
              : t("activity.settled", { name: n(b), fromBorrower });
          return lost > 0n ? `${s} ${t("activity.settledLoss", { lost: amt(lost) })}` : s;
        });
        break;
      }
      case "RequestClosed": {
        const r = requests.get(num(a.requestId));
        const status = STATUS[num(a.status)] ?? "none";
        push("vote", r ? [r.account] : [], (n) => {
          if (!r) {
            return t("activity.voteClosedAnon", {
              id: num(a.requestId),
              status: t(STATUS_KEY[status]),
            });
          }
          const name = r.kind === "join" ? r.name || shortAddress(r.account) : n(r.account);
          if (r.kind === "dormant") {
            return status === "approved"
              ? t("activity.dormantApproved", { name })
              : status === "cancelled"
                ? t("activity.dormantCancelled", { name })
                : t("activity.dormantOther", { name, status: t(STATUS_KEY[status]) });
          }
          switch (status) {
            case "approved":
              return t("activity.joinApproved", { name });
            case "rejected":
              return t("activity.joinRejected", { name });
            case "expired":
              return t("activity.joinExpired", { name });
            case "cancelled":
              return t("activity.joinCancelled", { name });
            case "full":
              return t("activity.joinFull", { name });
            default:
              return t("activity.joinOther", { name });
          }
        });
        break;
      }
    }
  }
  return items.reverse();
}

/** Feed filters; `label` is a translation key (render with `t(label)`). */
export const FEED_FILTERS: Array<{ value: FeedKind | "all"; label: PlainKey }> = [
  { value: "all", label: "activity.filterAll" },
  { value: "payment", label: "activity.filterPayment" },
  { value: "member", label: "activity.filterMember" },
  { value: "vote", label: "activity.filterVote" },
  { value: "loan", label: "activity.filterLoan" },
];

/** Type filter plus search over names, addresses and transaction hashes (case-insensitive). */
export function filterFeed(
  items: readonly FeedItem[],
  kind: FeedKind | "all",
  query: string,
  name: (address: string) => string,
): FeedItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((it) => {
    if (kind !== "all" && it.kind !== kind) return false;
    if (!q) return true;
    if (it.tx.toLowerCase().includes(q)) return true;
    return it.people.some((p) => p.toLowerCase().includes(q) || name(p).toLowerCase().includes(q));
  });
}
