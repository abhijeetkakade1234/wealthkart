import { registerEn } from "../registry";

/** Activity page and the feed sentences built from circle events (PLAN.md D7). */
export const activity = {
  // Page
  title: "Activity",
  subtitle: "{circle} · every payment, loan, member change and vote, straight from the blockchain.",
  loading: "Loading activity",
  show: "Show",
  filterAll: "Everything",
  filterPayment: "Payments",
  filterMember: "Members",
  filterVote: "Votes",
  filterLoan: "Loans",
  searchLabel: "Search by name, address or transaction",
  searchPlaceholder: "Search name, address or tx",
  partial:
    "This circle is older than the history we can read quickly, so only recent activity is shown. Full history arrives with the activity indexer.",
  reading: "Reading the circle's history",
  emptyNone:
    "Nothing has happened in this circle yet. Payments, new members and votes will show up here.",
  emptyNoMatch: "Nothing matches. Try another name, or show everything.",
  viewTx: "View this transaction on Snowtrace",
  snowtrace: "Snowtrace",

  // Request status words (Membership.Status)
  statusNone: "none",
  statusOpen: "open",
  statusApproved: "approved",
  statusRejected: "rejected",
  statusExpired: "expired",
  statusCancelled: "cancelled",
  statusFull: "full",

  // Payments
  paidLate: "{name} paid {month}: {amount} {symbol} plus {fees} {symbol} in late fees.",
  paidOnTime: "{name} paid {month}: {amount} {symbol}, on time.",
  holiday: "{name} took a payment holiday for {month}.",

  // Members
  joined: "{name} joined the circle.",
  founderInvited: "{name} was invited as a founder.",
  founderDeclined: "{name} turned down the founder invite.",
  renamed: "{address} is now called {name}.",
  canVote: "{name} can vote now.",
  dormant: "{name} is dormant: payments paused, savings untouched.",
  woke: "{name} is back and paying again.",

  // Join and dormant votes
  askedToJoinInvited: "{name} asked to join, invited by {inviter}.",
  askedToJoin: "{name} asked to join.",
  dormantProposed: "{proposer} asked the circle to pause {name}'s payments (marked dormant).",
  votedYesRequest: "{voter} voted yes on request {id}.",
  votedNoRequest: "{voter} voted no on request {id}.",
  votedYesJoin: "{voter} voted yes on letting {name} join.",
  votedNoJoin: "{voter} voted no on letting {name} join.",
  votedYesPause: "{voter} voted yes on pausing {name}.",
  votedNoPause: "{voter} voted no on pausing {name}.",
  voteClosedAnon: "Vote {id} closed: {status}.",
  dormantApproved: "Vote closed: {name}'s payments are paused.",
  dormantCancelled: "Vote closed: {name} caught up, so nothing changed.",
  dormantOther: "Vote closed: {name} stays active ({status}).",
  joinApproved: "Vote closed: {name} is in.",
  joinRejected: "Vote closed: {name} wasn't voted in.",
  joinExpired: "Vote closed: time ran out before enough members voted on {name}.",
  joinCancelled: "{name} withdrew their request to join.",
  joinFull: "Vote closed: {name} was voted in, but the circle was already full.",
  joinOther: "Vote on {name} closed.",

  // Loans
  loanAskedBacked: "{name} asked for a loan of {amount}, with {guarantor} as guarantor.",
  loanAsked: "{name} asked for a loan of {amount}.",
  medicalAskedBacked: "{name} asked for a medical loan of {amount}, with {guarantor} as guarantor.",
  medicalAsked: "{name} asked for a medical loan of {amount}.",
  guaranteeAccepted: "{guarantor} agreed to back {name}'s loan.",
  settleProposed:
    "{proposer} asked the circle to settle {name}'s defaulted loan from their savings.",
  loanVotedYesRequest: "{voter} voted yes on loan request {id}.",
  loanVotedNoRequest: "{voter} voted no on loan request {id}.",
  loanVotedYesSettle: "{voter} voted yes on settling {name}'s loan.",
  loanVotedNoSettle: "{voter} voted no on settling {name}'s loan.",
  loanVotedYes: "{voter} voted yes on {name}'s loan.",
  loanVotedNo: "{voter} voted no on {name}'s loan.",
  loanRejected: "{name}'s loan request didn't pass.",
  loanRejectedAnon: "A loan request didn't pass.",
  settleRejected: "{name}'s settle vote didn't pass.",
  loanExpired: "{name}'s loan request ran out of time before enough members voted.",
  loanExpiredAnon: "A loan request ran out of time before enough members voted.",
  settleExpired: "{name}'s settle vote ran out of time before enough members voted.",
  settleCancelled: "{name}'s loan was paid up first, so the settle vote was called off.",
  loanCancelled: "{name}'s loan request was withdrawn.",
  loanCancelledAnon: "A loan request was withdrawn.",
  loanFailed:
    "{name}'s loan request passed but couldn't be paid out (cash, limits or the guarantor).",
  loanFailedAnon: "A loan request passed but couldn't be paid out (cash, limits or the guarantor).",
  loanClosed: "{name}'s loan request closed.",
  loanClosedAnon: "A loan request closed.",
  settleClosed: "{name}'s settle vote closed.",
  disbursed: "{name} received a loan of {amount}.",
  interestPaidFees: "{name} paid {interest} of loan interest plus {fees} in late fees.",
  interestPaid: "{name} paid {interest} of loan interest.",
  repaidFullMin:
    "{name} repaid their loan in full: {amount} plus {min} for the minimum month of interest.",
  repaidFull: "{name} repaid their loan in full: {amount}.",
  repaidPart: "{name} repaid {amount} of their loan. {remaining} left.",
  defaultedBacked:
    "{name}'s loan was marked as defaulted. {name} and guarantor {guarantor} are frozen until it's paid.",
  defaulted: "{name}'s loan was marked as defaulted. {name} is frozen until it's paid.",
  cured: "{name} caught up on their loan, so the default is lifted.",
  settled: "{name}'s defaulted loan was settled: {fromBorrower} from their savings.",
  settledWithGuarantor:
    "{name}'s defaulted loan was settled: {fromBorrower} from their savings and {fromGuarantor} from {guarantor}'s.",
  settledLoss: "{lost} couldn't be covered and is shared by everyone.",
} as const;

registerEn("activity", activity);
