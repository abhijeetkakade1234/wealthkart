import { formatAvax, periodLabel, shortAddress } from "@wealthkart/sdk";

import type { DecodedLog } from "@/lib/events";

/**
 * Activity feed (PLAN.md D7): every circle event as one plain sentence, newest first, with
 * its transaction for the Snowtrace link. Pure, so it is unit tested; the page adds names,
 * times and paging.
 */

export type FeedKind = "payment" | "member" | "vote";

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

/** Membership.Status order. */
const STATUS = ["none", "open", "approved", "rejected", "expired", "cancelled", "full"] as const;

const str = (v: unknown) => String(v ?? "");
const num = (v: unknown) => Number(v as bigint);

/** Turns decoded vault logs into feed items, newest first. Unknown events are skipped. */
export function toFeed(logs: readonly DecodedLog[]): FeedItem[] {
  // Request id -> who it is about, so "closed" lines can say who got in or was paused.
  const requests = new Map<number, { kind: "join" | "dormant"; account: string; name: string }>();
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
            ? `${n(m)} paid ${periodLabel(num(a.period))}: ${formatAvax(a.installment as bigint)} AVAX plus ${formatAvax(fees)} AVAX in late fees.`
            : `${n(m)} paid ${periodLabel(num(a.period))}: ${formatAvax(a.installment as bigint)} AVAX, on time.`,
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
