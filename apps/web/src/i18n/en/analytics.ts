/** Circle analytics, charts, heatmap, portfolio and "Your returns" (PLAN.md D7). */
export const analytics = {
  // Shared chart frame
  chart: "Chart",
  table: "Table",
  month: "Month",
  monthShort: "{month} '{year}",

  // Overview wrapper
  loadingHistory: "Loading circle history",
  partialHistory:
    "This circle is older than the history we can read quickly, so the charts show recent months only. Full history arrives with the activity indexer.",
  noPayments: "No payments yet. The charts fill in after the first installment.",
  summary_one: "{count} payment so far · {late} paid late · {fees} in late fees shared by everyone",
  summary_other:
    "{count} payments so far · {late} paid late · {fees} in late fees shared by everyone",
  // Widget names, shown if one of them fails to load
  widgetValue: "Circle value",
  widgetInflow: "Money in each month",
  widgetNav: "Value of one share",
  widgetReturns: "Your returns",
  widgetPayments: "Payments",
  widgetOutstanding: "Loans outstanding per member",
  widgetSplit: "Where the money is",

  // Circle value
  valueTitle: "Circle value",
  valueSubtitle: "Everything paid in so far, month by month ({symbol}).",
  valueColumn: "Value ({symbol})",

  // Money in each month
  inflowTitle: "Money in each month",
  inflowSubtitle: "Installments and late fees, by the month they're for ({symbol}).",
  installments: "Installments",
  lateFees: "Late fees",

  // Value of one share
  navTitle: "Value of one share",
  navSubtitle:
    "What 1 {symbol} paid in at the start is worth now. Late fees and loan interest lift it for everyone.",
  navColumn: "Worth of 1 {symbol}",
  navSeries: "One share",

  // Loans outstanding
  outstandingTitle: "Loans outstanding per member",
  outstandingSubtitle: "What each borrower still owes the circle, in {symbol}.",
  memberColumn: "Member",
  stillOwedColumn: "Still owed ({symbol})",
  stillOwed: "Still owed",
  nobodyOwes: "Nobody owes the circle anything right now.",

  // Where the money is
  splitTitle: "Where the money is",
  splitSubtitle:
    "The circle's value split into cash free to lend, money lent out, and the reserve it always keeps.",
  partColumn: "Part",
  shareColumn: "Share",
  partFree: "Cash free to lend",
  partLent: "Lent out to members",
  partReserve: "Reserve kept back",
  nothingPaidIn: "Nothing paid in yet.",
  inTotal: "{symbol} in total",

  // Payments heatmap
  paymentsTitle: "Payments",
  paymentsSubtitle: "Every member, every month. Hover a square for details.",
  year: "Year",
  heatmapCaption: "Payments by member and month, {year}",
  cellBefore: "Not a member yet",
  cellOnTime: "Paid on time",
  cellLate: "Paid late",
  cellHoliday: "Paid after a holiday",
  cellMissed: "Missed",
  cellDue: "Due this month",
  cellUpcoming: "Not due yet",
  cellDormant: "Paused (dormant)",

  // Portfolio
  addingUp: "Adding up your circles",
  portfolio: "Your portfolio",
  moneyInAssetCircles: "Your money in {symbol} circles",
  moneyInCircles: "Your money in circles",
  acrossCircles_one: "Across {count} circle",
  acrossCircles_other: "Across {count} circles",
  installmentsPaid: "Installments you paid",
  feesNotIncluded: "Late fees not included",
  gainSoFar: "Gain so far",
  gainMeta: "Your share of fees and loan interest",
  whereYourMoneyIs: "Where your money is",
  youOwn: "you own {pct} of it",
  totalsCover: "Totals cover your first {max} circles.",

  // Your returns
  returnsTitle: "Your returns",
  returnsSubtitle: "Based on each installment's due date and what your share is worth today.",
  couldBeWorth: "Could be worth",
  youdPayIn: "You'd pay in",
  yearColumn: "Year",
  couldBeWorthColumn: "Could be worth ({symbol})",
  youdPayInColumn: "You'd pay in ({symbol})",
  now: "Now",
  yearsShort: "{count}y",
  myReturn: "Your annual return",
  circleReturn: "The circle's annual return",
  ifYouKeepPaying: "If you keep paying {amount} {symbol} a month and the circle's return holds:",
  years: "Years",
  yearsButton: "{count} years",
  notAPromise:
    "An illustration, not a promise. Past results don't decide future ones, and a circle's return can go down as well as up.",
  downloadCsv: "Download my history (CSV)",
  rateNotEnough: "Not enough history yet",
  ratePerYear: "{rate}% a year",
} as const;
