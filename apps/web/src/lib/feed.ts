import { periodLabel, shortAddress } from "@wealthkart/sdk";

import { AVAX, type CircleAsset, fmt, money } from "@/lib/asset";

import type { DecodedLog } from "@/lib/events";

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
        push("payment", [m], (n) =>
          fees > 0n
            ? `${n(m)} paid ${periodLabel(num(a.period))}: ${fmt(a.installment as bigint, asset)} ${asset.symbol} plus ${fmt(fees, asset)} ${asset.symbol} in late fees.`
            : `${n(m)} paid ${periodLabel(num(a.period))}: ${fmt(a.installment as bigint, asset)} ${asset.symbol}, on time.`,
        );
        break;
      }
      case "HolidayDeclared": {
        const m = str(a.member);
        push(
          "payment",
          [m],
          (n) => `${n(m)} took a payment holiday for ${periodLabel(num(a.period))}.`,
        );
        break;
      }
      case "MemberAdded": {
        const m = str(a.member);
        push("member", [m], (n) => `${n(m)} joined the circle.`);
        break;
      }
      case "FounderInvited": {
        const m = str(a.account);
        push("member", [m], (n) => `${n(m)} was invited as a founder.`);
        break;
      }
      case "FounderInviteDeclined": {
        const m = str(a.account);
        push("member", [m], (n) => `${n(m)} turned down the founder invite.`);
        break;
      }
      case "DisplayNameSet": {
        const m = str(a.member);
        const name = str(a.displayName);
        push("member", [m], () => `${shortAddress(m)} is now called ${name}.`);
        break;
      }
      case "VotingRightsGranted": {
        const m = str(a.member);
        push("member", [m], (n) => `${n(m)} can vote now.`);
        break;
      }
      case "MemberDormant": {
        const m = str(a.member);
        push("member", [m], (n) => `${n(m)} is dormant: payments paused, savings untouched.`);
        break;
      }
      case "MemberWoke": {
        const m = str(a.member);
        push("member", [m], (n) => `${n(m)} is back and paying again.`);
        break;
      }
      case "JoinRequested": {
        const m = str(a.applicant);
        const name = str(a.displayName);
        const by = str(a.invitedBy);
        requests.set(num(a.requestId), { kind: "join", account: m, name });
        const named = by !== "0x0000000000000000000000000000000000000000";
        push("vote", named ? [m, by] : [m], (n) =>
          named
            ? `${name || shortAddress(m)} asked to join, invited by ${n(by)}.`
            : `${name || shortAddress(m)} asked to join.`,
        );
        break;
      }
      case "DormantProposed": {
        const m = str(a.member);
        const by = str(a.proposer);
        requests.set(num(a.requestId), { kind: "dormant", account: m, name: "" });
        push(
          "vote",
          [by, m],
          (n) => `${n(by)} asked the circle to pause ${n(m)}'s payments (marked dormant).`,
        );
        break;
      }
      case "Voted": {
        const v = str(a.voter);
        const r = requests.get(num(a.requestId));
        const about = r ? (r.kind === "join" ? r.name || shortAddress(r.account) : r.account) : "";
        push("vote", r ? [v, r.account] : [v], (n) => {
          const subject = !r
            ? `request ${num(a.requestId)}`
            : r.kind === "join"
              ? `letting ${about} join`
              : `pausing ${n(r.account)}`;
          return `${n(v)} voted ${a.support ? "yes" : "no"} on ${subject}.`;
        });
        break;
      }
      case "LoanRequested": {
        const b = str(a.borrower);
        const g = str(a.guarantor);
        const amount = a.amount as bigint;
        loanRequests.set(num(a.requestId), { settle: false, borrower: b, amount });
        const backed = g !== "" && g !== ZERO;
        const what = a.medical ? "a medical loan" : "a loan";
        push("loan", backed ? [b, g] : [b], (n) =>
          backed
            ? `${n(b)} asked for ${what} of ${amt(amount)}, with ${n(g)} as guarantor.`
            : `${n(b)} asked for ${what} of ${amt(amount)}.`,
        );
        break;
      }
      case "GuaranteeAccepted": {
        const b = str(a.borrower);
        const g = str(a.guarantor);
        push("loan", [g, b], (n) => `${n(g)} agreed to back ${n(b)}'s loan.`);
        break;
      }
      case "SettleProposed": {
        const b = str(a.borrower);
        const by = str(a.proposer);
        loanRequests.set(num(a.requestId), { settle: true, borrower: b, amount: 0n });
        push(
          "loan",
          [by, b],
          (n) => `${n(by)} asked the circle to settle ${n(b)}'s defaulted loan from their savings.`,
        );
        break;
      }
      case "LoanVoted": {
        const v = str(a.voter);
        const r = loanRequests.get(num(a.requestId));
        push("loan", r ? [v, r.borrower] : [v], (n) => {
          const subject = !r
            ? `loan request ${num(a.requestId)}`
            : r.settle
              ? `settling ${n(r.borrower)}'s loan`
              : `${n(r.borrower)}'s loan`;
          return `${n(v)} voted ${a.support ? "yes" : "no"} on ${subject}.`;
        });
        break;
      }
      case "LoanRequestClosed": {
        const r = loanRequests.get(num(a.requestId));
        const status = LOAN_STATUS[num(a.status)] ?? "none";
        // An approved loan is told by LoanDisbursed, an approved settle by LoanSettled.
        if (status === "approved") break;
        push("loan", r ? [r.borrower] : [], (n) => {
          const who = r ? `${n(r.borrower)}'s` : "A";
          const thing = r?.settle ? "settle vote" : "loan request";
          switch (status) {
            case "rejected":
              return `${who} ${thing} didn't pass.`;
            case "expired":
              return `${who} ${thing} ran out of time before enough members voted.`;
            case "cancelled":
              return r?.settle
                ? `${who} loan was paid up first, so the settle vote was called off.`
                : `${who} loan request was withdrawn.`;
            case "failed":
              return `${who} loan request passed but couldn't be paid out (cash, limits or the guarantor).`;
            default:
              return `${who} ${thing} closed.`;
          }
        });
        break;
      }
      case "LoanDisbursed": {
        const b = str(a.borrower);
        const amount = a.amount as bigint;
        push("loan", [b], (n) => `${n(b)} received a loan of ${amt(amount)}.`);
        break;
      }
      case "InterestPaid": {
        const b = str(a.borrower);
        const fees = a.fees as bigint;
        const interest = a.interest as bigint;
        push("loan", [b], (n) =>
          fees > 0n
            ? `${n(b)} paid ${amt(interest)} of loan interest plus ${amt(fees)} in late fees.`
            : `${n(b)} paid ${amt(interest)} of loan interest.`,
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
              ? `${n(b)} repaid their loan in full: ${amt(part)} plus ${amt(min)} for the minimum month of interest.`
              : `${n(b)} repaid their loan in full: ${amt(part)}.`
            : `${n(b)} repaid ${amt(part)} of their loan. ${amt(remaining)} left.`,
        );
        break;
      }
      case "LoanDefaulted": {
        const b = str(a.borrower);
        const g = str(a.guarantor);
        const backed = g !== "" && g !== ZERO;
        push("loan", backed ? [b, g] : [b], (n) =>
          backed
            ? `${n(b)}'s loan was marked as defaulted. ${n(b)} and guarantor ${n(g)} are frozen until it's paid.`
            : `${n(b)}'s loan was marked as defaulted. ${n(b)} is frozen until it's paid.`,
        );
        break;
      }
      case "LoanCured": {
        const b = str(a.borrower);
        push("loan", [b], (n) => `${n(b)} caught up on their loan, so the default is lifted.`);
        break;
      }
      case "LoanSettled": {
        const b = str(a.borrower);
        const g = str(a.guarantor);
        const fromG = a.fromGuarantor as bigint;
        const lost = a.writtenOff as bigint;
        const people = g !== "" && g !== ZERO ? [b, g] : [b];
        push("loan", people, (n) => {
          let s = `${n(b)}'s defaulted loan was settled: ${amt(a.fromBorrower as bigint)} from their savings`;
          if (fromG > 0n) s += ` and ${amt(fromG)} from ${n(g)}'s`;
          s += ".";
          if (lost > 0n) s += ` ${amt(lost)} couldn't be covered and is shared by everyone.`;
          return s;
        });
        break;
      }
      case "RequestClosed": {
        const r = requests.get(num(a.requestId));
        const status = STATUS[num(a.status)] ?? "none";
        push("vote", r ? [r.account] : [], (n) => {
          if (!r) return `Vote ${num(a.requestId)} closed: ${status}.`;
          const who = r.kind === "join" ? r.name || shortAddress(r.account) : n(r.account);
          if (r.kind === "dormant") {
            return status === "approved"
              ? `Vote closed: ${who}'s payments are paused.`
              : status === "cancelled"
                ? `Vote closed: ${who} caught up, so nothing changed.`
                : `Vote closed: ${who} stays active (${status}).`;
          }
          switch (status) {
            case "approved":
              return `Vote closed: ${who} is in.`;
            case "rejected":
              return `Vote closed: ${who} wasn't voted in.`;
            case "expired":
              return `Vote closed: time ran out before enough members voted on ${who}.`;
            case "cancelled":
              return `${who} withdrew their request to join.`;
            case "full":
              return `Vote closed: ${who} was voted in, but the circle was already full.`;
            default:
              return `Vote on ${who} closed.`;
          }
        });
        break;
      }
    }
  }
  return items.reverse();
}

export const FEED_FILTERS: Array<{ value: FeedKind | "all"; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "payment", label: "Payments" },
  { value: "member", label: "Members" },
  { value: "vote", label: "Votes" },
  { value: "loan", label: "Loans" },
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
