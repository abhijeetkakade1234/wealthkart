import { registerEn } from "../registry";

/** Display names, join and dormant votes, invites (membership components and lib). */
export const membership = {
  // Display name rules (lib/membership.ts displayNameProblem)
  nameEmpty: "Pick a name.",
  nameChars: "Use only letters, numbers, spaces, dots, dashes and underscores.",
  nameMin: "Use at least {min} characters.",
  nameMax: "Use at most {max} characters.",
  nameEdgeSpace: "Remove the space at the start or end.",
  nameDoubleSpace: "Use single spaces between words.",

  // What the applicant reads once a request is closed
  resultApproved: "You're in. The members voted you into the circle.",
  resultRejected: "The members didn't vote you in this time.",
  resultExpired: "Voting time ran out before enough members voted. You can ask again.",
  resultCancelled: "You cancelled your request.",
  resultFull: "The vote passed, but the circle filled up first.",
  resultWaiting: "Your request is waiting for votes.",

  // Settled but not recorded yet
  settledExpired: "Voting time ran out before enough members voted. Anyone can record the result.",
  settledClaimApproved:
    "Enough members voted yes. Once recorded, the notice starts and the share is paid to the backup wallet when it ends, unless the member cancels. Anyone can record the result.",
  settledClaimRejected:
    "There aren't enough yes votes, so nothing is paid. Anyone can record the result.",
  settledDormantApproved:
    "Enough members voted yes, so their payments pause. Anyone can record the result.",
  settledDormantRejected:
    "There aren't enough yes votes to pause their payments. Anyone can record the result.",
  settledJoinApproved: "Enough members voted yes, so they get in. Anyone can record the result.",
  settledJoinRejected:
    "There aren't enough yes votes for them to get in. Anyone can record the result.",

  // Members table and tallies
  dormantHint_one: "Missed {count} month. The circle can vote to pause their payments.",
  dormantHint_other: "Missed {count} months. The circle can vote to pause their payments.",
  tallyMarkDormant: "needs more than {pct}% yes",
  tallyMarkJoin: "needs {pct}% yes",
  tally_one: "{cast} of {count} vote needed · {yes} yes, {no} no · {mark}",
  tally_other: "{cast} of {count} votes needed · {yes} yes, {no} no · {mark}",
  inviterOpen_one: "{count} open invite (max {max})",
  inviterOpen_other: "{count} open invites (max {max})",
  inviterNone: "hasn't brought anyone in yet",
  inviterAdmitted_one: "brought in {count} member so far",
  inviterAdmitted_other: "brought in {count} members so far",
  votingRights_one: "New member · can vote after {count} more payment",
  votingRights_other: "New member · can vote after {count} more payments",

  // Display name field
  nameLabel: "Your name in this circle",
  nameTaken: "Someone here already uses that name (letter case doesn't matter). Try another.",
  nameFree: "That name is free.",
  nameChecking: "Checking the name…",
  nameUnchanged: "That's your current name.",
  nameHint: "Like a game tag. Anyone in the circle can see it, so it needn't be your real name.",

  // Name card
  nameSavedToast: 'Saved. You\'re "{name}" in this circle now.',
  nameCardBody:
    "Members see this instead of your wallet address. You can use a different name in each circle.",
  noNameYet: "No name yet",
  changeAgainOn: "You can change it again on {date}",
  changeAgainOnSentence: "You can change it again on {date}.",
  changeName: "Change name",
  pickName: "Pick a name",
  dialogChange: "Change your name",
  dialogPick: "Pick your name",
  dialogDesc:
    "After this, you can change it again in 30 days. Your old name stays reserved for you for 30 days too.",
  saving: "Saving…",
  saveName: "Save name",
  pickFreeFirst: "Pick a free name first",

  // Dormant (ADR 0032)
  wokeToast: "Welcome back. Your payments start again from the next due date.",
  pausedTitle: "Your payments are paused",
  waking: "Waking up…",
  imBack: "I'm back",
  dormantBody:
    "The circle marked you dormant after several missed months. Nothing is owed while you're dormant, and your savings are still yours. Tap \"I'm back\" to start paying again, or <link>pay this month</link> to come back straight away.",
  proposedToast: "Vote started. Your yes is counted. The others can vote on Votes.",
  starting: "Starting…",
  pauseAria: "Ask the circle to pause {name}'s payments",
  pausePayments: "Pause payments",

  // Invite card
  inviteLink: "Invite link",
  copyFailed: "We couldn't copy the link. Select it and copy it yourself.",
  shareTitle: "Join my WealthKart circle",
  inviteTitle: "Invite a friend",
  inviteBody:
    "Send this link. Your friend picks a name and asks to join; then the members vote, and 66% yes lets them in.",
  copyLink: "Copy link",
  share: "Share",

  // Request card (join, dormant and backup wallet votes)
  votedYes: "Vote counted: yes.",
  votedNo: "Vote counted: no.",
  toastExpired: "Settled: voting time ran out before enough members voted on {who}.",
  toastClaimApproved:
    "Settled: {who}'s share goes to their backup wallet after the notice, unless {who} cancels.",
  toastClaimRejected: "Settled: the circle chose not to pay {who}'s share to their backup wallet.",
  toastDormantApproved:
    "{who} is now dormant. Their payments are paused and their savings stay theirs.",
  toastDormantRejected: "Settled: the circle chose not to pause {who}'s payments.",
  toastJoinApproved: "{who} is now a member.",
  toastJoinRejected: "Settled: the members didn't vote {who} in.",
  whyVoted: "You've voted on this one.",
  whyOver: "Voting time is over.",
  whyClaim:
    "You can't vote on this one: the member it's about and their backup wallet can't vote, and only members who were in the circle before it started, and are at most one month behind, can.",
  whyDormant:
    "You can't vote on this one: the member it's about can't vote, and only members who were in the circle before it started, and are at most one month behind, can.",
  whyJoin:
    "You can't vote on this one: only members who joined before the request, and are at most one month behind, can vote.",
  ariaClaim: "Backup wallet claim for {who}",
  ariaDormant: "Dormant vote about {who}",
  ariaJoin: "Join request from {who}",
  kindClaim: "Backup wallet claim",
  kindJoin: "Wants to join",
  noName: "No name",
  claimBody:
    "<b>{nominee}</b> is the backup wallet {who} named, and asks for their share. {who} is dormant. If the circle votes yes, the share is paid to the backup wallet after a notice of at least 30 days, unless {who} cancels. Vote yes only if you believe {who} can't come back.",
  dormantVoteBody:
    "<b>{name}</b> asks the circle to mark them dormant, maybe because they lost their wallet. Their monthly payments and late fees stop. Their savings stay theirs, and paying again brings them back.",
  invitedBy: "Says they were invited by <b>{name}</b>",
  confirmed: "Confirmed",
  notConfirmed: "Not confirmed yet",
  tooManyInvited:
    "This member has brought in more than a third of the circle. Make sure each newcomer is someone the group knows.",
  noInviter: "No inviter named. Make sure someone knows them.",
  settling: "Settling…",
  settle: "Settle the vote",
  voting: "Voting…",
  voteYes: "Vote yes",
  voteNo: "Vote no",
} as const;

registerEn("membership", membership);
