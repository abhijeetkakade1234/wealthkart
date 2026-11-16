/** The join page: founder invites, asking to join and following the vote. */
export const join = {
  loadingCircle: "Loading the circle",
  youreMember: "You're a member of {name}.",
  openCircle: "Open the circle",
  inviteExpired: "Your founder invite expired. You can still ask to join; the members will vote.",
  subtitleFounder: "You've been invited as a founder.",
  subtitleJoin: "You've been invited to join this circle.",

  // Circle facts
  factMoney: "Money",
  moneyUsdt: "USDT (network fees in AVAX)",
  factEachMonth: "Each month",
  factDue: "Due",
  dueValue: "Day {day}, 23:59 UTC",
  factLateFees: "Late fees",
  lateFeesValue: "{fee1} {symbol} after day {day}, {fee2} more after day {day2}",
  factMembers: "Members",
  membersOf: "{count} of {max}",
  factJoining: "Joining",
  joiningValue: "{quorum}% of members vote, {pass}% yes to get in, {window} to vote",
  windowDays: "{count} days",
  windowHours: "{count} hours",

  // Founder invite
  founderToast: "Welcome in. You're a founder of this circle now.",
  declinedToast: "Invite declined. Nothing else changes.",
  founderBody:
    "The person who started this circle named you as a founder. Accept to become a member straight away, with no vote. You start paying from the next due date that hasn't passed yet.",
  inviteExpires: "Invite expires",
  joining: "Joining…",
  accept: "Accept invite",
  declining: "Declining…",
  decline: "Decline",

  // Ask to join
  sentToast: "Request sent. The members will vote on it.",
  full: "This circle is full. It has reached the member limit its rules set.",
  askToJoin: "Ask to join",
  askBody:
    "Pick the name members will see, then send your request. The members vote: enough of them must take part, and {pct}% of votes must be yes. Nothing is paid now; your first installment is due after you're in.",
  invitedBy:
    "Invited by <b>{name}</b>. Members will see this; it counts as confirmed once they vote yes.",
  tooMany: "Too many people are waiting to join right now. Try again after the members vote.",
  sending: "Sending…",
  tooManyReason: "Too many requests waiting",

  // Request status
  loadingRequest: "Loading your request",
  cancelledToast: "Request cancelled.",
  askAgain: "Ask again",
  waitingTitle: "Waiting for votes",
  waitingBody_one:
    "You asked to join as <b>{name}</b>. At least {need} of {count} member must vote.",
  waitingBody_other:
    "You asked to join as <b>{name}</b>. At least {need} of {count} members must vote.",
  cancelling: "Cancelling…",
  cancelRequest: "Cancel my request",
} as const;
