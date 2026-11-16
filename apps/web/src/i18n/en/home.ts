import { registerEn } from "../registry";

/** Home: the wallet's circles. */
export const home = {
  title: "Your circles",
  subtitle: "Everything you've put in, across every circle you're part of.",
  startCircle: "Start a circle",
  notLive: "WealthKart isn't live on this network yet",
  loading: "Loading your circles",
  empty:
    "You're not in any circle yet. Start one with friends, or open an invite link a friend sent you.",
  emptyNotLive: "WealthKart isn't live on this network yet. Check back soon.",
  portfolio: "Your portfolio",
  circlesNoun: "circles",
  members: "{count} members",
  yourStake: "Your stake",
  shareOfCircle: "{percent}% of the circle",
  notJoined: "Not joined",
  due: "{amount} {symbol} due · {month}",
  allPaid: "All paid",
} as const;

registerEn("home", home);
