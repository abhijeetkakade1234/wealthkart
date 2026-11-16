/**
 * Plain-language message catalogue (docs/ui.md §12, ADR 0026).
 *
 * Every message the user reads about a result or a problem comes from here.
 * Writing rules: say what happened, then what to do. No jargon, no error codes
 * (codes go under "Details"), no blame, short sentences, no emojis.
 *
 * Amounts are passed in already formatted (e.g. "0.50") so this file never does
 * money maths; formatting AVAX from wei is the job of the amount helpers.
 *
 * The words live in `src/i18n/{en,hi,mr}/msg.ts` (ADR 0057). Each function reads the active
 * language when it is called, so names, signatures and error codes stay the same.
 */
import { t, tn } from "@/i18n/runtime";

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
  userRejected: () => t("msg.userRejected"),
  insufficientAvax: (p?: InsufficientAvaxParams) =>
    p ? t("msg.insufficientAvaxDetail", { ...p }) : t("msg.insufficientAvax"),
  wrongNetwork: () => t("msg.wrongNetwork"),
  networkUnreachable: () => t("msg.networkUnreachable"),
  timeout: () => t("msg.timeout"),
  unknown: () => t("msg.unknown"),

  // Transactions the circle contract turned down
  alreadyPaid: (month?: string) =>
    month ? t("msg.alreadyPaidMonth", { month }) : t("msg.alreadyPaid"),
  amountChanged: () => t("msg.amountChanged"),
  notMember: () => t("msg.notMember"),
  holidayTooLate: () => t("msg.holidayTooLate"),
  holidayAlreadyTaken: () => t("msg.holidayAlreadyTaken"),
  holidayLimitReached: () => t("msg.holidayLimitReached"),
  monthAlreadyPaid: () => t("msg.monthAlreadyPaid"),
  notAvailableYet: () => t("msg.notAvailableYet"),
  voteClosed: () => t("msg.voteClosed"),
  loanAboveCap: (maxAvax?: string) =>
    maxAvax ? t("msg.loanAboveCapMax", { max: maxAvax }) : t("msg.loanAboveCap"),

  // Membership (ADR 0028, 0029)
  notACircle: () => t("msg.notACircle"),
  noFounderInvite: () => t("msg.noFounderInvite"),
  founderInviteExpired: () => t("msg.founderInviteExpired"),
  alreadyMember: () => t("msg.alreadyMember"),
  requestAlreadyOpen: () => t("msg.requestAlreadyOpen"),
  tooManyOpenRequests: () => t("msg.tooManyOpenRequests"),
  circleFull: () => t("msg.circleFull"),
  inviterNotMember: () => t("msg.inviterNotMember"),
  invalidDisplayName: () => t("msg.invalidDisplayName"),
  nameTaken: () => t("msg.nameTaken"),
  nameChangeTooSoon: (when?: string) =>
    when ? t("msg.nameChangeTooSoonWhen", { when }) : t("msg.nameChangeTooSoon"),
  requestNotOpen: () => t("msg.requestNotOpen"),
  notEligibleToVote: () => t("msg.notEligibleToVote"),
  alreadyVoted: () => t("msg.alreadyVoted"),
  notDecidedYet: () => t("msg.notDecidedYet"),
  noOpenRequest: () => t("msg.noOpenRequest"),
  memberIsDormant: () => t("msg.memberIsDormant"),
  notDormant: () => t("msg.notDormant"),
  notOverdueEnough: () => t("msg.notOverdueEnough"),
  noOtherVoters: () => t("msg.noOtherVoters"),
  nothingToWithdraw: () => t("msg.nothingToWithdraw"),
  withdrawFailed: () => t("msg.withdrawFailed"),
  insufficientCash: () => t("msg.insufficientCash"),
  // USDT circles (ADR 0046).
  avaxNotAccepted: () => t("msg.avaxNotAccepted"),
  tokenAllowanceTooLow: () => t("msg.tokenAllowanceTooLow"),
  tokenBalanceTooLow: () => t("msg.tokenBalanceTooLow"),
  needGasAvax: (fee: string) => t("msg.needGasAvax", { fee }),
  /** Checked before anything is sent, so the member never approves a payment they can't make. */
  notEnoughToken: (p: { needed: string; have: string; symbol: string }) =>
    t("msg.notEnoughToken", { ...p }),
  tokenAmountMismatch: () => t("msg.tokenAmountMismatch"),
  tokenTransferFailed: () => t("msg.tokenTransferFailed"),
  usdtNotAvailable: () => t("msg.usdtNotAvailable"),
  // Test USDT faucet, test network builds only (ADR 0053)
  testUsdtNote: (amount: string) => t("msg.testUsdtNote", { amount }),
  testUsdtAdded: (amount: string) => t("msg.testUsdtAdded", { amount }),
  notAllowedToPropose: () => t("msg.notAllowedToPropose"),
  tooManyOpenProposals: () => t("msg.tooManyOpenProposals"),
  tooManyOpenProposalsBy: () => t("msg.tooManyOpenProposalsBy"),
  noEligibleVoters: () => t("msg.noEligibleVoters"),
  ruleChangeInProgress: () => t("msg.ruleChangeInProgress"),
  invalidRule: () => t("msg.invalidRule"),
  noPendingRuleChange: () => t("msg.noPendingRuleChange"),
  ruleChangeNotDue: () => t("msg.ruleChangeNotDue"),
  invalidWaiver: () => t("msg.invalidWaiver"),
  guardianAlreadyOff: () => t("msg.guardianAlreadyOff"),
  proposalNotOpen: () => t("msg.proposalNotOpen"),
  proposalVotingClosed: () => t("msg.proposalVotingClosed"),
  cannotVoteOnProposal: () => t("msg.cannotVoteOnProposal"),
  alreadyVotedOnProposal: () => t("msg.alreadyVotedOnProposal"),
  proposalNotDecided: () => t("msg.proposalNotDecided"),
  notProposer: () => t("msg.notProposer"),
  circleDissolved: () => t("msg.circleDissolved"),
  notDissolved: () => t("msg.notDissolved"),
  claimBlockedByLoan: () => t("msg.claimBlockedByLoan"),
  // Backup wallet (nominee), ADR 0016 and 0056.
  invalidNominee: () => t("msg.invalidNominee"),
  notNominee: () => t("msg.notNominee"),
  nomineeClaimPending: () => t("msg.nomineeClaimPending"),
  noNomineeClaim: () => t("msg.noNomineeClaim"),
  nomineeSaved: () => t("msg.nomineeSaved"),
  nomineeCleared: () => t("msg.nomineeCleared"),
  nomineeClaimCancelled: () => t("msg.nomineeClaimCancelled"),
  nomineeClaimRequested: () => t("msg.nomineeClaimRequested"),
  nothingToClaimYet: () => t("msg.nothingToClaimYet"),
  proposalTooSoon: () => t("msg.proposalTooSoon"),
  memberExiting: () => t("msg.memberExiting"),
  payoutGasTooLow: () => t("msg.payoutGasTooLow"),
  exitAlreadyPending: () => t("msg.exitAlreadyPending"),
  noExitPending: () => t("msg.noExitPending"),
  exitNotReady: () => t("msg.exitNotReady"),
  memberFrozen: () => t("msg.memberFrozen"),
  hasLoanTies: () => t("msg.hasLoanTies"),
  notGuardian: () => t("msg.notGuardian"),
  guardianOff: () => t("msg.guardianOff"),
  pauseTooSoon: () => t("msg.pauseTooSoon"),
  notPaused: () => t("msg.notPaused"),
  circlePaused: () => t("msg.circlePaused"),
  loansClosed: () => t("msg.loansClosed"),
  loansPaused: () => t("msg.loansPaused"),
  notAVoter: () => t("msg.notAVoter"),
  loanRequestOpen: () => t("msg.loanRequestOpen"),
  loanActive: () => t("msg.loanActive"),
  tooFewMembers: () => t("msg.tooFewMembers"),
  zeroAmount: () => t("msg.zeroAmount"),
  amountTooLarge: () => t("msg.amountTooLarge"),
  medicalLoansOff: () => t("msg.medicalLoansOff"),
  medicalLoanThisYear: () => t("msg.medicalLoanThisYear"),
  guarantorRequired: () => t("msg.guarantorRequired"),
  invalidGuarantor: () => t("msg.invalidGuarantor"),
  alreadyGuaranteeing: () => t("msg.alreadyGuaranteeing"),
  notYourGuarantee: () => t("msg.notYourGuarantee"),
  noOtherLoanVoters: () => t("msg.noOtherLoanVoters"),
  loanRequestNotOpen: () => t("msg.loanRequestNotOpen"),
  loanVotingClosed: () => t("msg.loanVotingClosed"),
  cannotVoteOnLoan: () => t("msg.cannotVoteOnLoan"),
  alreadyVotedOnLoan: () => t("msg.alreadyVotedOnLoan"),
  loanNotDecidedYet: () => t("msg.loanNotDecidedYet"),
  guaranteeNotAccepted: () => t("msg.guaranteeNotAccepted"),
  disbursalBlocked: () => t("msg.disbursalBlocked"),
  noLoanRequest: () => t("msg.noLoanRequest"),
  noLoan: () => t("msg.noLoan"),
  nothingOwed: () => t("msg.nothingOwed"),
  wrongLoanAmount: () => t("msg.wrongLoanAmount"),
  interestOverdue: () => t("msg.interestOverdue"),
  interestOwed: () => t("msg.interestOwed"),
  notInDefault: () => t("msg.notInDefault"),
  alreadyDefaulted: () => t("msg.alreadyDefaulted"),
  settleOpen: () => t("msg.settleOpen"),
  exitGasTooLow: () => t("msg.exitGasTooLow"),
  tooManyOpenRequestsBy: () => t("msg.tooManyOpenRequestsBy"),

  // Success
  paid: (month: string, amount: string, symbol = "AVAX") =>
    t("msg.paid", { month, amount, symbol }),
  voted: (votes: number, members: number) => t("msg.voted", { votes, members }),
  /** Without `what`, "Address copied." in the active language. */
  copied: (what?: string) => (what ? t("msg.copied", { what }) : t("msg.addressCopied")),

  // Reminders (ADR 0052)
  remindersNotSetUp: () => t("msg.remindersNotSetUp"),
  remindersUnsupported: () => t("msg.remindersUnsupported"),
  remindersIosInstall: () => t("msg.remindersIosInstall"),
  remindersDenied: () => t("msg.remindersDenied"),
  remindersOtherWallet: (who: string) => t("msg.remindersOtherWallet", { who }),
  remindersOn: () => t("msg.remindersOn"),
  remindersOff: () => t("msg.remindersOff"),
  remindersSaved: () => t("msg.remindersSaved"),
  remindersTestSent: () => t("msg.remindersTestSent"),
  remindersTestFailed: () => t("msg.remindersTestFailed"),
  remindersDeviceGone: () => t("msg.remindersDeviceGone"),
  remindersBusy: () => t("msg.remindersBusy"),
  remindersFailed: () => t("msg.remindersFailed"),
  remindersCircleUnknown: () => t("msg.remindersCircleUnknown"),

  // UI states (docs/ui.md §10)
  offline: () => t("msg.offline"),
  staleNote: (minutesAgo: number) => {
    if (minutesAgo < 1) return t("msg.staleLessThanMinute");
    if (minutesAgo < 60) return tn("msg.staleMinutes", Math.round(minutesAgo));
    return tn("msg.staleHours", Math.round(minutesAgo / 60));
  },
  loadFailed: () => t("msg.loadFailed"),
  txFailed: () => t("msg.txFailed"),

  // Access cards
  accessNoWalletTitle: () => t("msg.accessNoWalletTitle"),
  accessNoWalletBody: () => t("msg.accessNoWalletBody"),
  accessWrongNetworkTitle: () => t("msg.accessWrongNetworkTitle"),
  accessWrongNetworkBody: () => t("msg.accessWrongNetworkBody"),
  accessNotMemberTitle: () => t("msg.accessNotMemberTitle"),
  accessNotMemberBody: () => t("msg.accessNotMemberBody"),

  // Error boundaries (docs/ui.md §11)
  appErrorTitle: () => t("msg.appErrorTitle"),
  pageErrorTitle: () => t("msg.pageErrorTitle"),
  widgetErrorTitle: (name?: string) =>
    name ? t("msg.widgetErrorTitleNamed", { name }) : t("msg.widgetErrorTitle"),
  widgetErrorBody: () => t("msg.widgetErrorBody"),

  // First-run checklist on the home screen (ADR 0054)
  checklistHidden: () => t("msg.checklistHidden"),
  checklistCantCheck: () => t("msg.checklistCantCheck"),

  // Transaction tracker
  txStepConfirm: () => t("msg.txStepConfirm"),
  txStepSending: () => t("msg.txStepSending"),
  txStepConfirmed: () => t("msg.txStepConfirmed"),
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
  | "invalid-nominee"
  | "not-nominee"
  | "nominee-claim-pending"
  | "no-nominee-claim"
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
  // Vaults before ADR 0050 refused mainnet; current ones don't. Kept for those old builds.
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
    // Backup wallet (ADR 0056).
    ["InvalidNominee", "invalid-nominee", messages.invalidNominee],
    ["NotNominee", "not-nominee", messages.notNominee],
    ["NomineeClaimPending", "nominee-claim-pending", messages.nomineeClaimPending],
    ["NoNomineeClaim", "no-nominee-claim", messages.noNomineeClaim],
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
