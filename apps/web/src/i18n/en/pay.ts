/** Paying an installment (/app/circle/pay) and the shared pay button (asset-pay.tsx). */
export const pay = {
  title: "Pay",
  loading: "Loading what you owe",
  holidayTaken: "Payment holiday taken for {month}. No late fee until next month's due date.",
  allPaid: "You're all paid up. Your next installment is for {month}.",
  allPaidNext: "You're all paid up. Your next installment is for next month.",
  backToCircle: "Back to circle",
  dormantTitle: "Paying brings you back",
  dormantBody:
    "The circle marked you dormant, so nothing from the months you missed is owed. This payment covers {month} only, and your monthly payments start again after it.",
  installmentFor: "Installment for {month}",
  includesFees:
    "Includes {amount} {symbol} in late fees. Fees go into the circle, so every member shares them.",
  usdtSteps:
    "Paying in USDT takes two steps in your wallet: approve, then pay. You approve up to the installment plus both late fees, so a fee starting mid-way can't stop the payment; the circle only takes what's due.",
  payVerb: "Pay",
  addTokenFirst: "Add {symbol} to your wallet first",
  addAvaxFirst: "Add AVAX to your wallet first",
  saving: "Saving…",
  needMoreTime: "Need more time this month",
  badgeUsdt: "This circle saves in USDT, a digital dollar. Network fees are still paid in AVAX.",
  badgeAvax: "This circle saves in AVAX.",
  approving: "Approving…",
  repaying: "Repaying…",
  paying: "Paying…",
  steps: "Payment steps",
  approveUpTo: "Approve up to {amount}",
  approveHint: "Lets the circle take up to this much USDT. It only ever takes what's due.",
  payAmount: "Pay {amount}",
  payHint: "The circle takes the USDT you approved.",
  status: {
    upcoming: "Waiting",
    working: "In progress",
    done: "Done",
    failed: "Didn't go through",
  },
} as const;
