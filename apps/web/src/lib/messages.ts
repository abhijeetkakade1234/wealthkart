/**
 * Plain-language message catalogue (docs/ui.md §12, ADR 0026).
 *
 * Every message the user reads about a result or a problem comes from here.
 * Writing rules: say what happened, then what to do. No jargon, no error codes
 * (codes go under "Details"), no blame, short sentences, no emojis.
 *
 * Amounts are passed in already formatted (e.g. "0.50") so this file never does
 * money maths; formatting AVAX from wei is the job of the amount helpers.
 */

export interface InsufficientAvaxParams {
  /** Total the wallet needs, e.g. "0.52". */
  needed: string;
  /** The action's own amount, e.g. "0.50". */
  amount: string;
  /** Estimated network fee, e.g. "0.02". */
  fee: string;
}

export const messages = {
  // Wallet and network problems
  userRejected: () => "You cancelled this in Core. Nothing was sent.",
  insufficientAvax: (p?: InsufficientAvaxParams) =>
    p
      ? `Not enough AVAX in your wallet. You need ${p.needed} AVAX (${p.amount} + about ${p.fee} network fee).`
      : "Not enough AVAX in your wallet to cover this and the network fee.",
  wrongNetwork: () => "Your wallet is on the wrong network. Switch to Avalanche to continue.",
  networkUnreachable: () =>
    "We can't reach the Avalanche network right now. Your money is safe. Try again in a minute.",
  timeout: () =>
    "This is taking longer than usual. It may still go through; we'll update this page when it does.",
  unknown: () =>
    "Something went wrong on our side. Your money is safe. Try again, or share the details with your circle admin.",

  // Transactions the circle contract turned down
  alreadyPaid: (month?: string) =>
    month ? `You've already paid for ${month}.` : "You've already paid for this month.",
  amountChanged: () =>
    "The amount due just changed, usually because a late fee started. Check the new amount and try again.",
  notMember: () => "This wallet isn't a member of this circle.",
  holidayTooLate: () =>
    "It's past this month's due date, so a payment holiday can't be taken now. Pay as soon as you can to keep fees low.",
  holidayAlreadyTaken: () => "You've already taken a payment holiday for this month.",
  holidayLimitReached: () => "You've used all your payment holidays for this year.",
  monthAlreadyPaid: () => "You've already paid this month, so there's nothing to delay.",
  notAvailableYet: () =>
    "Circles aren't open on the main Avalanche network yet. Use the Fuji test network for now.",
  voteClosed: () => "This vote has already ended.",
  loanAboveCap: (maxAvax?: string) =>
    maxAvax
      ? `This loan is bigger than the circle allows for you right now. The most you can ask for is ${maxAvax} AVAX.`
      : "This loan is bigger than the circle allows for you right now.",

  // Success
  paid: (month: string, amountAvax: string) =>
    `Paid. Your ${month} installment of ${amountAvax} AVAX is in.`,
  voted: (votes: number, members: number) => `Vote counted. ${votes} of ${members} have voted.`,
  copied: (what = "Address") => `${what} copied.`,

  // UI states (docs/ui.md §10)
  offline: () => "You're offline. You can look around, but paying and voting need a connection.",
  staleNote: (minutesAgo: number) => {
    if (minutesAgo < 1) return "Showing saved data from less than a minute ago";
    if (minutesAgo < 60) return `Showing saved data from ${Math.round(minutesAgo)} min ago`;
    const hours = Math.round(minutesAgo / 60);
    return `Showing saved data from ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  },
  loadFailed: () => "We couldn't load this right now. Your money is safe. Try again in a moment.",
  txFailed: () =>
    "This didn't go through. Nothing was sent except the network fee. You can try again.",

  // Access cards
  accessNoWalletTitle: () => "Connect your Core wallet",
  accessNoWalletBody: () =>
    "Your wallet address is your account. WealthKart stores no names, emails or phone numbers.",
  accessWrongNetworkTitle: () => "Switch to Avalanche",
  accessWrongNetworkBody: () =>
    "Your wallet is on a different network. Switch to Avalanche to see this circle.",
  accessNotMemberTitle: () => "You're not in this circle yet",
  accessNotMemberBody: () =>
    "Ask a member for an invite link. Once the circle votes you in, it shows up here.",

  // Error boundaries (docs/ui.md §11)
  appErrorTitle: () => "Something went wrong",
  pageErrorTitle: () => "This page couldn't load",
  widgetErrorTitle: (name?: string) => (name ? `${name} couldn't load` : "This part couldn't load"),
  widgetErrorBody: () => "The rest of the page still works. Try again in a moment.",

  // Transaction tracker
  txStepConfirm: () => "Confirm in Core",
  txStepSending: () => "Sending",
  txStepConfirmed: () => "Confirmed",
} as const;

export type MessageKey = keyof typeof messages;

/** Codes for every friendly error the UI knows how to explain. */
export type FriendlyErrorCode =
  | "user-rejected"
  | "insufficient-funds"
  | "wrong-network"
  | "network"
  | "timeout"
  | "already-paid"
  | "amount-changed"
  | "not-member"
  | "holiday-too-late"
  | "holiday-already-taken"
  | "holiday-limit"
  | "month-already-paid"
  | "not-available"
  | "vote-closed"
  | "loan-above-cap"
  | "unknown";

/** The only error shape that ever reaches the UI. `details` is for the "Details" toggle. */
export interface FriendlyError {
  readonly kind: "friendly-error";
  code: FriendlyErrorCode;
  message: string;
  details?: string;
}

/** Optional facts that let a message be specific ("You need 0.52 AVAX"). */
export interface FriendlyErrorContext {
  insufficient?: InsufficientAvaxParams;
  month?: string;
  maxLoanAvax?: string;
}

export function friendlyError(
  code: FriendlyErrorCode,
  message: string,
  details?: string,
): FriendlyError {
  return details === undefined
    ? { kind: "friendly-error", code, message }
    : { kind: "friendly-error", code, message, details };
}

export function isFriendlyError(value: unknown): value is FriendlyError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "friendly-error" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

/** Codes worth retrying automatically (transient network trouble). */
export function isRetryable(code: FriendlyErrorCode): boolean {
  return code === "network" || code === "timeout" || code === "unknown";
}

interface ErrorFacts {
  codes: Array<number | string>;
  names: string[];
  texts: string[];
}

const MAX_DEPTH = 6;

/** Walks an unknown error (and its `cause` / `error` / `data` chain) collecting codes and text. */
function collectFacts(err: unknown, facts: ErrorFacts, depth = 0, seen = new Set<unknown>()) {
  if (err === null || err === undefined || depth > MAX_DEPTH || seen.has(err)) return;
  if (typeof err === "string") {
    facts.texts.push(err);
    return;
  }
  if (typeof err !== "object") return;
  seen.add(err);

  const e = err as Record<string, unknown>;
  if (typeof e.code === "number" || typeof e.code === "string") facts.codes.push(e.code);
  if (typeof e.name === "string") facts.names.push(e.name);
  if (typeof e.errorName === "string") facts.names.push(e.errorName);
  for (const key of ["message", "shortMessage", "details", "reason"]) {
    if (typeof e[key] === "string") facts.texts.push(e[key] as string);
  }
  for (const key of ["cause", "error", "data", "originalError"]) {
    collectFacts(e[key], facts, depth + 1, seen);
  }
}

function technicalDetails(err: unknown, facts: ErrorFacts): string | undefined {
  const parts: string[] = [];
  if (facts.names.length > 0) parts.push(facts.names[0]);
  if (facts.codes.length > 0) parts.push(`code ${facts.codes[0]}`);
  const text = facts.texts[0] ?? (typeof err === "string" ? err : undefined);
  if (text) parts.push(text);
  if (parts.length === 0) return undefined;
  const joined = parts.join(" · ");
  return joined.length > 600 ? `${joined.slice(0, 597)}...` : joined;
}

/**
 * Maps anything thrown by a wallet, RPC node, indexer or our own code to a
 * catalogue message. Never throws; unknown input becomes the "unknown" message.
 */
export function toFriendlyError(err: unknown, ctx: FriendlyErrorContext = {}): FriendlyError {
  if (isFriendlyError(err)) return err;

  const facts: ErrorFacts = { codes: [], names: [], texts: [] };
  try {
    collectFacts(err, facts);
  } catch {
    // A hostile getter must not break error handling.
  }
  const details = technicalDetails(err, facts);
  const text = facts.texts.join(" | ").toLowerCase();
  const names = facts.names.map((n) => n.toLowerCase());
  const hasCode = (...codes: Array<number | string>) =>
    facts.codes.some((c) => codes.some((x) => String(x) === String(c)));
  const hasName = (...candidates: string[]) =>
    names.some((n) => candidates.some((c) => n === c.toLowerCase()));

  // 1. The user said no in the wallet (EIP-1193 4001, viem UserRejectedRequestError).
  if (
    hasCode(4001, "ACTION_REJECTED") ||
    hasName("UserRejectedRequestError") ||
    /user (rejected|denied|cancel)/.test(text)
  ) {
    return friendlyError("user-rejected", messages.userRejected(), details);
  }

  // 2. Contract custom errors (decoded by viem as errorName). Names match
  //    packages/contracts/src/CircleVault.sol; VoteClosed / LoanAboveCap are reserved for Phase 2.
  if (hasName("AdvancePaymentNotAllowed", "AlreadyPaid")) {
    return friendlyError("already-paid", messages.alreadyPaid(ctx.month), details);
  }
  if (hasName("WrongAmount")) {
    return friendlyError("amount-changed", messages.amountChanged(), details);
  }
  if (hasName("NotAMember")) {
    return friendlyError("not-member", messages.notMember(), details);
  }
  if (hasName("HolidayTooLate")) {
    return friendlyError("holiday-too-late", messages.holidayTooLate(), details);
  }
  if (hasName("HolidayAlreadyDeclared")) {
    return friendlyError("holiday-already-taken", messages.holidayAlreadyTaken(), details);
  }
  if (hasName("HolidayLimitReached")) {
    return friendlyError("holiday-limit", messages.holidayLimitReached(), details);
  }
  if (hasName("PeriodAlreadyPaid")) {
    return friendlyError("month-already-paid", messages.monthAlreadyPaid(), details);
  }
  if (hasName("MainnetNotSupported")) {
    return friendlyError("not-available", messages.notAvailableYet(), details);
  }
  if (hasName("VoteClosed", "VotingClosed", "ProposalClosed")) {
    return friendlyError("vote-closed", messages.voteClosed(), details);
  }
  if (hasName("LoanAboveCap", "LoanExceedsCap")) {
    return friendlyError("loan-above-cap", messages.loanAboveCap(ctx.maxLoanAvax), details);
  }

  // 3. Not enough AVAX for value + gas (often wrapped in -32000 / -32603).
  if (
    hasCode("INSUFFICIENT_FUNDS") ||
    hasName("InsufficientFundsError") ||
    text.includes("insufficient funds")
  ) {
    return friendlyError(
      "insufficient-funds",
      messages.insufficientAvax(ctx.insufficient),
      details,
    );
  }

  // 4. Wrong chain (EIP-1193 4902 unknown chain, viem ChainMismatchError).
  if (
    hasCode(4902) ||
    hasName("ChainMismatchError", "SwitchChainError", "ChainNotConfiguredError") ||
    /chain mismatch|wrong network|unrecognized chain/.test(text)
  ) {
    return friendlyError("wrong-network", messages.wrongNetwork(), details);
  }

  // 5. Timeouts (our own safeCall timeout, viem TimeoutError, dropped requests).
  if (
    hasCode("TIMEOUT", "ETIMEDOUT") ||
    hasName("TimeoutError") ||
    /timed? ?out|timeout/.test(text)
  ) {
    return friendlyError("timeout", messages.timeout(), details);
  }

  // 6. Node or network down: internal JSON-RPC error, disconnected provider, rate limit, fetch failure.
  if (
    hasCode(-32603, -32005, 4900, 4901, 429, 502, 503, 504, "NETWORK_ERROR", "ECONNREFUSED") ||
    hasName("HttpRequestError", "RpcRequestError", "InternalRpcError", "LimitExceededRpcError") ||
    /failed to fetch|fetch failed|networkerror|network error|econnrefused|disconnected/.test(text)
  ) {
    return friendlyError("network", messages.networkUnreachable(), details);
  }

  return friendlyError("unknown", messages.unknown(), details);
}
