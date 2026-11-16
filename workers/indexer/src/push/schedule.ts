import { formatUnitsDown } from "@wealthkart/sdk";

import { KIND, type Kind } from "./kinds";
import { DAY, daysUntil, dueMoment, monthName, periodOf, utcLabel } from "./time";

/**
 * Which reminders are due for one member of one circle (ADR 0052). Pure: facts in, candidates
 * out, so every UTC boundary is unit tested. The cron (`step.ts`) reads the facts from the
 * chain, drops stages already sent (`push_sent`), and turns what is left into notifications.
 *
 * Each candidate has a topic (one thing, e.g. the December installment) and a stage (how urgent
 * it is now). A stage is only ever sent once, and a lower stage is never sent after a higher one,
 * so a member who turns reminders on late gets just the latest one.
 */

export interface CircleAssetInfo {
  symbol: string;
  decimals: number;
}

/** An open vote: `m:` join/dormant request, `l:` loan or settle request, `p:` proposal. */
export interface OpenVote {
  key: string;
  deadline: number;
}

export interface CircleFacts {
  address: string;
  name: string;
  asset: CircleAssetInfo;
  dueDay: number;
  secondFeeDay: number;
  fee1: bigint;
  fee2: bigint;
  dissolved: boolean;
  votes: OpenVote[];
}

export interface MemberFacts {
  active: boolean;
  dormant: boolean;
  /** `amountDue`; null when the call reverts (not a member any more). */
  due: { period: number; amount: bigint; fees: bigint; payable: boolean } | null;
  /** A payment holiday covers `due.period`. */
  holiday: boolean;
  /** `interestDue`; null without a loan. */
  interest: { interest: bigint; fees: bigint; overdue: number } | null;
  /** `exitOf`; null when the member hasn't asked to leave. */
  exit: { maturesAt: number } | null;
  withdrawable: bigint;
  /** Keys of the open votes this member can still vote on. */
  canVote: string[];
}

export interface Candidate {
  kind: Kind;
  topic: string;
  stage: number;
  /** Deadline the copy talks about (unix seconds), so the device can add its local time. */
  at?: number;
  title: string;
  body: string;
  url: string;
}

/** Hours before the due moment when "late fee starts soon" goes out. */
export const LATE_WARNING_HOURS = 6;
/** Days before the due day when the first installment and interest reminders go out. */
export const FIRST_NOTICE_DAYS = 3;
/** A vote's second reminder goes out when less than this is left. */
export const VOTE_LAST_CALL_SEC = DAY;

export function fmtAmount(units: bigint, asset: CircleAssetInfo): string {
  const two = formatUnitsDown(units, asset.decimals, 2);
  // Small AVAX amounts would read as 0.00; show four decimals then, like the app does.
  if (units > 0n && /^0\.00$/.test(two)) return formatUnitsDown(units, asset.decimals, 4);
  return two;
}

