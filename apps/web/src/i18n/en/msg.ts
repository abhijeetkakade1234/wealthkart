/**
 * The plain-language message catalogue (docs/ui.md §12, ADR 0026). `src/lib/messages.ts`
 * keeps the function names and error codes; the words live here.
 */
export const msg = {
  // Wallet and network problems
  userRejected: "You cancelled this in Core. Nothing was sent.",
  insufficientAvaxDetail:
    "Not enough AVAX in your wallet. You need {needed} AVAX ({amount} + about {fee} network fee).",
  insufficientAvax: "Not enough AVAX in your wallet to cover this and the network fee.",
  wrongNetwork: "Your wallet is on the wrong network. Switch to Avalanche to continue.",
  networkUnreachable:
    "We can't reach the Avalanche network right now. Your money is safe. Try again in a minute.",
  timeout:
    "This is taking longer than usual. It may still go through; we'll update this page when it does.",
  unknown:
    "Something went wrong on our side. Your money is safe. Try again, or share the details with your circle admin.",

  // Transactions the circle contract turned down
  alreadyPaidMonth: "You've already paid for {month}.",
  alreadyPaid: "You've already paid for this month.",
  amountChanged:
    "The amount due just changed, usually because a late fee started. Check the new amount and try again.",
  notMember: "This wallet isn't a member of this circle.",
  holidayTooLate:
    "It's past this month's due date, so a payment holiday can't be taken now. Pay as soon as you can to keep fees low.",
  holidayAlreadyTaken: "You've already taken a payment holiday for this month.",
  holidayLimitReached: "You've used all your payment holidays for this year.",
  monthAlreadyPaid: "You've already paid this month, so there's nothing to delay.",
  notAvailableYet:
    "Circles aren't open on the main Avalanche network yet. Use the Fuji test network for now.",
  voteClosed: "This vote has already ended.",
  loanAboveCapMax:
    "This loan is bigger than the circle allows for you right now. The most you can ask for is {max} AVAX.",
  loanAboveCap: "This loan is bigger than the circle allows for you right now.",

  // Membership (ADR 0028, 0029)
  notACircle:
    "This link doesn't point to a WealthKart circle. Don't send it any money; ask your friend for the link again.",
  noFounderInvite: "There's no founder invite for this wallet in this circle.",
  founderInviteExpired:
    "Your founder invite has expired. You can still ask to join; the members will vote.",
  alreadyMember: "This wallet is already a member of this circle.",
  requestAlreadyOpen:
    "You've already asked to join. Wait for the vote, or cancel your request first.",
  tooManyOpenRequests:
    "This circle has too many people waiting to join right now. Try again after the members vote.",
  circleFull: "This circle is full. It has reached the member limit its rules set.",
  inviterNotMember:
    "The friend who invited you isn't a member of this circle, so we can't show them as your inviter.",
  invalidDisplayName:
    "Names need 3 to 24 letters, numbers, spaces, dots, dashes or underscores, with no space at the start or end.",
  nameTaken: "Someone in this circle already uses that name. Try another one.",
  nameChangeTooSoonWhen: "You changed your name recently. You can change it again on {when}.",
  nameChangeTooSoon: "You changed your name recently. You can change it again after 30 days.",
  requestNotOpen: "This join request has already been settled.",
  notEligibleToVote:
    "You can't vote on this one. Only members who joined before the request, and are at most one month behind, can vote.",
  alreadyVoted: "You've already voted on this request.",
  notDecidedYet: "The vote isn't decided yet. It can be settled once the voting time ends.",
  noOpenRequest: "You don't have a join request waiting in this circle.",
  memberIsDormant:
    "Your payments are paused because the circle marked you dormant. Wake up on the circle page, or just pay, to come back.",
  notDormant: "You're already active in this circle.",
  notOverdueEnough:
    "They haven't missed enough months yet. The circle can only pause someone's payments after the number of missed months it agreed on.",
  noOtherVoters: "There's nobody else in the circle who could vote on this yet.",
  nothingToWithdraw: "There's nothing waiting for you to withdraw.",
  withdrawFailed:
    "Your wallet didn't accept the payout. Try again from a wallet that can receive it.",
  insufficientCash:
    "The circle doesn't have enough cash for this right now. Some of its money is lent out.",
  // USDT circles (ADR 0046)
  avaxNotAccepted: "This circle is paid in USDT. Send the payment without any AVAX attached.",
  tokenAllowanceTooLow:
    "Approve the USDT payment in your wallet first, then pay. If the amount changed, approve again.",
  tokenBalanceTooLow: "Your wallet doesn't have enough USDT for this payment.",
  needGasAvax:
    "Network fees are paid in AVAX, even in a USDT circle. Add about {fee} AVAX to your wallet, then pay.",
  notEnoughToken:
    "Your wallet has {have} {symbol}, but this payment needs {needed} {symbol}. Add {symbol} to your wallet, then try again.",
  tokenAmountMismatch:
    "The USDT token took a bigger fee than the circle accepts (1%), so the payment was refused. Nothing was taken.",
  tokenTransferFailed:
    "The USDT transfer didn't go through. Check your USDT balance and approval, then try again.",
  usdtNotAvailable:
    "USDT circles aren't available on this network yet. Choose AVAX for this circle.",
  // Test USDT faucet, test network builds only (ADR 0053)
  testUsdtNote:
    "You're on the test network. Test USDT has no value; it only lets you try USDT circles. Each tap adds {amount}.",
  testUsdtAdded:
    "Added {amount} test USDT to your wallet. It has no value and only works on the test network.",
  notAllowedToPropose: "Only members who can vote right now can start a proposal.",
  tooManyOpenProposals: "There are already 10 open proposals. Wait for some to be decided first.",
  tooManyOpenProposalsBy: "You already have 2 open proposals. Wait until one is decided.",
  noEligibleVoters: "There's nobody who could vote on this yet.",
  ruleChangeInProgress:
    "A rule change is already being voted on or waiting to apply. One at a time.",
  invalidRule:
    "One of these settings is outside what a circle allows. Check the numbers and try again.",
  noPendingRuleChange: "There's no rule change waiting to apply.",
  ruleChangeNotDue: "The new rules can't apply yet. They start once the waiting period ends.",
  invalidWaiver:
    "That month can't be waived: it must be a started, unpaid month that isn't waived already.",
  guardianAlreadyOff: "The guardian is already switched off for this circle.",
  proposalNotOpen: "This proposal is already decided or was withdrawn.",
  proposalVotingClosed: "Voting on this proposal has closed.",
  cannotVoteOnProposal:
    "You can't vote on this one: only members who could vote when it started, and are up to date, can.",
  alreadyVotedOnProposal: "You've already voted on this proposal.",
  proposalNotDecided: "The vote isn't decided yet. It can be settled once the voting time ends.",
  notProposer: "Only the member who started this proposal can withdraw it.",
  circleDissolved:
    "This circle has voted to close. Payments have stopped; members can claim their share.",
  notDissolved: "The circle hasn't voted to close, so there's nothing to claim yet.",
  claimBlockedByLoan:
    "Your loan, or the loan you guarantee, must be repaid or settled before you can claim.",
  // Backup wallet (nominee), ADR 0016 and 0056
  invalidNominee:
    "That wallet can't be your backup: it's your own wallet or the circle itself. Pick someone else's wallet.",
  notNominee: "Only the backup wallet this member named can ask for their share.",
  nomineeClaimPending:
    "A backup wallet claim about this member is already open. The member can cancel it from the circle page; otherwise the circle's vote decides.",
  noNomineeClaim: "There's no backup wallet claim about you to cancel.",
  nomineeSaved:
    "Saved. This wallet can ask for your share only if the circle marks you dormant and then votes yes.",
  nomineeCleared: "Backup wallet removed. Nobody can claim your share now.",
  nomineeClaimCancelled:
    "Claim cancelled. Your share stays yours and your payments start again from the next due date.",
  nomineeClaimRequested:
    "You asked for the share. The circle votes now; you can follow it on the Votes page.",
  nothingToClaimYet: "There's no cash to share out right now. Claim again once loans are repaid.",
  proposalTooSoon: "You started a proposal recently. You can start the next one tomorrow.",
  memberExiting:
    "A member who has asked to leave can't take a loan or back one. Cancel the exit first.",
  payoutGasTooLow: "This needs a little more gas to send the payment. Please try again.",
  exitAlreadyPending: "You've already asked to leave this circle.",
  noExitPending: "You haven't asked to leave this circle.",
  exitNotReady: "Your notice period isn't over yet. You can collect your share when it ends.",
  memberFrozen: "Your share is frozen because of an unpaid loan. Pay what's owed to unfreeze it.",
  hasLoanTies: "You can't leave while you have a loan, a loan request or a guarantee open.",
  notGuardian: "Only the circle's guardian can do this.",
  guardianOff:
    "The guardian role has ended (voted off, or the creator left), so pausing isn't possible.",
  pauseTooSoon: "The guardian can pause at most once every 90 days.",
  notPaused: "The circle isn't paused.",
  circlePaused:
    "The circle is paused for a short time, so new members and loans wait. Leaving and paying still work.",
  loansClosed: "This circle has voted to close, so it doesn't lend any more.",
  loansPaused:
    "Loans are paused for a short time by the circle's guardian. Paying and leaving still work.",
  notAVoter: "Only members who can vote right now can ask for a loan.",
  loanRequestOpen: "You already have a loan request waiting for votes.",
  loanActive: "You already have a loan. Repay it before asking for another.",
  tooFewMembers: "The circle needs more members before it can lend.",
  zeroAmount: "Enter an amount above 0.",
  amountTooLarge: "That's more than this circle can lend you. Try a smaller amount.",
  medicalLoansOff: "This circle doesn't offer medical loans.",
  medicalLoanThisYear: "You've already had a medical loan this year.",
  guarantorRequired: "This circle needs a guarantor for every loan. Pick a member to back you.",
  invalidGuarantor: "That member can't be your guarantor. Pick another member of the circle.",
  alreadyGuaranteeing: "That member is already backing another loan.",
  notYourGuarantee: "You weren't named as the guarantor for this loan.",
  noOtherLoanVoters: "There's nobody else in the circle who could vote on this loan yet.",
  loanRequestNotOpen: "This loan request is already decided or was withdrawn.",
  loanVotingClosed: "Voting on this loan has closed.",
  cannotVoteOnLoan:
    "You can't vote on this loan: the borrower can't, and only members who could vote when it started, and are up to date, can.",
  alreadyVotedOnLoan: "You've already voted on this loan.",
  loanNotDecidedYet: "The vote isn't decided yet. It can be settled once the voting time ends.",
  guaranteeNotAccepted: "The guarantor hasn't accepted yet. The loan can be paid out once they do.",
  disbursalBlocked:
    "The loan can't be paid out right now: members are waiting to be paid for leaving, or the circle is paused.",
  noLoanRequest: "You don't have a loan request waiting.",
  noLoan: "There's no loan to pay.",
  nothingOwed: "Nothing is owed on this loan right now.",
  wrongLoanAmount: "The amount doesn't match what's owed. Refresh and try again.",
  interestOverdue: "Pay the overdue interest first, then repay the loan.",
  interestOwed: "Pay the interest that's due first.",
  notInDefault: "This loan isn't in default.",
  alreadyDefaulted: "This loan is already marked as in default.",
  settleOpen: "A vote to settle this loan is already open.",
  exitGasTooLow:
    "There wasn't enough gas to reach your place in the queue. Try again; your wallet will ask for a bit more.",
  tooManyOpenRequestsBy:
    "That member already has 3 open invites or proposals. Ask them to wait until one is decided, or ask another member to invite you.",

  // Success
  paid: "Paid. Your {month} installment of {amount} {symbol} is in.",
  voted: "Vote counted. {votes} of {members} have voted.",
  copied: "{what} copied.",
  addressCopied: "Address copied.",

  // Reminders (ADR 0052)
  remindersNotSetUp:
    "Reminders aren't set up on this site yet. Your dues and votes still show when you open the app.",
  remindersUnsupported: "This browser can't show reminders. Chrome, Edge, Firefox and Safari can.",
  remindersIosInstall:
    "On iPhone and iPad, reminders work once WealthKart is on your Home Screen. In Safari, tap Share, then Add to Home Screen, and open it from there.",
  remindersDenied:
    "Notifications are blocked for this site. Allow them in your browser's site settings, then come back here.",
  remindersOtherWallet: "This device gets reminders for {who}. You can switch them to this wallet.",
  remindersOn: "Reminders are on for this device.",
  remindersOff: "Reminders are off for this device.",
  remindersSaved: "Saved.",
  remindersTestSent: "Test sent. It should show up on this device in a few seconds.",
  remindersTestFailed:
    "The test didn't reach this device. Check that notifications are allowed, then try again.",
  remindersDeviceGone:
    "This device stopped accepting reminders, so we turned them off. Turn them on again to fix it.",
  remindersBusy: "That was a lot of changes at once. Wait a minute and try again.",
  remindersFailed:
    "We couldn't reach the reminder service. Nothing changed. Try again in a minute.",
  remindersCircleUnknown:
    "This circle is very new, so reminders can't be set yet. Try again in a minute.",

  // UI states (docs/ui.md §10)
  offline: "You're offline. You can look around, but paying and voting need a connection.",
  staleLessThanMinute: "Showing saved data from less than a minute ago",
  staleMinutes_one: "Showing saved data from {count} min ago",
  staleMinutes_other: "Showing saved data from {count} min ago",
  staleHours_one: "Showing saved data from {count} hour ago",
  staleHours_other: "Showing saved data from {count} hours ago",
  loadFailed: "We couldn't load this right now. Your money is safe. Try again in a moment.",
  txFailed: "This didn't go through. Nothing was sent except the network fee. You can try again.",

  // Access cards
  accessNoWalletTitle: "Connect your Core wallet",
  accessNoWalletBody:
    "Your wallet address is your account. WealthKart stores no names, emails or phone numbers.",
  accessWrongNetworkTitle: "Switch to Avalanche",
  accessWrongNetworkBody:
    "Your wallet is on a different network. Switch to Avalanche to see this circle.",
  accessNotMemberTitle: "You're not in this circle yet",
  accessNotMemberBody:
    "Ask a member for an invite link. Once the circle votes you in, it shows up here.",

  // Error boundaries (docs/ui.md §11)
  appErrorTitle: "Something went wrong",
  pageErrorTitle: "This page couldn't load",
  widgetErrorTitleNamed: "{name} couldn't load",
  widgetErrorTitle: "This part couldn't load",
  widgetErrorBody: "The rest of the page still works. Try again in a moment.",

  // First-run checklist on the home screen (ADR 0054)
  checklistHidden: "Checklist hidden. The full guide is still on the Get started page.",
  checklistCantCheck: "Couldn't check this right now.",

  // Transaction tracker
  txStepConfirm: "Confirm in Core",
  txStepSending: "Sending",
  txStepConfirmed: "Confirmed",
} as const;
