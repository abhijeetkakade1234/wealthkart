import { chainForNetwork, DEPLOYMENTS, explorerAddressUrl } from "@wealthkart/sdk";

/**
 * Content for the public pages. One source feeds the HTML pages, their `.md` twins,
 * `/llms.txt`, `/llms-full.txt`, the sitemap and JSON-LD (ADR 0024, docs/seo.md §4).
 *
 * Writing rules (docs/seo.md §3, §6): every section is a question-style heading plus a
 * direct 1–3 sentence answer, then detail. Plain language. Never promise returns.
 */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: { title: string; text: string }[] }
  | { kind: "table"; head: string[]; rows: string[][] };

export interface Section {
  /** Stable anchor id: keep it unchanged so answer engines can deep-link. */
  id: string;
  heading: string;
  /** Direct answer, 1–3 sentences. */
  answer: string;
  blocks?: Block[];
}

export type PageSchema = "HowTo" | "FAQPage" | "TechArticle";

export interface PublicPage {
  slug: string;
  /** Route with trailing slash, matching `trailingSlash: true`. */
  path: string;
  /** ≤ 60 chars; the root layout appends " · WealthKart". */
  title: string;
  /** ≤ 155 chars. */
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  /** ISO date shown on the page and used as dateModified. */
  updated: string;
  schema: PageSchema;
  sections: Section[];
}

const UPDATED = "2026-11-14";

/** The network this build targets (ADR 0051). */
const CHAIN_ID = chainForNetwork(process.env.NEXT_PUBLIC_NETWORK).id;
const NETWORK_NAME = CHAIN_ID === 43114 ? "Avalanche mainnet" : "the Avalanche Fuji testnet";

/** Contract addresses come from the SDK deployments file, so the page never goes stale. */
function addressesSection(): Section {
  const factory = DEPLOYMENTS[CHAIN_ID]?.circleFactory ?? null;
  const url = factory ? explorerAddressUrl(CHAIN_ID, factory) : null;
  return {
    id: "addresses",
    heading: "Where are the contracts?",
    answer: factory
      ? `On ${NETWORK_NAME}. Each circle's vault is created by the circle factory below; anyone can read the code on Snowtrace.`
      : `The circle factory is not deployed to ${NETWORK_NAME} yet. Its address will be listed here, with a Snowtrace link, as soon as it is.`,
    blocks: factory
      ? [
          {
            kind: "table",
            head: ["Contract", "Network", "Address"],
            rows: [
              ["Circle factory", "Avalanche Fuji (testnet)", url ? `${factory} (${url})` : factory],
            ],
          },
        ]
      : undefined,
  };
}

