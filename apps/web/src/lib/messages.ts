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

  // Membership (ADR 0028, 0029)
  notACircle: () =>
    "This link doesn't point to a WealthKart circle. Don't send it any money; ask your friend for the link again.",
  noFounderInvite: () => "There's no founder invite for this wallet in this circle.",
  founderInviteExpired: () =>
    "Your founder invite has expired. You can still ask to join; the members will vote.",
  alreadyMember: () => "This wallet is already a member of this circle.",
  requestAlreadyOpen: () =>
    "You've already asked to join. Wait for the vote, or cancel your request first.",
  tooManyOpenRequests: () =>
    "This circle has too many people waiting to join right now. Try again after the members vote.",
  circleFull: () => "This circle is full. It has reached the member limit its rules set.",
  inviterNotMember: () =>
    "The friend who invited you isn't a member of this circle, so we can't show them as your inviter.",
  invalidDisplayName: () =>
    "Names need 3 to 24 letters, numbers, spaces, dots, dashes or underscores, with no space at the start or end.",
  nameTaken: () => "Someone in this circle already uses that name. Try another one.",
  nameChangeTooSoon: (when?: string) =>
    when
      ? `You changed your name recently. You can change it again on ${when}.`
      : "You changed your name recently. You can change it again after 30 days.",
  requestNotOpen: () => "This join request has already been settled.",
  notEligibleToVote: () =>
    "You can't vote on this one. Only members who joined before the request, and are at most one month behind, can vote.",
  alreadyVoted: () => "You've already voted on this request.",
  notDecidedYet: () => "The vote isn't decided yet. It can be settled once the voting time ends.",
  noOpenRequest: () => "You don't have a join request waiting in this circle.",
  memberIsDormant: () =>
    "Your payments are paused because the circle marked you dormant. Wake up on the circle page, or just pay, to come back.",
  notDormant: () => "You're already active in this circle.",
  notOverdueEnough: () =>
    "They haven't missed enough months yet. The circle can only pause someone's payments after the number of missed months it agreed on.",
  noOtherVoters: () => "There's nobody else in the circle who could vote on this yet.",
  nothingToWithdraw: () => "There's nothing waiting for you to withdraw.",
  withdrawFailed: () =>
    "Your wallet didn't accept the payout. Try again from a wallet that can receive it.",
  insufficientCash: () =>
    "The circle doesn't have enough cash for this right now. Some of its money is lent out.",
  // USDT circles (ADR 0046).
  avaxNotAccepted: () => "This circle is paid in USDT. Send the payment without any AVAX attached.",
  tokenAllowanceTooLow: () =>
    "Approve the USDT payment in your wallet first, then pay. If the amount changed, approve again.",
  tokenBalanceTooLow: () => "Your wallet doesn't have enough USDT for this payment.",
  needGasAvax: (fee: string) =>
    `Network fees are paid in AVAX, even in a USDT circle. Add about ${fee} AVAX to your wallet, then pay.`,
  /** Checked before anything is sent, so the member never approves a payment they can't make. */
  notEnoughToken: (p: { needed: string; have: string; symbol: string }) =>
    `Your wallet has ${p.have} ${p.symbol}, but this payment needs ${p.needed} ${p.symbol}. Add ${p.symbol} to your wallet, then try again.`,
  tokenAmountMismatch: () =>
    "The circle received a different amount of USDT than was sent, so the payment was refused.",
  tokenTransferFailed: () =>
    "The USDT transfer didn't go through. Check your USDT balance and approval, then try again.",
  usdtNotAvailable: () =>
    "USDT circles aren't available on this network yet. Choose AVAX for this circle.",
  notAllowedToPropose: () => "Only members who can vote right now can start a proposal.",
  tooManyOpenProposals: () =>
    "There are already 10 open proposals. Wait for some to be decided first.",
  tooManyOpenProposalsBy: () => "You already have 2 open proposals. Wait until one is decided.",
  noEligibleVoters: () => "There's nobody who could vote on this yet.",
  ruleChangeInProgress: () =>
    "A rule change is already being voted on or waiting to apply. One at a time.",
  invalidRule: () =>
    "One of these settings is outside what a circle allows. Check the numbers and try again.",
  noPendingRuleChange: () => "There's no rule change waiting to apply.",
  ruleChangeNotDue: () => "The new rules can't apply yet. They start once the waiting period ends.",
  invalidWaiver: () =>
    "That month can't be waived: it must be a started, unpaid month that isn't waived already.",
  guardianAlreadyOff: () => "The guardian is already switched off for this circle.",
  proposalNotOpen: () => "This proposal is already decided or was withdrawn.",
  proposalVotingClosed: () => "Voting on this proposal has closed.",
  cannotVoteOnProposal: () =>
    "You can't vote on this one: only members who could vote when it started, and are up to date, can.",
  alreadyVotedOnProposal: () => "You've already voted on this proposal.",
  proposalNotDecided: () =>
    "The vote isn't decided yet. It can be settled once the voting time ends.",
  notProposer: () => "Only the member who started this proposal can withdraw it.",
  circleDissolved: () =>
    "This circle has voted to close. Payments have stopped; members can claim their share.",
  notDissolved: () => "The circle hasn't voted to close, so there's nothing to claim yet.",
  claimBlockedByLoan: () =>
    "Your loan, or the loan you guarantee, must be repaid or settled before you can claim.",
  nothingToClaimYet: () =>
    "There's no cash to share out right now. Claim again once loans are repaid.",
  proposalTooSoon: () => "You started a proposal recently. You can start the next one tomorrow.",
  memberExiting: () =>
    "A member who has asked to leave can't take a loan or back one. Cancel the exit first.",
  payoutGasTooLow: () => "This needs a little more gas to send the payment. Please try again.",
  exitAlreadyPending: () => "You've already asked to leave this circle.",
  noExitPending: () => "You haven't asked to leave this circle.",
  exitNotReady: () => "Your notice period isn't over yet. You can collect your share when it ends.",
  memberFrozen: () =>
    "Your share is frozen because of an unpaid loan. Pay what's owed to unfreeze it.",
  hasLoanTies: () => "You can't leave while you have a loan, a loan request or a guarantee open.",
  notGuardian: () => "Only the circle's guardian can do this.",
  guardianOff: () =>
    "The guardian role has ended (voted off, or the creator left), so pausing isn't possible.",
  pauseTooSoon: () => "The guardian can pause at most once every 90 days.",
  notPaused: () => "The circle isn't paused.",
  circlePaused: () =>
    "The circle is paused for a short time, so new members and loans wait. Leaving and paying still work.",
  loansClosed: () => "This circle has voted to close, so it doesn't lend any more.",
  loansPaused: () =>
    "Loans are paused for a short time by the circle's guardian. Paying and leaving still work.",
  notAVoter: () => "Only members who can vote right now can ask for a loan.",
  loanRequestOpen: () => "You already have a loan request waiting for votes.",
  loanActive: () => "You already have a loan. Repay it before asking for another.",
  tooFewMembers: () => "The circle needs more members before it can lend.",
  zeroAmount: () => "Enter an amount above 0.",
  amountTooLarge: () => "That's more than this circle can lend you. Try a smaller amount.",
  medicalLoansOff: () => "This circle doesn't offer medical loans.",
  medicalLoanThisYear: () => "You've already had a medical loan this year.",
  guarantorRequired: () =>
    "This circle needs a guarantor for every loan. Pick a member to back you.",
  invalidGuarantor: () => "That member can't be your guarantor. Pick another member of the circle.",
  alreadyGuaranteeing: () => "That member is already backing another loan.",
  notYourGuarantee: () => "You weren't named as the guarantor for this loan.",
  noOtherLoanVoters: () => "There's nobody else in the circle who could vote on this loan yet.",
  loanRequestNotOpen: () => "This loan request is already decided or was withdrawn.",
  loanVotingClosed: () => "Voting on this loan has closed.",
  cannotVoteOnLoan: () =>
    "You can't vote on this loan: the borrower can't, and only members who could vote when it started, and are up to date, can.",
  alreadyVotedOnLoan: () => "You've already voted on this loan.",
  loanNotDecidedYet: () =>
    "The vote isn't decided yet. It can be settled once the voting time ends.",
  guaranteeNotAccepted: () =>
    "The guarantor hasn't accepted yet. The loan can be paid out once they do.",
  disbursalBlocked: () =>
    "The loan can't be paid out right now: members are waiting to be paid for leaving, or the circle is paused.",
  noLoanRequest: () => "You don't have a loan request waiting.",
  noLoan: () => "There's no loan to pay.",
  nothingOwed: () => "Nothing is owed on this loan right now.",
  wrongLoanAmount: () => "The amount doesn't match what's owed. Refresh and try again.",
  interestOverdue: () => "Pay the overdue interest first, then repay the loan.",
  interestOwed: () => "Pay the interest that's due first.",
  notInDefault: () => "This loan isn't in default.",
  alreadyDefaulted: () => "This loan is already marked as in default.",
  settleOpen: () => "A vote to settle this loan is already open.",
  exitGasTooLow: () =>
    "There wasn't enough gas to reach your place in the queue. Try again; your wallet will ask for a bit more.",
  tooManyOpenRequestsBy: () =>
    "That member already has 3 open invites or proposals. Ask them to wait until one is decided, or ask another member to invite you.",

  // Success
  paid: (month: string, amount: string, symbol = "AVAX") =>
    `Paid. Your ${month} installment of ${amount} ${symbol} is in.`,
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
  | "not-a-circle"
  | "no-founder-invite"
  | "founder-invite-expired"
  | "already-member"
  | "request-already-open"
  | "too-many-requests"
  | "circle-full"
  | "inviter-not-member"
  | "invalid-name"
  | "name-taken"
  | "name-change-too-soon"
  | "request-not-open"
  | "not-eligible-to-vote"
  | "already-voted"
  | "not-decided-yet"
  | "no-open-request"
  | "member-dormant"
  | "not-dormant"
  | "not-overdue-enough"
  | "no-other-voters"
  | "too-many-requests-by"
  | "exit-gas-too-low"
  | "loan-loans-closed"
  | "loan-loans-paused"
  | "loan-not-a-voter"
  | "loan-loan-request-open"
  | "loan-loan-active"
  | "loan-too-few-members"
  | "loan-zero-amount"
  | "loan-amount-too-large"
  | "loan-medical-loans-off"
  | "loan-medical-loan-this-year"
  | "loan-guarantor-required"
  | "loan-invalid-guarantor"
  | "loan-already-guaranteeing"
  | "loan-not-your-guarantee"
  | "loan-no-other-loan-voters"
  | "loan-loan-request-not-open"
  | "loan-loan-voting-closed"
  | "loan-cannot-vote-on-loan"
  | "loan-already-voted-on-loan"
  | "loan-loan-not-decided-yet"
  | "loan-guarantee-not-accepted"
  | "loan-disbursal-blocked"
  | "loan-no-loan-request"
  | "loan-no-loan"
  | "loan-nothing-owed"
  | "loan-wrong-loan-amount"
  | "loan-interest-overdue"
  | "loan-interest-owed"
  | "loan-not-in-default"
  | "loan-already-defaulted"
  | "loan-settle-open"
  | "not-allowed-to-propose"
  | "too-many-proposals"
  | "too-many-proposals-by"
  | "no-eligible-voters"
  | "rule-change-in-progress"
  | "invalid-rule"
  | "no-pending-rule-change"
  | "rule-change-not-due"
  | "invalid-waiver"
  | "guardian-already-off"
  | "proposal-not-open"
  | "proposal-voting-closed"
  | "cannot-vote-on-proposal"
  | "already-voted-on-proposal"
  | "proposal-not-decided"
  | "not-proposer"
  | "circle-dissolved"
  | "not-dissolved"
  | "claim-blocked-by-loan"
  | "nothing-to-claim-yet"
  | "proposal-too-soon"
  | "member-exiting"
  | "payout-gas-too-low"
  | "exit-already-pending"
  | "no-exit-pending"
  | "exit-not-ready"
  | "member-frozen"
  | "has-loan-ties"
  | "not-guardian"
  | "guardian-off"
  | "pause-too-soon"
  | "not-paused"
  | "circle-paused"
  | "nothing-to-withdraw"
  | "withdraw-failed"
  | "insufficient-cash"
  | "avax-not-accepted"
  | "token-allowance-too-low"
  | "token-balance-too-low"
  | "token-amount-mismatch"
  | "usdt-not-available"
  | "token-transfer-failed"
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
  /** When a display name can change again, already formatted. */
  nameChangeAt?: string;
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
  // Membership errors (ADR 0028, 0029, 0032), plus the factory's NotACircle.
  const membership: Array<[string, FriendlyErrorCode, () => string]> = [
    ["NotACircle", "not-a-circle", messages.notACircle],
    ["NoFounderInvite", "no-founder-invite", messages.noFounderInvite],
    ["FounderInviteExpired", "founder-invite-expired", messages.founderInviteExpired],
    ["AlreadyMember", "already-member", messages.alreadyMember],
    ["RequestAlreadyOpen", "request-already-open", messages.requestAlreadyOpen],
    ["TooManyOpenRequests", "too-many-requests", messages.tooManyOpenRequests],
    ["CircleFull", "circle-full", messages.circleFull],
    ["InvitedByNotAMember", "inviter-not-member", messages.inviterNotMember],
    ["InvalidDisplayName", "invalid-name", messages.invalidDisplayName],
    ["NameTaken", "name-taken", messages.nameTaken],
    [
      "NameChangeTooSoon",
      "name-change-too-soon",
      () => messages.nameChangeTooSoon(ctx.nameChangeAt),
    ],
    ["RequestNotOpen", "request-not-open", messages.requestNotOpen],
    ["NotEligibleToVote", "not-eligible-to-vote", messages.notEligibleToVote],
    ["AlreadyVoted", "already-voted", messages.alreadyVoted],
    ["NotDecidedYet", "not-decided-yet", messages.notDecidedYet],
    ["NoOpenRequest", "no-open-request", messages.noOpenRequest],
    // Dormant members (ADR 0032).
    ["MemberIsDormant", "member-dormant", messages.memberIsDormant],
    ["NotDormant", "not-dormant", messages.notDormant],
    ["NotOverdueEnough", "not-overdue-enough", messages.notOverdueEnough],
    ["NoOtherVoters", "no-other-voters", messages.noOtherVoters],
    ["TooManyOpenRequestsBy", "too-many-requests-by", messages.tooManyOpenRequestsBy],
    ["ExitGasTooLow", "exit-gas-too-low", messages.exitGasTooLow],
    // Loans (ADR 0038).
    ["LoansClosed", "loan-loans-closed", messages.loansClosed],
    ["LoansPaused", "loan-loans-paused", messages.loansPaused],
    ["NotAVoter", "loan-not-a-voter", messages.notAVoter],
    ["LoanRequestOpen", "loan-loan-request-open", messages.loanRequestOpen],
    ["LoanActive", "loan-loan-active", messages.loanActive],
    ["TooFewMembers", "loan-too-few-members", messages.tooFewMembers],
    ["ZeroAmount", "loan-zero-amount", messages.zeroAmount],
    ["AmountTooLarge", "loan-amount-too-large", messages.amountTooLarge],
    ["MedicalLoansOff", "loan-medical-loans-off", messages.medicalLoansOff],
    ["MedicalLoanThisYear", "loan-medical-loan-this-year", messages.medicalLoanThisYear],
    ["GuarantorRequired", "loan-guarantor-required", messages.guarantorRequired],
    ["InvalidGuarantor", "loan-invalid-guarantor", messages.invalidGuarantor],
    ["AlreadyGuaranteeing", "loan-already-guaranteeing", messages.alreadyGuaranteeing],
    ["NotYourGuarantee", "loan-not-your-guarantee", messages.notYourGuarantee],
    ["NoOtherLoanVoters", "loan-no-other-loan-voters", messages.noOtherLoanVoters],
    ["LoanRequestNotOpen", "loan-loan-request-not-open", messages.loanRequestNotOpen],
    ["LoanVotingClosed", "loan-loan-voting-closed", messages.loanVotingClosed],
    ["CannotVoteOnLoan", "loan-cannot-vote-on-loan", messages.cannotVoteOnLoan],
    ["AlreadyVotedOnLoan", "loan-already-voted-on-loan", messages.alreadyVotedOnLoan],
    ["LoanNotDecidedYet", "loan-loan-not-decided-yet", messages.loanNotDecidedYet],
    ["GuaranteeNotAccepted", "loan-guarantee-not-accepted", messages.guaranteeNotAccepted],
    ["DisbursalBlocked", "loan-disbursal-blocked", messages.disbursalBlocked],
    ["NoLoanRequest", "loan-no-loan-request", messages.noLoanRequest],
    ["NoLoan", "loan-no-loan", messages.noLoan],
    ["NothingOwed", "loan-nothing-owed", messages.nothingOwed],
    ["WrongLoanAmount", "loan-wrong-loan-amount", messages.wrongLoanAmount],
    ["InterestOverdue", "loan-interest-overdue", messages.interestOverdue],
    ["InterestOwed", "loan-interest-owed", messages.interestOwed],
    ["NotInDefault", "loan-not-in-default", messages.notInDefault],
    ["AlreadyDefaulted", "loan-already-defaulted", messages.alreadyDefaulted],
    ["SettleOpen", "loan-settle-open", messages.settleOpen],
    // Governance (ADR 0040) and exits (ADR 0039).
    ["NotAllowedToPropose", "not-allowed-to-propose", messages.notAllowedToPropose],
    ["TooManyOpenProposals", "too-many-proposals", messages.tooManyOpenProposals],
    ["TooManyOpenProposalsBy", "too-many-proposals-by", messages.tooManyOpenProposalsBy],
    ["NoEligibleVoters", "no-eligible-voters", messages.noEligibleVoters],
    ["RuleChangeInProgress", "rule-change-in-progress", messages.ruleChangeInProgress],
    ["InvalidRule", "invalid-rule", messages.invalidRule],
    ["NoPendingRuleChange", "no-pending-rule-change", messages.noPendingRuleChange],
    ["RuleChangeNotDue", "rule-change-not-due", messages.ruleChangeNotDue],
    ["InvalidWaiver", "invalid-waiver", messages.invalidWaiver],
    ["GuardianAlreadyOff", "guardian-already-off", messages.guardianAlreadyOff],
    ["ProposalNotOpen", "proposal-not-open", messages.proposalNotOpen],
    ["ProposalVotingClosed", "proposal-voting-closed", messages.proposalVotingClosed],
    ["CannotVoteOnProposal", "cannot-vote-on-proposal", messages.cannotVoteOnProposal],
    ["AlreadyVotedOnProposal", "already-voted-on-proposal", messages.alreadyVotedOnProposal],
    ["ProposalNotDecided", "proposal-not-decided", messages.proposalNotDecided],
    ["NotProposer", "not-proposer", messages.notProposer],
    ["CircleDissolved", "circle-dissolved", messages.circleDissolved],
    ["NotDissolved", "not-dissolved", messages.notDissolved],
    ["ClaimBlockedByLoan", "claim-blocked-by-loan", messages.claimBlockedByLoan],
    ["NothingToClaimYet", "nothing-to-claim-yet", messages.nothingToClaimYet],
    ["ProposalTooSoon", "proposal-too-soon", messages.proposalTooSoon],
    ["MemberExiting", "member-exiting", messages.memberExiting],
    ["PayoutGasTooLow", "payout-gas-too-low", messages.payoutGasTooLow],
    ["ExitAlreadyPending", "exit-already-pending", messages.exitAlreadyPending],
    ["NoExitPending", "no-exit-pending", messages.noExitPending],
    ["ExitNotReady", "exit-not-ready", messages.exitNotReady],
    ["MemberFrozen", "member-frozen", messages.memberFrozen],
    ["HasLoanTies", "has-loan-ties", messages.hasLoanTies],
    ["NotGuardian", "not-guardian", messages.notGuardian],
    ["GuardianOff", "guardian-off", messages.guardianOff],
    ["PauseTooSoon", "pause-too-soon", messages.pauseTooSoon],
    ["NotPaused", "not-paused", messages.notPaused],
    ["CirclePaused", "circle-paused", messages.circlePaused],
    // Payouts and cash (ADR 0037).
    ["NothingToWithdraw", "nothing-to-withdraw", messages.nothingToWithdraw],
    ["WithdrawFailed", "withdraw-failed", messages.withdrawFailed],
    ["InsufficientCash", "insufficient-cash", messages.insufficientCash],
    // USDT circles (ADR 0046).
    ["AvaxNotAccepted", "avax-not-accepted", messages.avaxNotAccepted],
    ["TokenAllowanceTooLow", "token-allowance-too-low", messages.tokenAllowanceTooLow],
    ["TokenBalanceTooLow", "token-balance-too-low", messages.tokenBalanceTooLow],
    ["TokenAmountMismatch", "token-amount-mismatch", messages.tokenAmountMismatch],
    ["UsdtNotAvailable", "usdt-not-available", messages.usdtNotAvailable],
    ["SafeERC20FailedOperation", "token-transfer-failed", messages.tokenTransferFailed],
  ];
  for (const [name, code, message] of membership) {
    if (hasName(name)) return friendlyError(code, message(), details);
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
