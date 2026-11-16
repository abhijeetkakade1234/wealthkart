import { registerEn } from "../registry";

/** Backup wallet (nominee, ADR 0016 and 0056): naming one, claims, and the nominee's view. */
export const nominee = {
  // Address check (lib/nominee.ts)
  addrEmpty: "Paste the backup wallet's address.",
  addrInvalid: "That isn't a wallet address. It starts with 0x and has 42 characters.",
  addrZero: "That address can't receive anything. Use a real wallet.",
  addrSelf: "That's your own wallet. Pick someone you trust, or a second wallet of yours.",
  addrCircle: "That's the circle's own address. Use a person's wallet.",

  // The member's card
  title: "Backup wallet",
  body: "Nobody can recover a lost wallet. Name one wallet you trust, such as a family member's or a second wallet of yours, to receive your share if you can never come back.",
  loading: "Loading your backup wallet",
  noNameHere: "No name in this circle",
  set: "Set",
  empty: "No backup wallet yet. If you lose this wallet, your share stays locked for good.",
  cancelClaimFirst: "Cancel the claim first",
  change: "Change backup wallet",
  add: "Add a backup wallet",
  removing: "Removing…",
  remove: "Remove",
  dialogTitle: "Your backup wallet",
  dialogDesc:
    "Paste the wallet address of someone you trust. It can be inside this circle or outside it.",
  whatTitle: "What this wallet can do",
  whatBody:
    "It can ask for your share only if the circle has marked you dormant (you stopped paying for months) and the members then vote yes. After that there is a {days}-day notice. If you are fine, cancel from this page at any time before it is paid. It can never pay, vote or borrow as you.",
  addrLabel: "Backup wallet address",
  addrHint: "Check it twice. A payout sent to a wrong address can't be taken back.",
  saving: "Saving…",
  save: "Save backup wallet",

  // Alert when a claim about you is open
  defaultWho: "Your backup wallet",
  alertTitleVoting: "Someone asked for your share",
  alertTitlePaid: "Your share will be paid out soon",
  cancelling: "Cancelling…",
  cancelClaim: "Cancel the claim",
  alertVoting:
    "{who} asked the circle for your share because you were marked dormant. The members are voting now. If you still use this wallet, cancel now. Your share stays yours and your payments start again.",
  alertNotice:
    "{who} asked the circle for your share because you were marked dormant. The circle voted yes, so it is paid to them when the notice ends. If you still use this wallet, cancel now. Your share stays yours and your payments start again.",
  paidOutFrom: "Paid out from",
  noticeOver: "the notice is over",

  // The nominee's card
  paidToast: "Done. {who}'s share was sent to your wallet.",
  forTitle: "You are the backup wallet for {who}",
  activeBody_one:
    "{who} is active in this circle, so there is nothing to do. If they ever miss {count} month and the circle marks them dormant, you can come back here and ask for their share.",
  activeBody_other:
    "{who} is active in this circle, so there is nothing to do. If they ever miss {count} months and the circle marks them dormant, you can come back here and ask for their share.",
  missedSoFar: " They have missed {overdue} so far.",
  dormantBody:
    "The circle marked {who} dormant. If they can't come back, ask the circle for their share. Members vote (66% yes needed); then there is a {days}-day notice in which {who} can still cancel. After that the share is paid to this wallet.",
  shareToday: "Their share today",
  asking: "Asking…",
  askFor: "Ask the circle for {who}'s share",
  votingBody:
    "You asked for {who}'s share. The members are voting now. <link>Follow the vote</link>",
  statusNotice: "The circle voted yes. Notice period",
  statusReady: "Ready to pay out",
  canBePaidFrom: "Can be paid from",
  waitingCash: "Waiting for cash",
  waitingCashBody:
    "The circle can't pay yet: some of its money is lent out, or someone who asked to leave earlier is paid first. The share keeps its place.",
  payingOut: "Paying out…",
  payOut: "Pay out to my wallet",
  stillCancel:
    "{who} can still cancel until then. The amount is their share on the day it is paid.",
} as const;

registerEn("nominee", nominee);
