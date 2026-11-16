/**
 * Public page chrome (header, footer) and the small labels on the landing page and `/start`
 * (ADR 0057). Page copy itself lives in `src/content/` (and `content/hi`, `content/mr`).
 */
export const site = {
  navLabel: "Site",
  footerNav: "Footer",
  legalNav: "Legal",
  languageNav: "Language",
  openApp: "Open app",
  howItWorks: "How it works",
  rules: "Rules",
  security: "Security",
  faq: "Questions",
  start: "Get started",
  privacy: "Privacy",
  terms: "Terms",
  risks: "Risks",
  about:
    "Private savings circles for friends, on Avalanche. Running on the Fuji testnet. No personal data stored.",
  licence: "Open-source software under the MIT licence. Not a bank or an investment scheme.",
  englishOnly: "in English",
  legalNote:
    "The legal pages are in English. If a translation ever differs, the English version is the one that counts.",
  updated: "Updated {date}",
  landing: {
    openTheApp: "Open the app",
    howItWorks: "How it works",
    fullWalkthrough: "The full walk-through",
    safetyLink: "How the contracts protect the pot",
    allQuestions: "See all questions",
    readRules: "Read the rules",
    heroArt:
      "Cut-paper illustration: two friends' hands dropping coins into a shared clay pot, with leaves, a tulip, a bird and snowy mountains around it",
    potArt:
      "Five friends sit around a shared pot. Each puts in, Kiwi asks for a loan, three of the other four vote yes, the pot lends to Kiwi, and Kiwi pays it back with a little interest that stays in the pot.",
    potInterest: "+ interest",
    potAsks: "asks to borrow",
    potTally: "{n} of 4 said yes",
  },
  startGuide: {
    steps: "Steps",
    testnet: "Fuji test network: coins are free and worth nothing",
    mainnet: "Avalanche mainnet: real money",
    installCore: "Install Core",
    createWallet: "Back up the phrase",
    backupWallet: "Pick a backup wallet",
    getAvax: "Get AVAX for fees",
    getUsdt: "USDT, if needed",
    join: "Join your circle",
    readyTitle: "Ready when you are",
    readyText:
      "Got Core, a backed-up phrase and a little AVAX? Open the app and connect. Your circles and anything you need to do will be there.",
    readFaq: "Read the FAQ",
  },
} as const;
