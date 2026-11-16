/** Loans: the Loans page, asking, repaying, the loan list and loan votes (ADR 0038). */
export const loans = {
  aMonth: "a month",
  rateMonth: "{rate} a month",
  amountMonth: "{amount} a month",
  range: "{from} to {to}",
  amountIn: "Amount in {symbol}",
  typeAmountUsdt: "Type an amount in USDT, like 25.",
  typeAmountAvax: "Type an amount in AVAX, like 0.25.",
  regular: "Regular",
  medical: "Medical",
  guarantor: "Guarantor",
  none: "None",
  borrower: "Borrower",
  type: "Type",
  votes: "Votes",
  sending: "Sending…",
  agreeing: "Agreeing…",
  backThisLoan: "Back this loan",
  backingToast: "You're backing {name}'s loan.",
  voteYesToast: "Vote counted: yes.",
  voteNoToast: "Vote counted: no.",
  voteSettledToast: "Vote settled.",
  withdrawnToast: "Loan request withdrawn.",
  settling: "Settling…",
  settleVote: "Settle the vote",
  voting: "Voting…",
  voteYes: "Vote yes",
  voteNo: "Vote no",
  withdrawing: "Withdrawing…",
  withdrawRequest: "Withdraw request",
  whyEnded: "Voting time is over.",
  whyOther:
    "You've voted on this one, or you can't vote on it: only members who could vote when it started, and are up to date, can.",

  limits: {
    fund: "Biggest loan the circle allows",
    fundExplain: "One loan can be at most {pct} of the circle's value.",
    stake: "Your savings limit",
    stakeExplainGuarantor: "{k} times your savings plus your guarantor's.",
    stakeExplain: "{k} times your savings. A guarantor's savings count too.",
    cash: "Cash free to lend",
    cashExplain: "Cash in the circle, minus the {pct} it always keeps back.",
    medical: "Medical loan limit",
    medicalExplain: "The most the circle lends for a medical need.",
  },

  cure: {
    allDue:
      "All three loan terms are over, so the whole loan is due. Pay the {amount} of interest and fees, then repay the rest of the loan, and the freeze lifts.",
    allDueNothing:
      "All three loan terms are over, so the whole loan is due. Repay it in full and the freeze lifts.",
    pay: "Pay the {amount} of interest and late fees you owe and the freeze lifts straight away.",
  },

  repayProblem: {
    overdueFirst: "Pay the overdue interest first. Then you can repay.",
    interestFirst: "Pay this month's interest ({amount}) first, then repay the loan in full.",
    coversAll: "That covers the whole loan. Choose Repay in full instead.",
  },

  filter: {
    all: "All",
    voting: "Voting",
    active: "Active",
    repaid: "Repaid",
    default: "Default",
    declined: "Didn't go ahead",
    anyType: "Any type",
    newest: "Newest",
    oldest: "Oldest",
    amount: "Biggest amount",
    rate: "Highest rate now",
  },

  status: {
    voting: "Voting",
    active: "Active",
    default: "In default",
    repaid: "Repaid",
    settled: "Settled from savings",
    declined: "Didn't go ahead",
  },

  settled: {
    approvedSettle: "Enough members voted yes. Anyone can settle it now.",
    approvedWaiting:
      "Enough members voted yes. The money goes out as soon as the guarantor agrees to back it.",
    approved: "Enough members voted yes. Anyone can settle it to send the money.",
    expired: "Voting time ran out before enough members voted. Anyone can record the result.",
    rejected: "There aren't enough yes votes for this to pass. Anyone can record the result.",
  },

  blocked: {
    dissolved: "This circle has voted to close, so no new loans start.",
    paused: "Loans are paused for a short time by the circle's guardian.",
    frozen: "You're frozen because of a loan in default, so you can't ask for a new one.",
    exiting: "You've asked to leave the circle, so you can't borrow. Stay to ask for a loan.",
    dormant: "Your payments are paused (dormant). Come back first, then you can ask.",
    notVoter: "You can ask for a loan once you can vote in this circle.",
    hasLoan: "You already have a loan. Repay it before asking for another.",
    hasRequest: "You already asked for a loan. Wait for the vote, or withdraw it.",
    guaranteeing:
      "You're backing someone else's loan. Your savings can back one loan at a time, so you can borrow once theirs is repaid.",
    tooFew: "Loans start once the circle has {min} members. It has {count}.",
  },

  page: {
    loading: "Loading loans",
    loadingShort: "Loading…",
    title: "Loans",
    subtitle:
      "{name} · borrow from the circle when you need to. Members vote, and the money goes out on its own.",
    guarantorRequest: "Guarantor request",
    yours: "Yours",
    yourLoan: "Your loan",
    loadingYourLoan: "Loading your loan",
    allLoans: "All loans",
    backingDefaultTitle: "{name}'s loan is in default",
    backingDefaultBody:
      "You back it, so you're frozen too until it's paid: no leaving and no new loans. If it isn't paid, the circle can vote to use your share after theirs.",
    backingTitle: "You're backing {name}'s loan",
    backingBody: "{amount} is still owed. You can leave the circle once it's repaid.",
  },

  tenor: {
    aria: "Loan terms",
    now: " (now)",
    overdue: "All three terms ended in {month}. The whole loan is due now.",
    dueBy: "The whole loan is due by the end of {month}. The rate steps up with each term.",
  },

  guarantorNotice: {
    aria: "Asked to be a guarantor",
    title: "{name} asked you to back a loan of {amount}",
    titleMedical: "{name} asked you to back a medical loan of {amount}",
    body: "Backing it means your savings count towards their limit. If they stop paying and the loan is marked as defaulted, you're frozen too: you can't leave or borrow, and the circle can vote to use your share to repay what their savings don't cover. You stay tied until the loan is repaid. If you do nothing, the request simply can't go ahead.",
  },

  ask: {
    button: "Ask for a loan",
    description:
      "The other members vote. If enough say yes, the money is sent to your wallet straight away. Nobody approves it by hand.",
    sent: "Loan request sent. The other members can vote on it in Votes.",
    tooBig: "That's more than you can ask for right now. The most is {amount}.",
    typeLegend: "Type of loan",
    regularText: "{rate} a month to start.",
    medicalText: "Up to {amount}, {months} months interest-free, once a year. Faster vote.",
    medicalOff: "This circle doesn't offer medical loans.",
    placeholder: "Up to {amount}",
    canAsk: "You can ask for up to {amount} right now.",
    guarantorOptional: "Guarantor (optional)",
    pickMember: "Pick a member",
    noGuarantor: "No guarantor",
    memberOption: "{name} · {amount} saved",
    guarantorHelp:
      "A guarantor is a member who backs your loan. Their savings raise your limit, and if the loan goes unpaid their share can be frozen and used. They must agree before the money is sent.",
    limitsAria: "Limits",
    yourLimits: "Your limits",
    overLimit: "Over this limit",
    withinLimit: "Within this limit",
    costAria: "What it costs",
    cost: "What it costs",
    costAt: "What it costs (at {amount})",
    interestStarts:
      "Interest starts in {month}. Pay it by day {day} of each month (UTC); it's worked out on what you still owe at the start of the month.",
    interestStartsFree:
      "Interest starts in {month} (the first {free} months are free). Pay it by day {day} of each month (UTC); it's worked out on what you still owe at the start of the month.",
    repayAny: "Repay any part whenever you like. The whole loan is due by the end of {month}.",
    minimum: "Repaying in the month you borrow still costs one month's interest ({amount}).",
    late_one:
      "Late interest costs {fee} a month extra. After {count} late month, anyone can mark the loan as defaulted, which freezes you.",
    late_other:
      "Late interest costs {fee} a month extra. After {count} late months, anyone can mark the loan as defaulted, which freezes you.",
    lateGuarantor_one:
      "Late interest costs {fee} a month extra. After {count} late month, anyone can mark the loan as defaulted, which freezes you and your guarantor.",
    lateGuarantor_other:
      "Late interest costs {fee} a month extra. After {count} late months, anyone can mark the loan as defaulted, which freezes you and your guarantor.",
    noCashTitle: "No cash free to lend",
    noCashBody:
      "Everything above the reserve is lent out right now. Try again after someone repays.",
    needsGuarantor: "This circle needs a guarantor for every loan",
    typeFirst: "Type an amount first",
    submit: "Ask the circle",
  },

  list: {
    statusAria: "Status",
    typeAria: "Type",
    sort: "Sort",
    searchLabel: "Search by borrower name or address",
    searchPlaceholder: "Search borrower name or address",
    partial:
      "This circle is older than the history we can read quickly, so only recent loans are listed. Full history arrives with the activity indexer.",
    loading: "Reading the circle's loans",
    empty:
      "Nobody has asked for a loan yet. When someone does, it shows up here with its vote and repayments.",
    noMatch: "No loans match. Try another name, or show all loans.",
    tableAria: "Loans",
    amount: "Amount ({symbol})",
    status: "Status",
    rateNow: "Rate now",
    asked: "Asked",
    actions: "Actions",
    you: "You",
    backedBy: "{type} · backed by {name}",
    left: "{amount} left",
    interestLate_one: "Interest {count} month late",
    interestLate_other: "Interest {count} months late",
    noun: "loans",
    markedToast: "{name}'s loan is marked as defaulted.",
    mark: "Mark as defaulted",
    markTitle: "Mark {name}'s loan as defaulted?",
    markDescription:
      "Their interest is late long enough, or all three loan terms are over, so the rules allow it.",
    markBody:
      "{name} will be frozen: no leaving and no new loans. Nothing is taken yet. Paying what's owed lifts the freeze; if it stays unpaid, the circle can vote to repay it from their savings.",
    markBodyGuarantor:
      "{name} and their guarantor will be frozen: no leaving and no new loans. Nothing is taken yet. Paying what's owed lifts the freeze; if it stays unpaid, the circle can vote to repay it from their savings.",
    marking: "Marking…",
    markYes: "Yes, mark as defaulted",
    settledNowToast: "{name}'s loan was settled from their savings.",
    settleStartedToast: "Settle vote started for {name}'s loan. Your yes is counted.",
    settleNow: "Settle from savings now",
    askSettle: "Ask the circle to settle",
  },

  request: {
    titleSettle: "Settle {name}'s default",
    titleLoan: "{amount} for {name}",
    whyBorrower: "It's your loan, so you can't vote on it.",
    whyGuarantor: "You backed this loan, so you can't vote on settling it.",
    ariaSettle: "Settle vote",
    ariaLoan: "Loan request",
    eyebrowSettle: "Settle a default",
    eyebrowMedical: "Medical loan request",
    eyebrowLoan: "Loan request",
    settleBody:
      "{name}'s loan is in default with {amount} still owed. If this passes, {name}'s savings repay it at today's value. Anything still uncovered is shared by everyone through the share value. If {name} pays up first, the vote is called off. {name} can't vote on it.",
    settleBodyGuarantor:
      "{name}'s loan is in default with {amount} still owed. If this passes, {name}'s savings repay it at today's value, then {guarantor}'s as guarantor. Anything still uncovered is shared by everyone through the share value. If {name} pays up first, the vote is called off. {name} and {guarantor} can't vote on it.",
    agreed: "{name}, agreed",
    notAgreed: "{name}, not agreed yet",
  },

  my: {
    eyebrowMedical: "Your loan · medical",
    none: "You don't have a loan",
    noneBody:
      "When you need money, ask the circle. The members vote, and if enough say yes the {symbol} arrives in your wallet on its own. Interest goes back into the circle and lifts everyone's share, yours included.",
    interest: "Interest",
    interestHint: "To start; it steps up each term",
    eachTerm: "Each term",
    termMonths: "{months} months",
    termHint: "Three terms, then the loan is due",
    noInterestToast: "There's no interest to pay right now.",
    noInterest: "There's no interest to pay right now",
    interestPaid: "Interest paid: {amount}. Thank you.",
    stillOwed: "{symbol} still owed",
    borrowed: "You borrowed {amount} in {month}.",
    borrowedBacked: "You borrowed {amount} in {month} · backed by {name}.",
    frozenTitle: "Your loan is in default, so you're frozen",
    frozenBody:
      "While frozen you can't leave the circle or ask for a new loan. If it stays unpaid, the members can vote to repay it from your savings. {cure}",
    frozenBodyGuarantor:
      "While frozen you can't leave the circle or ask for a new loan, and neither can your guarantor. If it stays unpaid, the members can vote to repay it from your savings, then your guarantor's. {cure}",
    lateTitle: "Your interest is late",
    lateUnpaid_one: "{count} month is unpaid, with {fee} added for each late month.",
    lateUnpaid_other: "{count} months are unpaid, with {fee} added for each late month.",
    lateAfter_one:
      "After {count} late month, anyone in the circle can mark the loan as defaulted, which freezes you. Pay now to stay clear.",
    lateAfter_other:
      "After {count} late months, anyone in the circle can mark the loan as defaulted, which freezes you. Pay now to stay clear.",
    lateAfterGuarantor_one:
      "After {count} late month, anyone in the circle can mark the loan as defaulted, which freezes you and your guarantor. Pay now to stay clear.",
    lateAfterGuarantor_other:
      "After {count} late months, anyone in the circle can mark the loan as defaulted, which freezes you and your guarantor. Pay now to stay clear.",
    interestNow: "Interest to pay now",
    includesFees: "Includes {amount} in late fees",
    dueByDay: "Due by day {day} (UTC); paying early is fine",
    interestStartsIn: "Interest starts in {month}",
    allPaid: "All paid up for this month",
    firstRate: "First rate",
    rateNow: "Rate now",
    freeMonth: "Interest-free month",
    closeToday: "To close it today",
    includesMinimum: "Includes {amount}: one month's minimum interest",
    interestFirst: "Pay the interest first, then this",
    noExtra: "What you still owe; no extra interest",
    payInterest: "Pay interest",
    repay: "Repay",
    repaidFull: "Loan repaid in full. It's closed, and you're free to ask again whenever you need.",
    repaidPart: "Repaid {amount}. {left} left to repay.",
    repayTitle: "Repay your loan",
    repayDescription:
      "Repaying lowers next month's interest. This month's interest stays on what you owed at the start of the month.",
    howMuch: "How much",
    repayFull: "Repay in full",
    repayPart: "Repay part",
    fullHint: "{amount} closes the loan",
    partHint: "Any amount below what you owe",
    lessThan: "Less than {amount}",
    includesRule17:
      "This includes {amount}: a loan repaid before any interest was charged still pays one month's interest (rule 17).",
    loadingRequest: "Loading your loan request…",
    eyebrowRequest: "Your loan request",
    eyebrowRequestMedical: "Your loan request · medical",
    askedFor: "{symbol} asked for",
    agreedHint: "Has agreed to back your loan",
    notAgreedHint: "Hasn't agreed yet. The money goes out only after they do.",
  },
} as const;
