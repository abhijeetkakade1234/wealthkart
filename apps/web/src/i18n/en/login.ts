import { registerEn } from "../registry";

/** Sign-in page. */
export const login = {
  taglineSave: "Save together.",
  taglineLend: "Lend on trust.",
  intro:
    "A private circle for friends who already trust each other. Everyone puts in a little each month, and the circle lends to whoever needs it, by vote.",
  title: "Sign in with Core",
  noAccount:
    "There's no account and no password. Your Core wallet is your login, and we never ask for your name, email or phone number.",
  newToWallets: "New to wallets?",
  startHere: "Start here",
  agreement:
    "By connecting you agree to the <terms>Terms</terms> and have read the <risks>Risks</risks> and the <privacy>Privacy policy</privacy>.",
  noteKeys:
    "WealthKart never holds your money or your keys. Every payment goes from your wallet to your circle's contract.",
  noteLost: "Lost wallets can't be recovered, so keep your Core recovery phrase safe.",
  howItWorks: "How it works",
  security: "Security",
  faq: "FAQ",
  testOnly: "Test network only for now",
  back: "Back",
  checkAgain: "I've installed it, check again",
  wrongNetwork: "Your wallet is connected but on a different network.",
  openingCircles: "Opening your circles…",
} as const;

registerEn("login", login);
