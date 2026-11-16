/** Public repayment record page (ADR 0042). */
export const record = {
  openApp: "Open the app",
  title: "Repayment record",
  intro:
    "Every circle writes how a wallet pays: months on time, loans repaid, defaults. It lives on the blockchain, nobody can edit it, and it can't be sold or moved to another wallet.",
  addressLabel: "Wallet address",
  addressPlaceholder: "Wallet address, 0x…",
  lookUp: "Look up",
  notAnAddress: "That isn't a wallet address.",
  pasteAddress: "Paste a wallet address, or connect your wallet in the app to see your own record.",
  notLive: "WealthKart isn't live on this network yet.",
  reading: "Reading the record",
  region: "Record",
  locked: "Locked to this wallet",
  monthsOnTime: "Months on time",
  monthsLate: "Months late",
  circles: "Circles",
  loansRepaid: "Loans repaid",
  defaults: "Defaults",
  since: "Since",

  // Summary line
  none: "No record yet.",
  onTime_one: "{pct}% of {count} month paid on time",
  onTime_other: "{pct}% of {count} months paid on time",
  repaid_one: "{count} loan repaid",
  repaid_other: "{count} loans repaid",
  noDefaults: "no defaults",
  defaultCount_one: "{count} default",
  defaultCount_other: "{count} defaults",
  across_one: "{parts}, across {count} circle.",
  across_other: "{parts}, across {count} circles.",
} as const;
