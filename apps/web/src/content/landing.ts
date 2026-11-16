import { FAQ } from "./pages";

/**
 * Landing page copy (ADR 0049) as typed data, like the other public pages (ADR 0027).
 * The page renders it and `/llms-full.txt` repeats it, so both say the same thing.
 *
 * Writing rules: plain words for someone who has never used crypto, short sentences,
 * never promise or advertise returns (ADR 0024, docs/seo.md §6), no emojis.
 */

/** Meta description for `/` (155 characters at most). */
export const LANDING_DESCRIPTION =
  "A private savings circle for friends on Avalanche. Everyone puts in monthly, loans go out when the group votes yes, and no one else can touch the money.";

export const LANDING_HERO = {
  status: "Now testing on Avalanche Fuji",
  eyebrow: "Savings circles for friends",
  /** Rendered as "Save together. <em>Borrow</em> by vote." */
  h1: "Save together. Borrow by vote.",
  lead: "A shared money pot for you and your friends. Everyone puts in the same amount each month. When someone needs money, the group votes and the pot lends it. No one, not even us, can take the money out.",
  note: "Free to use. Sign in with Core wallet. No name, phone or email.",
  /** Link to the onboarding guide (ADR 0054), after the note. */
  startLink: "New to crypto? Start here",
} as const;

export interface LandingStep {
  title: string;
  text: string;
}

export const LANDING_STEPS: { eyebrow: string; heading: string; steps: LandingStep[] } = {
  eyebrow: "How it works",
  heading: "Four steps, and the pot keeps the books",
  steps: [
    {
      title: "Start a circle",
      text: "Pick a name, the monthly amount and the due day. You choose AVAX or USDT once, when you start.",
    },
    {
      title: "Invite your friends",
      text: "Send them the circle's link. A circle holds 3 to 50 people, and the members vote each new person in.",
    },
    {
      title: "Put in every month",
      text: "Everyone pays the same amount by the due day. Pay late and a small fee goes into the pot.",
    },
    {
      title: "Borrow, repay or leave",
      text: "Ask for a loan when you need one and pay it back with a little interest. Leave whenever you like, after a notice period.",
    },
  ],
};

/** The pinned "one month" scene. Nicknames are made up, like the ones members pick. */
export const LANDING_MONTH = {
  eyebrow: "One month in a circle",
  heading: "Watch the pot at work",
  borrower: "kiwi",
  friends: ["juno", "rafa", "moss", "pip"],
  steps: [
    {
      title: "Everyone puts in",
      text: "Five friends each add their monthly amount. The pot fills up.",
    },
    {
      title: "Kiwi asks, the others vote",
      text: "Kiwi needs money for a repair. The other four vote, and three say yes. Kiwi can't vote on her own loan.",
    },
    {
      title: "The loan goes out by itself",
      text: "Once the vote passes, the pot sends the money straight to Kiwi's wallet. Nobody has to approve it by hand.",
    },
    {
      title: "It comes back with a little extra",
      text: "Kiwi pays it back with a little interest. The interest stays in the pot, so it belongs to the whole circle.",
    },
  ] satisfies LandingStep[],
};

export const LANDING_FEATURES = {
  eyebrow: "What your circle can do",
  heading: "Save, borrow, and leave when you want",
  items: [
    {
      id: "save",
      title: "Save every month",
      text: "Same amount and same due day for everyone. If a month goes wrong, each person gets a few payment holidays a year with no late fee.",
    },
    {
      id: "borrow",
      title: "Borrow on a vote",
      text: "Ask the group for a loan. If enough members vote and most say yes, the money is sent at once. A friend can back your loan so you can ask for more.",
    },
    {
      id: "leave",
      title: "Leave with notice",
      text: "Ask to leave and wait out the notice period, 30 days unless your circle picks another. Your share is then paid to your wallet automatically.",
    },
  ] as const,
};