export const HOW_IT_WORKS: PublicPage = {
  slug: "how-it-works",
  path: "/how-it-works/",
  title: "How a WealthKart circle works",
  description:
    "Start a private circle, add AVAX each month, borrow when the group votes yes, and leave with your fair share. Step by step, in plain language.",
  eyebrow: "How it works",
  h1: "How a circle works, from first payment to leaving",
  intro:
    "A circle is a small group of friends who save together. Everyone adds the same amount of AVAX each month into a shared vault on Avalanche. When someone needs money, the group votes, and the vault lends it. The contract keeps the books, so no one has to.",
  updated: UPDATED,
  schema: "HowTo",
  sections: [
    {
      id: "start",
      heading: "How do I start a circle?",
      answer:
        "Connect your Core Wallet, pick a name and the monthly amount, and invite your friends. Creating the circle deploys its own vault contract on Avalanche.",
      blocks: [
        {
          kind: "steps",
          items: [
            {
              title: "Connect Core Wallet",
              text: "Your wallet address is your login. There is no sign-up, email or phone number.",
            },
            {
              title: "Choose the rules",
              text: "Monthly amount in AVAX, due day, late fees and payment holidays. Sensible defaults are filled in; every setting has safe limits.",
            },
            {
              title: "Add founding members",
              text: "Paste your friends' wallet addresses. You are added automatically.",
            },
            {
              title: "Confirm in Core",
              text: "One transaction creates the circle. You pay a small network fee in AVAX.",
            },
          ],
        },
      ],
    },
    {
      id: "contribute",
      heading: "How do monthly payments work?",
      answer:
        "Each month every member pays the circle's amount in AVAX before 23:59:59 UTC on the due day. The payment itself is the proof; no one has to check a bank statement.",
      blocks: [
        {
          kind: "list",
          items: [
            "Deadlines are in UTC so they are the same for everyone. The app also shows your local time and a countdown.",
            "Pay late and a small late fee is added, and a second one after day 20. Fees go into the vault, so they belong to the whole circle.",
            "Need more time? Each member gets a few payment holidays a year (3 by default). The payment is still owed, just without the fee.",
            "You can't pay ahead for future months or pay the same month twice.",
          ],
        },
      ],
    },
    {
      id: "shares",
      heading: "How is my share of the circle worked out?",
      answer:
        "Every payment buys shares in the vault at today's share price, like a mutual fund. Your stake is your shares times the share price, so people who join late or skip months are treated fairly.",
      blocks: [
        {
          kind: "p",
          text: "Interest paid by borrowers and late fees go into the vault, which raises the share price for every member. Shares can't be sold or transferred; they belong to your wallet within that circle.",
        },
      ],
    },
    {
      id: "borrow",
      heading: "How do loans work?",
      answer:
        "A member asks for a loan, the other members vote, and if the vote passes the AVAX is sent to the borrower automatically. No admin approves money.",
      blocks: [
        {
          kind: "steps",
          items: [
            {
              title: "Request",
              text: "Choose the amount and type (regular or medical), add an optional note and guarantor.",
            },
            {
              title: "Vote",
              text: "Members vote yes or no during the voting window (48 hours by default). The borrower can't vote.",
            },
            {
              title: "Paid out",
              text: "If enough members voted and most said yes, the loan is sent in the same transaction that closes the vote.",
            },
            {
              title: "Repay",
              text: "Interest is paid monthly into the vault; repay the loan whenever you like.",
            },
          ],
        },
        {
          kind: "p",
          text: "Loans arrive in a later update. The rules are already designed and listed on the rules page.",
        },
      ],
    },
    {
      id: "leave",
      heading: "How do I leave a circle?",
      answer:
        "Ask to leave, wait out the notice period (30 days by default), and your share is paid to your wallet automatically at the share price on that day.",
      blocks: [
        {
          kind: "list",
          items: [
            "Monthly payments continue during the notice period.",
            "You can't leave while you have an open loan or are guaranteeing someone else's.",
            "Payout is triggered automatically, and anyone can trigger it if the automation is down.",
          ],
        },
      ],
    },
  ],
};

export const FAQ: PublicPage = {
  slug: "faq",
  path: "/faq/",
  title: "Questions about WealthKart circles",
  description:
    "Straight answers: who holds the money, what happens if someone stops paying, what if you lose your wallet, and what WealthKart stores about you.",
  eyebrow: "Questions",
  h1: "Questions people ask before joining",
  intro:
    "Short answers first, details after. If something here is unclear, it's a bug in the page; tell us.",
  updated: UPDATED,
  schema: "FAQPage",
  sections: [
    {
      id: "what-is-it",
      heading: "What is a savings circle on Avalanche?",
      answer:
        "It's a private group of friends who each add AVAX every month into one shared vault, a smart contract on the Avalanche C-Chain. Members can borrow from it when the group votes yes.",
    },
    {
      id: "who-holds-money",
      heading: "Can WealthKart access our funds?",
      answer:
        "No. The money sits in your circle's own contract, and only the rules written in it can move it. WealthKart never holds keys or funds, and there is no admin switch to withdraw.",
    },
    {
      id: "is-it-investing",
      heading: "Is this an investment product?",
      answer:
        "No. WealthKart is a tool for friends who already trust each other to save and lend among themselves. Nothing is promised; the value of AVAX goes up and down.",
    },
    {
      id: "why-avax",
      heading: "Why save in AVAX and not rupees?",
      answer:
        "AVAX is the native money of Avalanche, so payments need no bank, no bridge and no approvals. The trade-off: the rupee value of your savings moves with the AVAX price. A borrower who takes 10 AVAX repays 10 AVAX plus interest, whatever the price.",
    },
    {
      id: "stops-paying",
      heading: "What happens if a member stops paying?",
      answer:
        "Late fees are added automatically and go into the vault. After 3 missed months the circle can vote to mark the member dormant: dues stop, and their shares stay theirs.",
    },
    {
      id: "lost-wallet",
      heading: "What if I lose my wallet?",
      answer:
        "WealthKart can't recover it, so back up your Core recovery phrase. You can name a nominee wallet that can claim your share after a vote and a notice period.",
    },
    {
      id: "personal-data",
      heading: "What does WealthKart store about me?",
      answer:
        "Nothing personal. Your wallet address is your identity and you choose a display name per circle. No real names, phone numbers or email addresses are stored anywhere.",
    },
    {
      id: "who-can-join",
      heading: "Can anyone join my circle?",
      answer:
        "No. Circles are private and invite-only. There is no public list of circles to browse.",
    },
    {
      id: "rule-changes",
      heading: "Can the rules be changed after we start?",
      answer:
        "Yes, by member vote. A change waits 7 days before it applies, and anyone who disagrees can leave with their share before it takes effect.",
    },
    {
      id: "costs",
      heading: "What does it cost?",
      answer:
        "WealthKart charges nothing. Each transaction costs a small Avalanche network fee in AVAX, paid by the member who sends it.",
    },
    {
      id: "which-wallet",
      heading: "Which wallet do I need?",
      answer:
        "Core Wallet, Avalanche's own wallet: the browser extension on a computer, or the Core app on your phone.",
    },
  ],
};

