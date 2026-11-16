import { registerEn } from "../registry";

/** Leaving the circle, the guardian pause and payouts waiting to be withdrawn. */
export const exits = {
  // Leaving (ADR 0039)
  askedNow: "You asked to leave. Your share is ready to collect now.",
  askedAfter: "You asked to leave. Your share is ready to collect after {notice}.",
  stayingToast: "You're staying. Your request to leave is withdrawn.",
  paidToast: "Done. {amount} {symbol} was sent to your wallet. You've left the circle.",
  cantPayYet:
    "The circle can't pay you yet. You keep your place and are paid first when cash comes in.",
  title: "Leaving the circle",
  introWithFee:
    "You can leave at any time. Your share is paid in {symbol} at its value on the day you collect it, minus a {fee} leaving fee that stays with the circle.",
  introNoFee:
    "You can leave at any time. Your share is paid in {symbol} at its value on the day you collect it, with no leaving fee.",
  rageTitle: "You can leave before the new rules start",
  rageBody:
    "New rules start on {date}. If you ask to leave now, your notice ends by then and you leave under today's rules.",
  notice: "Notice",
  leavingFee: "Leaving fee",
  shareToday: "Your share today",
  leave: "Leave this circle",
  phaseNotice: "Notice period",
  phaseReady: "Ready to collect",
  phaseWaiting: "Waiting for cash",
  askedTitle: "You asked to leave",
  collectFrom: "You can collect from",
  noticeOver: "your notice is over",
  waitingBody:
    "The circle can't pay you yet: some of its money is lent out, or someone who asked to leave before you is paid first. You keep your place, new loans stop until you're paid, and you can try again at any time.",
  noticeBody:
    "Your share keeps earning with the circle until you collect it. You can change your mind until then.",
  collecting: "Collecting…",
  collect: "Collect my share",
  withdrawing: "Withdrawing…",
  stay: "Stay in the circle",
  dialogTitle: "Leave this circle?",
  dialogNoNotice: "There's no notice right now, so you can collect your share straight away.",
  dialogNotice:
    "You give {notice} notice. After that you collect your share; until then it keeps earning with the circle and you can change your mind.",
  ifLeft: "If you left today you'd get",
  finalWithFee:
    "The final amount is your share at its value on the day you collect it, minus the {fee} leaving fee. Your name is freed and you stop owing installments once you're paid.",
  finalNoFee:
    "The final amount is your share at its value on the day you collect it. Your name is freed and you stop owing installments once you're paid.",
  asking: "Asking…",
  yesLeave: "Yes, ask to leave",

  // Guardian pause (ADR 0020)
  unpausedToast: "The pause is over. New members and loans can go ahead again.",
  bannerTitle: "New members and loans are paused until {when} UTC",
  ending: "Ending…",
  unpause: "Unpause",
  bannerBody:
    "Your time: {local}. The guardian paused the circle for safety. Leaving and paying still work as usual, and no late fees come from the pause.",
  pausedToast: "Paused for {days} days. Members see a note on every circle page.",
  guardianTitle: "You're this circle's guardian",
  guardianOffBody: "The members voted the guardian off, so pausing isn't possible any more.",
  guardianBody:
    "If something looks wrong, you can pause new members and loans for a short time while the circle talks it over.",
  pauseCircle: "Pause the circle",
  pauseDialogTitle: "Pause new members and loans?",
  pauseDialogDesc:
    "Use this only when something looks wrong, for example a wallet you don't recognise asking to join.",
  pauseRuleDays: "The pause lasts {days} days at most. You can end it sooner with Unpause.",
  pauseRuleCooldown: "You can pause once every {days} days, counted from the start.",
  pauseRuleStillWorks:
    "Members can still pay, leave and collect their share. Nobody gets a late fee because of the pause.",
  pauseRuleVoteOff: "The members can vote to take this power away from the guardian.",
  pausing: "Pausing…",
  pauseFor: "Pause for {days} days",

  // Payout waiting to be withdrawn (RT-20)
  withdrawnToast: "Withdrawn. {amount} {symbol} is in your wallet.",
  waitingForYou: "{amount} {symbol} is waiting for you",
  withdraw: "Withdraw",
  withdrawBodyUsdt:
    "The circle tried to pay you, but the USDT transfer didn't go through (for example, Tether froze the wallet). It's kept safe here until you withdraw it.",
  withdrawBodyAvax:
    "The circle tried to pay you, but your wallet didn't accept it. It's kept safe here until you withdraw it.",
} as const;

registerEn("exits", exits);
