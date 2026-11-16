import { registerEn } from "../registry";

/** Votes page and circle proposals (ADR 0040): rule changes, fee waivers, closing, guardian. */
export const votes = {
  kind: {
    ruleChange: "Change the rules",
    feeWaiver: "Waive late fees",
    dissolve: "Close the circle",
    guardianOff: "Switch off the guardian",
  },
  reason: {
    medical: "Medical",
    bereavement: "Bereavement",
    bank: "Bank problem",
    other: "Something else",
  },
  tally_one: "{cast} of {count} vote needed · {yes} yes, {no} no · {mark}",
  tally_other: "{cast} of {count} votes needed · {yes} yes, {no} no · {mark}",
  markHalf: "needs more than half yes",
  markPct: "needs {pct}% yes",
  settled: {
    approved: "Enough members voted yes. Anyone can record the result.",
    rejected: "There aren't enough yes votes for this to pass. Anyone can record the result.",
    expired: "Voting time ran out before enough members voted. Anyone can record the result.",
  },
  noNotice: "no notice",

  page: {
    loading: "Loading votes",
    title: "Votes",
    subtitle:
      "{name} · proposals, loans, people asking to join, members the circle may mark dormant, and backup wallet claims. At least {pct}% of members must vote, and each vote stays open {window}.",
    proposalsHeading: "Circle proposals",
    proposalsWidget: "Proposals",
    loansHeading: "Loans",
    loanVotesWidget: "Loan votes",
    requestsHeading: "Joining, dormant members and backup wallets",
    openVotesWidget: "Open votes",
    loadingProposals: "Loading proposals",
    noProposals:
      "No proposals open. Use New proposal to suggest a rule change, a fee waiver, closing the circle or switching off the guardian.",
    nounProposals: "proposals",
    loadingLoanVotes: "Loading loan votes",
    noLoanVotes:
      "No loans to vote on. When a member asks for a loan, or the circle needs to settle one, it shows up here.",
    goToLoans: "Go to Loans",
    nounLoanVotes: "loan votes",
    nothingToVote:
      "Nothing to vote on right now. Share your invite link from the circle page to bring a friend in.",
    goToCircle: "Go to the circle",
    nounVotes: "votes",
  },

  ruleChange: {
    appliedToast: "The new rules are in force.",
    readyTitle: "New rules are ready to apply",
    applyOn: "New rules apply on {date}",
    readyBody: "The waiting time is over. Anyone in the circle can put them into force now.",
    waitBody:
      "The members voted for these changes. Until they apply, anyone who doesn't want them can ask to leave and be out under today's rules.",
    starts: "Starts",
    readyNow: "ready now",
    applying: "Applying…",
    apply: "Apply new rules",
  },

  dissolved: {
    claimedToast:
      "Done. About {amount} {symbol} was sent to your wallet. Thank you for saving together.",
    title: "This circle has voted to close",
    claiming: "Claiming…",
    claim: "Claim your share",
    stopped: "Payments have stopped and no new loans start.",
    blocked: "{reason} Your share stays safe in the circle until then.",
    partial:
      "You can claim your share of the cash now. Some money is still lent out, so claim again as loans are repaid. Your whole share is worth about {amount} {symbol}.",
    full: "Each member takes their share at today's value. Yours is about {amount} {symbol}.",
    nonMember: "Every member who was still in has a share to claim.",
  },

  card: {
    settledPassed: "Settled: the proposal passed.",
    settledExpired: "Settled: voting time ran out before enough members voted.",
    settledFailed: "Settled: the proposal didn't pass.",
    withdrawnToast: "Proposal withdrawn.",
    whyAboutMe: "This one is about you, so you can't vote on it.",
    whyMine: "Your yes was counted when you proposed it.",
    aria: "Proposal: {title}",
    by: "Proposal by {name}",
    loadingChanges: "Loading the changes…",
    ruleChangeNote:
      "If it passes, the new rules wait {days} days and then start on the 1st of the next month. Anyone who asks to leave before then is out under today's rules.",
    member: "Member",
    month: "Month",
    reason: "Reason",
    waiverNote:
      "If it passes, the late fees for that month are cancelled and {name} pays only the installment. The member it's about can't vote.",
    dissolveTitle: "This closes the circle for good.",
    dissolveBody:
      "If it passes, payments stop at once and no new loans start. Each member then claims their share at its value on the day, as soon as every loan is repaid. Talk it over with the group before you vote.",
    guardianBody:
      "If it passes, the circle's creator can no longer pause new members and loans, and any pause running now ends. This can't be undone.",
    withdraw: "Withdraw proposal",
  },

  dialog: {
    shortRules: "Rules",
    shortWaiver: "Fee waiver",
    shortClose: "Close",
    shortGuardian: "Guardian",
    groupLeaving: "Leaving",
    groupVoting: "Voting",
    groupLoans: "Loans",
    newProposal: "New proposal",
    description: "Your yes vote is counted when you send it. The others vote on the Votes page.",
    kindAria: "Kind of proposal",
    sentRules: "Proposal sent. Your yes is counted; the others can vote on Votes.",
    sentWaiver: "Proposal sent. The others can vote on Votes.",
    closingTitle: "Closing is for good",
    closingBody:
      "If the members agree (at least {pct}% yes), payments stop at once and no new loans start. Each member then claims their share at its value on the day, once every loan is repaid. The circle can't be reopened.",
    sentDissolve: "Proposal sent. The members will vote on closing the circle.",
    proposeClose: "Propose closing the circle",
    guardianExplain:
      "The guardian is the member who created the circle. They can pause new members and loans for up to 14 days. If this passes, that power is gone for good and any pause running now ends.",
    guardianAlreadyOff: "The guardian is already switched off",
    sentGuardian: "Proposal sent. The members will vote on it.",
    proposeGuardianOff: "Propose switching off the guardian",
    whatChanges: "What changes",
    fixFirstSentence: "Fix the highlighted setting first.",
    fixFirst: "Fix the highlighted setting first",
    changeOne: "Change at least one setting",
    proposeRules: "Propose these rules",
    loadingMembers: "Loading members…",
    everyonePaid: "Everyone is paid up, so there are no late fees to waive right now.",
    waiverIntro:
      "Ask the circle to cancel the late fees on one unpaid month. Vote before they pay: fees already paid aren't refunded. The member it's about can ask for themselves, but can't vote.",
    memberYou: "{name} (you)",
    reasonNote: "Only the reason from this list is saved. Nothing personal goes on the record.",
    proposeWaiver: "Propose the waiver",
  },
} as const;

registerEn("votes", votes);