export const RULES: PublicPage = {
  slug: "rules",
  path: "/rules/",
  title: "Circle rules, defaults and limits",
  description:
    "Every setting a WealthKart circle can choose, with its default value and the limits the contract enforces. All deadlines are in UTC.",
  eyebrow: "Rules",
  h1: "Every circle setting, its default and its limits",
  intro:
    "How the rules work is fixed in code. Each circle picks the numbers when it is created, with defaults taken from a real friends' group that has run since 2018. All deadlines are in UTC.",
  updated: UPDATED,
  schema: "TechArticle",
  sections: [
    {
      id: "how-rules-work",
      heading: "Who decides a circle's rules?",
      answer:
        "The members. The creator picks the starting numbers; after that, changes need a member vote, wait 7 days, and apply from the next month.",
    },
    {
      id: "installment",
      heading: "What are the payment rules?",
      answer:
        "Everyone pays the same monthly amount in AVAX before 23:59:59 UTC on the due day. Late fees and payment holidays are set per circle.",
      blocks: [
        {
          kind: "table",
          head: ["Setting", "Default", "Limits"],
          rows: [
            ["Monthly amount", "Set by the creator, e.g. 0.5 AVAX", "Above 0"],
            ["Due day (23:59:59 UTC)", "10", "1 to 28"],
            ["Late fee 1 (after due day)", "0.01 AVAX", "0 or more"],
            ["Late fee 2 (after day 20)", "0.01 AVAX", "0 or more"],
            ["Payment holidays per year", "3", "0 to 12"],
            ["Missed months before a dormant vote", "3", "1 to 12"],
          ],
        },
      ],
    },
    {
      id: "loans",
      heading: "What are the loan rules?",
      answer:
        "Loans are capped by the circle's free cash, by a share of the fund, and by the borrower's own stake. Interest is charged monthly on the balance at the start of the month.",
      blocks: [
        {
          kind: "table",
          head: ["Setting", "Default", "Limits"],
          rows: [
            ["Interest per month", "1%", "0% to 5%"],
            [
              "Tenors",
              "6 months each, rate steps 1% to 1.5% to 2%, max 3",
              "1 to 24 months per tenor",
            ],
            ["Reserve kept back", "20% of fund", "0% to 80%"],
            ["Max loan per member", "40% of fund", "1% to 100%"],
            ["Loan cap vs stake", "2 times (own + guarantor stake)", "1 to 10 times"],
            ["Minimum one month's interest", "On", "On or off"],
            ["Medical loans", "3 interest-free months, once a year", "0 to 12 months"],
            ["Guarantor required", "Off", "On or off"],
            ["Late fee on interest", "0.01 AVAX", "0 or more"],
            ["Missed interest months before default", "2", "1 to 6"],
          ],
        },
      ],
    },
    {
      id: "voting",
      heading: "How does voting work?",
      answer:
        "A vote passes when enough active members take part (the quorum) and more than the pass mark say yes. Loans, new members, fee waivers and rule changes all go to a vote.",
      blocks: [
        {
          kind: "table",
          head: ["Setting", "Default", "Limits"],
          rows: [
            ["Voting window", "48 hours (medical 24 hours)", "1 hour to 14 days"],
            ["Quorum (of active members)", "50%", "20% to 100%"],
            ["Pass mark", "More than 50%", "50% to 100%"],
            ["Pass mark to close the circle", "66%", "50% to 100%"],
            ["Wait before a rule change applies", "7 days", "3 to 30 days"],
          ],
        },
      ],
    },
    {
      id: "membership",
      heading: "What are the membership rules?",
      answer:
        "Circles are invite-only. Members can leave after a notice period and are paid their share automatically.",
      blocks: [
        {
          kind: "table",
          head: ["Setting", "Default", "Limits"],
          rows: [
            ["Max members", "Unlimited", "3 or more"],
            ["Members needed before loans", "3", "3 or more"],
            ["Exit notice period", "30 days", "0 to 90 days"],
            ["Exit fee", "0%", "0% to 10%"],
          ],
        },
      ],
    },
    {
      id: "penalties",
      heading: "Where do penalties go?",
      answer:
        "Into the circle's vault, so every member benefits. Fees can be waived only by a member vote, with the reason recorded on-chain.",
    },
  ],
};