export const LANDING_SAFETY = {
  eyebrow: "Why the money is safe",
  heading: "Only the circle's rules can move the money",
  items: [
    {
      id: "no-one-holds",
      title: "No one holds the money",
      text: "The pot is a contract: a small program on the Avalanche network that holds the money and follows the circle's rules. WealthKart can't move it, and there is no admin button to take it out.",
    },
    {
      id: "slow-rules",
      title: "Rules don't change overnight",
      text: "A rule change needs a member vote and then waits 7 days. Anyone who disagrees can leave with their share before it starts.",
    },
    {
      id: "public",
      title: "Every move is public",
      text: "Each payment, vote and loan is written on Avalanche. Any member can check it at any time, without asking anyone.",
    },
    {
      id: "private",
      title: "Nothing personal is stored",
      text: "Your wallet is your login, and you pick a nickname in each circle. No names, phone numbers or email addresses.",
    },
  ] as const,
  caveat:
    "Two honest caveats. If you lose your wallet, we can't get it back for you, so you can name a backup wallet that can claim your share. And AVAX goes up and down in price; a circle that wants a steady dollar value can choose USDT.",
};

export const LANDING_AUDIENCE = {
  eyebrow: "Who it's for",
  heading: "Friends who already do this on WhatsApp",
  body: [
    "Lots of friend groups already save together. One person collects the money, a spreadsheet tracks who paid, and the group chat decides who can borrow. It works until that person moves away or the spreadsheet breaks.",
    "WealthKart keeps the habit and takes the bookkeeping off one person's plate. It grew out of a real group of twelve friends who have run their pot this way since 2018.",
  ],
  facts: [
    { value: "3 to 50", label: "friends in a circle" },
    { value: "1", label: "currency per circle, AVAX or USDT" },
    { value: "0", label: "names, numbers or emails stored" },
  ],
  footnote:
    "Not for strangers: there is no public list of circles, and nobody joins without a vote.",
};

/** FAQ teaser: a few questions taken straight from the FAQ page, so the answers never drift. */
const TEASER_IDS = ["who-holds-money", "is-it-investing", "lost-wallet", "costs"] as const;

export const LANDING_FAQ = {
  eyebrow: "Questions",
  heading: "Questions people ask first",
  items: TEASER_IDS.map((id) => {
    const s = FAQ.sections.find((x) => x.id === id);
    if (!s) throw new Error(`FAQ section ${id} is missing`);
    return { id, question: s.heading, answer: s.answer };
  }),
};

export const LANDING_CTA = {
  heading: "Start a circle with your friends",
  text: "It takes a few minutes and one transaction. You'll need Core, Avalanche's free wallet app.",
  startLink: "New to crypto? Start here",
};

/** The landing page as Markdown, for `/llms-full.txt` (ADR 0024). */
export function landingToMarkdown(): string {
  const lines: string[] = [
    `# ${LANDING_HERO.h1}`,
    LANDING_HERO.lead,
    `## ${LANDING_STEPS.heading}`,
    LANDING_STEPS.steps.map((s, i) => `${i + 1}. **${s.title}.** ${s.text}`).join("\n"),
    `## ${LANDING_MONTH.heading}`,
    LANDING_MONTH.steps.map((s, i) => `${i + 1}. **${s.title}.** ${s.text}`).join("\n"),
    `## ${LANDING_FEATURES.heading}`,
    LANDING_FEATURES.items.map((f) => `- **${f.title}.** ${f.text}`).join("\n"),
    `## ${LANDING_SAFETY.heading}`,
    LANDING_SAFETY.items.map((f) => `- **${f.title}.** ${f.text}`).join("\n"),
    LANDING_SAFETY.caveat,
    `## ${LANDING_AUDIENCE.heading}`,
    ...LANDING_AUDIENCE.body,
    LANDING_AUDIENCE.facts.map((f) => `- ${f.value} ${f.label}`).join("\n"),
    LANDING_AUDIENCE.footnote,
  ];
  return `${lines.join("\n\n")}\n`;
}