export function remindersFor(
  c: CircleFacts,
  m: MemberFacts,
  kinds: number,
  nowSec: number,
): Candidate[] {
  const out: Candidate[] = [];
  const on = (k: Kind) => (kinds & KIND[k]) !== 0;
  const money = (v: bigint) => `${fmtAmount(v, c.asset)} ${c.asset.symbol}`;
  const id = c.address;
  const current = periodOf(nowSec);

  // Installments: not for dormant members (missed months aren't owed, ADR 0032), not for a
  // month under a payment holiday (ADR 0017), and not once the circle is closing.
  const due = m.due;
  if (m.active && !m.dormant && due?.payable && !m.holiday && !c.dissolved) {
    const payUrl = `/app/circle/pay/?id=${id}`;
    const month = monthName(due.period);
    if (due.period === current) {
      const deadline = dueMoment(due.period, c.dueDay);
      const days = daysUntil(nowSec, due.period, c.dueDay);
      if (on("due") && days >= 0 && days <= FIRST_NOTICE_DAYS) {
        const stage = days === 0 ? 3 : days === 1 ? 2 : 1;
        const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
        out.push({
          kind: "due",
          topic: `due:${due.period}`,
          stage,
          at: deadline,
          title: c.name,
          body: `Your ${money(due.amount)} for ${month} is due ${when}, by ${utcLabel(deadline)}.`,
          url: payUrl,
        });
      }
      if (on("late")) {
        const left = deadline - nowSec;
        if (left >= 0 && left < LATE_WARNING_HOURS * 3600) {
          const hours = Math.max(1, Math.ceil(left / 3600));
          out.push({
            kind: "late",
            topic: `late:${due.period}`,
            stage: 1,
            at: deadline,
            title: c.name,
            body:
              c.fee1 > 0n
                ? `${month} is still unpaid. A late fee of ${money(c.fee1)} starts in about ${hours} ${hours === 1 ? "hour" : "hours"}, after ${utcLabel(deadline)}.`
                : `${month} is still unpaid. It counts as late in about ${hours} ${hours === 1 ? "hour" : "hours"}, after ${utcLabel(deadline)}.`,
            url: payUrl,
          });
        } else if (left < 0 && daysUntil(nowSec, due.period, c.secondFeeDay) === 0) {
          const second = dueMoment(due.period, c.secondFeeDay);
          if (c.fee2 > 0n) {
            out.push({
              kind: "late",
              topic: `late:${due.period}`,
              stage: 2,
              at: second,
              title: c.name,
              body: `${month} is still unpaid (${money(due.amount)} with fees). A second late fee of ${money(c.fee2)} starts after ${utcLabel(second)}.`,
              url: payUrl,
            });
          }
        }
      }
    } else if (due.period < current && on("late")) {
      out.push({
        kind: "late",
        topic: `late:${due.period}`,
        stage: 3,
        title: c.name,
        body: `${month} is still unpaid: ${money(due.amount)} with late fees. Paying soon keeps your record clean.`,
        url: payUrl,
      });
    }
  }

  // Loan interest is due by the same due day each month (LoanBook._overdueMonths).
  const it = m.interest;
  if (on("interest") && it && it.interest + it.fees > 0n) {
    const loansUrl = `/app/circle/loans/?id=${id}`;
    if (it.overdue > 0) {
      out.push({
        kind: "interest",
        topic: `int:${current}`,
        stage: 2,
        title: c.name,
        body: `Your loan interest is late. ${money(it.interest + it.fees)} is owed now, including fees.`,
        url: loansUrl,
      });
    } else {
      const days = daysUntil(nowSec, current, c.dueDay);
      if (days >= 0 && days <= FIRST_NOTICE_DAYS) {
        const deadline = dueMoment(current, c.dueDay);
        out.push({
          kind: "interest",
          topic: `int:${current}`,
          stage: 1,
          at: deadline,
          title: c.name,
          body: `Loan interest of ${money(it.interest)} is due by ${utcLabel(deadline)}.`,
          url: loansUrl,
        });
      }
    }
  }

  // Votes: once when it's waiting for you, once more on its last day.
  if (on("votes") && m.active && !m.dormant) {
    const mine = new Set(m.canVote);
    for (const v of c.votes) {
      if (!mine.has(v.key) || v.deadline < nowSec) continue;
      out.push({
        kind: "votes",
        topic: `vote:${v.key}`,
        stage: v.deadline - nowSec <= VOTE_LAST_CALL_SEC ? 2 : 1,
        at: v.deadline,
        title: c.name,
        body: "",
        url: `/app/circle/votes/?id=${id}`,
      });
    }
  }

  if (on("money")) {
    if (m.exit && m.exit.maturesAt <= nowSec) {
      out.push({
        kind: "money",
        topic: `exit:${m.exit.maturesAt}`,
        stage: 1,
        title: c.name,
        body: "Your notice period is over. Your share is ready to collect.",
        url: `/app/circle/?id=${id}`,
      });
    }
    if (m.withdrawable > 0n) {
      out.push({
        kind: "money",
        topic: `wd:${m.withdrawable}`,
        stage: 1,
        title: c.name,
        body: `${money(m.withdrawable)} is waiting for you to withdraw.`,
        url: `/app/circle/?id=${id}`,
      });
    }
  }
  return out;
}

/** What one push carries. `topics` are all the topics it settles (votes are grouped). */
export interface Note {
  title: string;
  body: string;
  url: string;
  at?: number;
  /** Replaces an earlier notification with the same tag on the device. */
  tag: string;
  topics: Array<{ topic: string; stage: number }>;
}

/**
 * Turns fresh candidates into notifications: one per candidate, except votes, which become one
 * notification per circle ("2 votes are waiting for you") so a busy week isn't a flood.
 */
export function compose(c: CircleFacts, fresh: Candidate[]): Note[] {
  const notes: Note[] = [];
  const votes = fresh.filter((f) => f.kind === "votes");
  for (const f of fresh) {
    if (f.kind === "votes") continue;
    notes.push({
      title: f.title,
      body: f.body,
      url: f.url,
      at: f.at,
      tag: `${c.address}:${f.kind}`,
      topics: [{ topic: f.topic, stage: f.stage }],
    });
  }
  if (votes.length > 0) {
    const first = Math.min(...votes.map((v) => v.at ?? Infinity));
    const lastCall = votes.some((v) => v.stage === 2);
    const body =
      votes.length === 1
        ? `A vote is waiting for you. It closes ${utcLabel(first)}.`
        : `${votes.length} votes are waiting for you. The first closes ${utcLabel(first)}.`;
    notes.push({
      title: c.name,
      body:
        lastCall && votes.length === 1 ? `Last day to vote. It closes ${utcLabel(first)}.` : body,
      url: votes[0]!.url,
      at: first,
      tag: `${c.address}:votes`,
      topics: votes.map((v) => ({ topic: v.topic, stage: v.stage })),
    });
  }
  return notes;
}

/** Drops candidates whose stage (or a later one) was already sent. */
export function freshOnly(cands: Candidate[], sent: Map<string, number>): Candidate[] {
  return cands.filter((cand) => cand.stage > (sent.get(cand.topic) ?? 0));
}