export const SECURITY: PublicPage = {
  slug: "security",
  path: "/security/",
  title: "Security: who can move a circle's money",
  description:
    "Each circle has its own contract that can't be changed or upgraded. WealthKart holds no keys, no funds and no personal data. Current status and addresses.",
  eyebrow: "Security",
  h1: "Who can move a circle's money, and who can't",
  intro:
    "The short version: only the rules in your circle's contract can move its money, the contract can't be swapped out, and WealthKart holds nothing.",
  updated: UPDATED,
  schema: "TechArticle",
  sections: [
    {
      id: "custody",
      heading: "Who holds the money?",
      answer:
        "Your circle's own vault contract on the Avalanche C-Chain. WealthKart never holds keys or funds, and no single person can withdraw.",
    },
    {
      id: "immutable",
      heading: "Can the contract be changed after we join?",
      answer:
        "No. Circle contracts are immutable, with no upgrade proxies. A new version can only be adopted if the members vote to move to it.",
    },
    {
      id: "pause",
      heading: "Can anyone freeze the circle?",
      answer:
        "Only briefly. An emergency pause lasts at most 14 days, and it never blocks members from leaving with their share. A circle can vote to turn the pause off.",
    },
    {
      id: "no-admin-money",
      heading: "Does an admin approve payments or loans?",
      answer:
        "No. Payments are checked by the contract, and loans, new members and rule changes are decided by member vote.",
    },
    {
      id: "data",
      heading: "What personal data is stored?",
      answer:
        "None. There is no user database. Your wallet address is your identity, and the app reads everything from the chain.",
    },
    {
      id: "status",
      heading: "Is WealthKart live with real money?",
      answer:
        "Not yet. It runs on the Fuji testnet while the contracts are tested. We will only move to Avalanche mainnet after an external audit.",
      blocks: [
        {
          kind: "list",
          items: [
            "Testing: production-style scenario tests, fuzzing and invariant checks on every change.",
            "Audit: an external audit is planned before mainnet; the report will be linked here.",
            "Bug bounty: a testnet bug bounty runs before mainnet.",
          ],
        },
      ],
    },
    {
      id: "wallet-loss",
      heading: "What if my wallet is stolen or lost?",
      answer:
        "WealthKart can't reverse transactions or recover wallets. Back up your Core recovery phrase and consider naming a nominee wallet.",
    },
    addressesSection(),
  ],
};

/** Public help pages, in nav and llms.txt order. */
export const PUBLIC_PAGES: readonly PublicPage[] = [HOW_IT_WORKS, RULES, SECURITY, FAQ];

export function pageBySlug(slug: string): PublicPage | undefined {
  return PUBLIC_PAGES.find((p) => p.slug === slug);
}
