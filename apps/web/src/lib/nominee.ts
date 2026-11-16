/**
 * Pure helpers for the backup wallet (nominee, ADR 0016 and 0056). They mirror
 * `Exits.setNominee`, `Exits.requestClaim` and `Exits.closeClaim`, so the app can explain a
 * problem before anything is sent.
 */
import { isAddress } from "viem";

import { t } from "@/i18n/runtime";
import "@/i18n/en/nominee";

/** Same as Exits.MIN_CLAIM_NOTICE: a passed claim waits at least this long. */
export const MIN_CLAIM_NOTICE_DAYS = 30;

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Plain-language problem with a backup wallet address, or null if the contract would accept
 * it. Refused on chain: your own wallet and the circle itself. Zero is how you clear it, so
 * the form never sends it as a "new" backup.
 */
export function nomineeProblem(input: string, me?: string, circle?: string): string | null {
  const v = input.trim();
  if (v.length === 0) return t("nominee.addrEmpty");
  if (!isAddress(v, { strict: false })) return t("nominee.addrInvalid");
  const lower = v.toLowerCase();
  if (lower === ZERO) return t("nominee.addrZero");
  if (me && lower === me.toLowerCase()) return t("nominee.addrSelf");
  if (circle && lower === circle.toLowerCase()) return t("nominee.addrCircle");
  return null;
}

/** Notice on a passed claim: the circle's exit notice, but never under 30 days. */
export function claimNoticeDays(exitNoticeDays: number): number {
  return Math.max(exitNoticeDays, MIN_CLAIM_NOTICE_DAYS);
}

/**
 * Where a claim about one member stands:
 * - `none`: no claim.
 * - `voting`: the nominee asked and the circle is voting.
 * - `notice`: the vote passed; the member can still cancel until `maturesAt`.
 * - `ready`: the notice is over; anyone can run the payout.
 */
export type ClaimPhase = "none" | "voting" | "notice" | "ready";

export function claimPhase(
  c: { requestId: bigint; payTo: string; maturesAt: number },
  chainNow: number,
): ClaimPhase {
  if (c.requestId > 0n) return "voting";
  if (!c.payTo || c.payTo.toLowerCase() === ZERO) return "none";
  return chainNow >= c.maturesAt ? "ready" : "notice";
}

/** True when `a` is set (not the zero address). */
export function isSet(a: string | undefined | null): a is string {
  return Boolean(a) && a!.toLowerCase() !== ZERO;
}

/**
 * Exits to process so the payout reaches `member`: its 1-based place in the queue, or the
 * whole queue if it isn't on the page read.
 */
export function exitsToProcess(queue: readonly string[], member: string): number {
  const i = queue.findIndex((a) => a.toLowerCase() === member.toLowerCase());
  return i === -1 ? queue.length : i + 1;
}
