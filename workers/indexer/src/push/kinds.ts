/**
 * Reminder kinds (ADR 0052). Stored per (wallet, circle) as a bitmask, so each kind can be
 * switched on or off for each circle. The app mirrors these values in `apps/web/src/lib/push.ts`.
 */
export const KIND = {
  /** Installment due in 3 days, tomorrow, today. */
  due: 1,
  /** Late fee about to start, second late fee about to start, month missed. */
  late: 2,
  /** Loan interest due soon, or late. */
  interest: 4,
  /** Votes waiting for this member, when new and on the last day. */
  votes: 8,
  /** Exit payout ready to collect, refused payout waiting to be withdrawn. */
  money: 16,
} as const;

export type Kind = keyof typeof KIND;

export const ALL_KINDS = Object.values(KIND).reduce((a, b) => a | b, 0);

export function isKinds(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= ALL_KINDS;
}
