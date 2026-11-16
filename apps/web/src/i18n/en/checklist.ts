/** First-run checklist on the home screen (ADR 0054). */
export const checklist = {
  title: "Before you start",
  progress: "{done} of {total} done.",
  readGuide: "Read the full guide",
  hide: "Hide this checklist",
  progressLabel: "Checklist progress",
  statusDone: "Done",
  statusTodo: "To do",
  statusChecking: "Checking",
  howTo: "How to: {title}",
  showMe: "Show me how",
  undo: "Undo",
  doneThis: "I've done this",
  phraseTitle: "Write down your recovery phrase",
  phraseHint: "On paper, kept safe. Nobody can recover a lost wallet.",
  gasTitle: "Have a little AVAX for network fees",
  gasHintTestnet: "Test AVAX is free from the Fuji faucet.",
  gasHint: "Every payment and vote costs a small fee in AVAX.",
  nomineeTitle: "Set a backup wallet",
  nomineeHintNoCircle:
    "Once you're in a circle, add one on the circle's page. It gets your share only if you go dormant and the circle votes yes.",
  nomineeHint:
    "Add one on each circle's page. It gets your share only if you go dormant and the circle votes yes.",
  circleTitle: "Join or start a circle",
  circleHint: "Open a friend's invite link, or start one yourself.",
} as const;
