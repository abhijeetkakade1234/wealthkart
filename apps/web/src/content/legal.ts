import type { PublicPage } from "./pages";

/**
 * Legal pages: privacy policy, terms of use and risks (ADR 0055). Same shape as the help
 * pages in `pages.ts`, so they get the same layout, `.md` twins, llms.txt entries, OG cards
 * and sitemap rows, but no page JSON-LD and no header link (footer only).
 *
 * These are drafts. A lawyer reviews them before mainnet; the open questions are listed in
 * `docs/legal/README.md`. Plain words, no promises about money (ADR 0005, ADR 0024): the
 * S-LEGAL tests fail on words like "returns", "profit" or "yield", even in a denial.
 *
 * What the privacy policy says the app stores must match the code. If you add a browser
 * storage key, a third-party request or a new indexer table, update PRIVACY in the same PR.
 */

const UPDATED = "2026-11-16";

/** Shown at the top of every legal page until the lawyer review is done. */
export const DRAFT_NOTE =
  "Draft, pending legal review. We wrote this page in plain words and a lawyer hasn't checked it yet. It will be reviewed before WealthKart moves to Avalanche mainnet.";

const REPO = "https://github.com/abhijeetkakade1234/wealthkart";

const CONTACT_LINKS = [
  { label: "Open an issue on GitHub", href: `${REPO}/issues` },
  { label: "Report a security problem privately", href: `${REPO}/security/policy` },
];

export const PRIVACY: PublicPage = {
  slug: "privacy",
  path: "/privacy/",
  title: "Privacy policy",
  description:
    "WealthKart stores no names, phone numbers or email addresses, runs no analytics and sells nothing. What is public on-chain, and what stays in your browser.",
  eyebrow: "Privacy",
  h1: "What we know about you, which is very little",
  intro:
    "WealthKart is built so that we hold almost nothing about you. There is no account, no user database and no tracking. This page lists everything that does get stored, where it lives and who can see it.",
  updated: UPDATED,
  draftNote: DRAFT_NOTE,
  sections: [
    {
      id: "summary",
      heading: "What does WealthKart collect about you?",
      answer:
        "No names, phone numbers, email addresses, ID documents or KYC. Your wallet address is your identity. We don't run analytics or ads, and we don't sell or share data.",
    },
    {
      id: "public-chain",
      heading: "What is public on Avalanche?",
      answer:
        "Everything you do in a circle. Your wallet address, payments, loans, votes and display name are recorded on the Avalanche blockchain, where anyone can read them. That is how a public blockchain works; it isn't WealthKart collecting anything.",
      blocks: [
        {
          kind: "list",
          items: [
            "Anyone who has your wallet address can see its activity on Snowtrace or any other block explorer.",
            "If someone links your address to you in real life, they can see your circle activity too. If that matters to you, use a wallet you don't use for anything else.",
            "The public repayment record page shows a wallet's on-chain loan history to anyone who has the address.",
          ],
        },
      ],
    },
    {
      id: "display-names",
      heading: "Is my display name private?",
      answer:
        "No. The name you pick in each circle is saved on-chain, and anyone can read it. Pick a nickname, not your real name.",
    },
    {
      id: "browser",
      heading: "What does the app keep in my browser?",
      answer:
        "A few small items, only on your device, so the app remembers your wallet connection and opens offline. We can't read them. Clearing this site's data in your browser removes all of them.",
      blocks: [
        {
          kind: "list",
          items: [
            "wagmi.store (local storage): your connected wallet address, the network and which wallet you used, so you stay signed in.",
            "wagmi.recentConnectorId (local storage): the wallet you used last, which is Core.",
            "wagmi.injected.connected and wagmi.app.core.extension.disconnected (local storage): whether you signed in or out, so the app doesn't reconnect after you sign out.",
            "wk:join:<circle>:<wallet> (session storage): the number of your join request, so you can see the result after a reload. It goes away when you close the tab.",
            "wk:reminders (local storage), only if you turn on reminders: this device's push address, a device token, your wallet address and the network.",
            "App files (the service worker's cache): copies of the app's pages, code and fonts, so it opens without a connection. They hold no personal data.",
          ],
        },
        {
          kind: "p",
          text: "WealthKart sets no cookies of its own.",
        },
      ],
    },
    {
      id: "indexer",
      heading: "What does the indexer store?",
      answer:
        "Copies of public events from circle contracts, so charts and the activity feed load quickly. It is the same data anyone can read from the chain.",
      blocks: [
        {
          kind: "list",
          items: [
            "It runs on Cloudflare Workers with a Cloudflare D1 database.",
            "It holds circle addresses, block numbers and the events those circles emitted: payments, votes, display names, loans and exits.",
            "It also keeps health alerts about circle balances, for our own monitoring.",
            "Its API is public. If it is down, the app reads the chain directly.",
          ],
        },
      ],
    },
    {
      id: "reminders",
      heading: "What happens if I turn on reminders?",
      answer:
        "Reminders are off unless you turn them on. If you do, we store your browser's push address and your wallet address so we can tell you when a payment or a vote is due. Nothing else.",
      blocks: [
        {
          kind: "list",
          items: [
            "To turn them on you sign a message in your wallet. That proves the address is yours. It is not a transaction and costs nothing.",
            "Stored in the indexer's database: the push endpoint your browser gives us, two public keys used to encrypt the message, a hash of a device token, your wallet address, the circles and kinds of reminder you chose, and a log of sent reminders so none goes out twice. Log entries are deleted after 120 days.",
            "Each reminder travels through your browser maker's push service (Google for Chrome, Mozilla for Firefox, Apple for Safari). They see that a message went to your device; the text itself is encrypted.",
            "To delete it, turn reminders off in the app. That removes this device's record straight away. If you block notifications or uninstall the app instead, the push service refuses the next reminder and we delete the record then.",
          ],
        },
      ],
    },
    {
      id: "hosting",
      heading: "Who hosts the website?",
      answer:
        "Cloudflare. Like any web host, Cloudflare processes your IP address and request details to deliver pages and block attacks, and may keep logs for a short time. We don't use those logs to identify or follow anyone.",
      blocks: [
        {
          kind: "links",
          items: [
            {
              label: "Cloudflare's privacy policy",
              href: "https://www.cloudflare.com/privacypolicy/",
            },
          ],
        },
      ],
    },
    {
      id: "third-parties",
      heading: "Who else sees my requests?",
      answer:
        "The services the app has to talk to. Each one sees your IP address and what it is asked for, under its own privacy policy.",
      blocks: [
        {
          kind: "list",
          items: [
            "A public Avalanche RPC endpoint, run by Ava Labs, answers the app's reads from the chain. It sees the addresses the app looks up.",
            "Core Wallet, also made by Ava Labs, talks to its own servers.",
            "Snowtrace links open a third-party block explorer.",
            "Fonts are served from our own site, not from Google.",
            "Today the app connects to Core through the browser extension or Core's in-app browser. When we add Core's phone app through WalletConnect, run by Reown, the connection will pass through Reown's relay servers, and we will update this page before that ships.",
          ],
        },
      ],
    },
    {
      id: "no-tracking",
      heading: "Do you use analytics, ads or trackers?",
      answer:
        "No. There are no analytics scripts, ad networks, tracking pixels or third-party cookies in the app or on the website. We don't sell data, and we have none worth selling.",
    },
    {
      id: "children",
      heading: "Can children use WealthKart?",
      answer:
        "No. WealthKart is for adults aged 18 and over. We collect no names or ages, so we can't tell who anyone is, but please don't use it if you are under 18.",
    },
    {
      id: "dpdp",
      heading: "What about India's DPDP Act 2023?",
      answer:
        "We process almost no personal data. Where a wallet address or a push address counts as personal data, we use it only to run the feature you asked for, and you can delete what we hold.",
      blocks: [
        {
          kind: "list",
          items: [
            "Reminders: turn them off and the record is deleted.",
            "Your browser: clear this site's data.",
            "The blockchain: data written on-chain can't be changed or erased by anyone, including us. A display name, a payment or a vote is permanent once it is confirmed.",
            "The indexer only copies public chain data. Deleting a copy wouldn't remove anything from the chain.",
          ],
        },
      ],
    },
    {
      id: "contact",
      heading: "How do I contact you about privacy?",
      answer:
        "Open an issue on our GitHub repository. For anything sensitive, use GitHub's private security report instead. We don't publish an email address because we don't want to hold yours.",
      blocks: [{ kind: "links", items: CONTACT_LINKS }],
    },
    {
      id: "changes",
      heading: "Will this policy change?",
      answer:
        "If what we store changes, we update this page first and change the date at the top. A feature that needs new data stays off until you turn it on.",
    },
  ],
};

export const TERMS: PublicPage = {
  slug: "terms",
  path: "/terms/",
  title: "Terms of use",
  description:
    "WealthKart is free, open-source software for private circles of friends. It never holds your money and can't undo anything on the chain.",
  eyebrow: "Terms",
  h1: "Terms of use",
  intro:
    "These terms cover the WealthKart website and app. The short version: WealthKart is free, open-source software. It never holds your money, it can't undo anything you do on the chain, and the circles you join are arrangements between you and your friends.",
  updated: UPDATED,
  draftNote: DRAFT_NOTE,
  sections: [
    {
      id: "what-it-is",
      heading: "What is WealthKart?",
      answer:
        "Open-source software that lets a small group of friends run a savings circle through a smart contract on Avalanche. It is a tool, like a shared ledger the whole group can check.",
      blocks: [
        {
          kind: "list",
          items: [
            "WealthKart is not a bank, a lender, a deposit-taker, a chit fund, a collective investment scheme, a broker or a financial adviser.",
            "Nothing on this site is financial, legal or tax advice.",
            "The code is published under the MIT licence. Anyone can read, copy and run it.",
          ],
        },
      ],
    },
    {
      id: "agreement",
      heading: "When do these terms apply?",
      answer:
        "Whenever you use the website or the app. Connecting your wallet on the sign-in page means you accept them. If you don't agree, please don't use WealthKart.",
      blocks: [
        {
          kind: "p",
          text: "You must be 18 or older and able to enter a contract where you live.",
        },
      ],
    },
    {
      id: "custody",
      heading: "Who holds the money?",
      answer:
        "Your circle's own contract. WealthKart never holds your keys or your funds, so we can't move, freeze, reverse or recover anything.",
      blocks: [
        {
          kind: "list",
          items: [
            "A transaction is final once the network confirms it.",
            "Money sent to a wrong address can't be brought back by anyone.",
            "The app shows what you are about to do, but your wallet sends it. Read what your wallet asks you to confirm.",
          ],
        },
      ],
    },
    {
      id: "circles",
      heading: "Who sets a circle's rules?",
      answer:
        "The members. A circle is a private arrangement between people who already know each other. They choose its numbers when they start it and change them by vote. WealthKart is not a party to that arrangement.",
      blocks: [
        {
          kind: "list",
          items: [
            "WealthKart doesn't check members, judge whether anyone can repay, or step in if a member breaks a promise.",
            "Disagreements between members are for the members to settle. The contract only does what its rules say.",
            "There is no public list of circles, and WealthKart never introduces strangers to each other.",
          ],
        },
      ],
    },
    {
      id: "contracts",
      heading: "Can the contracts change?",
      answer:
        "No. A circle's contract is fixed once it is created, with no upgrade switch. The rules in the code are the rules, including any mistakes in it.",
      blocks: [
        {
          kind: "list",
          items: [
            "An emergency pause can stop new loans and joins for at most 14 days. It never stops members from leaving.",
            "A circle moves to a newer version only if its members vote to.",
          ],
        },
      ],
    },
    {
      id: "network",
      heading: "Is WealthKart live with real money?",
      answer:
        "Not yet. It runs on the Avalanche Fuji test network, where tokens have no value. We will move to Avalanche mainnet only after an external security audit.",
      blocks: [
        {
          kind: "p",
          text: "An audit lowers the chance of a bug but can't rule one out. Read the risks page before you put real money in.",
        },
      ],
    },
    {
      id: "no-promises",
      heading: "Does WealthKart promise anything about money?",
      answer:
        "No. Nobody promises that you will get back more than you put in, or even all of it. Prices move, borrowers can fail to repay, and code can fail.",
      blocks: [
        {
          kind: "list",
          items: [
            "We never advertise gains, and you must not either when you invite people.",
            "Numbers the app shows about a circle describe its own past activity, read from the chain. They say nothing about the future.",
          ],
        },
      ],
    },
    {
      id: "your-part",
      heading: "What are you responsible for?",
      answer: "Your wallet, your choices, and following the law where you live.",
      blocks: [
        {
          kind: "list",
          items: [
            "Keep your recovery phrase safe and private. WealthKart will never ask for it.",
            "Only start or join a circle with people you know and trust.",
            "Make sure a circle's rules, a loan or a vote makes sense to you before you confirm it.",
            "Follow the laws that apply to you, including any on savings groups, lending and crypto assets.",
            "Report and pay your own taxes. In India, gains on crypto assets are taxed and transfers can attract TDS. The app can export your circle history as a CSV file.",
          ],
        },
      ],
    },
    {
      id: "not-allowed",
      heading: "What can't you use WealthKart for?",
      answer:
        "Anything illegal, and anything that turns a private circle of friends into a public money scheme.",
      blocks: [
        {
          kind: "list",
          items: [
            "Laundering money or hiding where it came from.",
            "Use by, or on behalf of, anyone on a sanctions list or in a sanctioned country.",
            "Scams, fraud, or tricking people into joining.",
            "Advertising a circle to the public, collecting money from strangers, or promising members gains.",
            "Running a circle as a business that takes deposits from or lends to the public.",
            "Attacking the contracts, the app or the indexer outside the bug bounty rules in our security policy.",
          ],
        },
        {
          kind: "p",
          text: "We can't stop a contract from working, but we may stop serving the website to anyone we believe is breaking these rules.",
        },
      ],
    },
    {
      id: "third-parties",
      heading: "What about Core, Avalanche and Tether?",
      answer:
        "They are run by others under their own terms. WealthKart doesn't control Core Wallet, the Avalanche network, public RPC endpoints, Snowtrace, Cloudflare or the USDT token, and isn't responsible for them.",
    },
    {
      id: "warranty",
      heading: "Is there a warranty?",
      answer:
        "No. The software is provided as is, without warranty of any kind, as the MIT licence says. You use it at your own risk.",
    },
    {
      id: "liability",
      heading: "What is WealthKart liable for?",
      answer:
        "As far as the law allows, nothing. WealthKart is free, and we aren't liable for lost funds, lost wallets, bugs, network problems, price moves or what other members do.",
      blocks: [
        {
          kind: "p",
          text: "Some laws don't allow these limits. Where that is the case, our liability is limited to the smallest amount the law permits.",
        },
      ],
    },
    {
      id: "law",
      heading: "Which law applies?",
      answer:
        "The laws of India. The courts in [city to be confirmed] have exclusive jurisdiction over any dispute about these terms.",
    },
    {
      id: "changes",
      heading: "Can these terms change?",
      answer:
        "Yes. We change the date at the top, and every change is visible in the project's public history on GitHub. If you keep using WealthKart after a change, the new terms apply.",
    },
    {
      id: "contact",
      heading: "How do I reach you?",
      answer:
        "Open an issue on our GitHub repository. For a security problem, use the private report described in our security policy, not a public issue.",
      blocks: [{ kind: "links", items: CONTACT_LINKS }],
    },
  ],
};

export const RISKS: PublicPage = {
  slug: "risks",
  path: "/risks/",
  title: "Risks of saving in a WealthKart circle",
  description:
    "What can go wrong: contract bugs, lost wallets, price drops, USDT freezes, unpaid loans, votes and notice periods. Read this before you join a circle.",
  eyebrow: "Risks",
  h1: "What can go wrong, in plain words",
  intro:
    "Saving with friends on a blockchain has risks a bank account doesn't. Read this before you join a circle, and don't put in money you can't afford to lose.",
  updated: UPDATED,
  draftNote: DRAFT_NOTE,
  sections: [
    {
      id: "bugs",
      heading: "Can the contracts have bugs?",
      answer:
        "Yes. The contracts are tested heavily, but testing never finds everything, and the external audit hasn't happened yet. Contracts can't be changed, so a bug can't be fixed in place.",
      blocks: [
        {
          kind: "list",
          items: [
            "A bug could lock up or lose a circle's money.",
            "The external audit comes before mainnet, and its report will be linked from the security page.",
            "A public bug bounty runs on the test network before mainnet.",
            "If a bug is found, members can vote to move to a new circle. Until they do, the old one keeps its rules.",
          ],
        },
      ],
    },
    {
      id: "lost-wallet",
      heading: "What if I lose my wallet or recovery phrase?",
      answer:
        "Your share of the circle is lost to you. Nobody, including WealthKart, can recover a wallet or move your share to a new one.",
      blocks: [
        {
          kind: "list",
          items: [
            "You can name a nominee wallet that can claim your share after a member vote and a notice period.",
            "Anyone who gets your recovery phrase can act as you: pay, vote, borrow up to your limit, or leave and take your share.",
          ],
        },
      ],
    },
    {
      id: "price",
      heading: "Can the value of my savings fall?",
      answer:
        "Yes. A circle in AVAX is worth whatever AVAX is worth, and that price can drop a lot in a day. Your share is counted in AVAX, not rupees.",
      blocks: [
        {
          kind: "p",
          text: "A USDT circle tracks the US dollar, not the rupee, so its rupee value still moves. USDT could also lose its link to the dollar.",
        },
      ],
    },
    {
      id: "usdt",
      heading: "What extra risks come with a USDT circle?",
      answer:
        "Tether, the company behind USDT, can freeze any address, including your circle's vault. If it freezes the vault, every member's USDT in it is stuck and no code can move it.",
      blocks: [
        {
          kind: "list",
          items: [
            "If Tether freezes your own address, your payouts wait in the circle until Tether unfreezes it.",
            "If a member pays with USDT that came from a hack, Tether could freeze the whole vault.",
            "Tether can switch on a transfer fee. Up to 1%, the circle absorbs it and every share is worth a little less. Above 1%, USDT payments stop working and members can only leave or close the circle.",
            "You still need a little AVAX in your wallet for network fees.",
          ],
        },
      ],
    },
    {
      id: "repay",
      heading: "What if a friend doesn't repay a loan?",
      answer:
        "The circle loses that money, and every member's share is worth less. The contract adds late fees and lets members mark a loan as defaulted, but it can't make anyone pay.",
      blocks: [
        {
          kind: "list",
          items: [
            "After 2 months of unpaid interest (by default), the loan can be marked as defaulted. The borrower's share is frozen, and so is the guarantor's if there is one. Frozen shares may not cover what is owed.",
            "If you guarantee someone's loan, your share can be frozen when they default, and you can't leave the circle while that loan is open.",
            "The reserve, the cap per member and the cap tied to each borrower's own savings make a large loss less likely. They don't remove the risk.",
          ],
        },
      ],
    },
    {
      id: "votes",
      heading: "Can a vote go against me?",
      answer:
        "Yes. Loans, new members, rule changes, fee waivers, marking someone dormant and closing the circle are all decided by member vote, and you can be outvoted.",
      blocks: [
        {
          kind: "list",
          items: [
            "A rule change waits 7 days (by default) before it applies, so you can leave before it does.",
            "A circle can be closed by a 66% vote. Everyone is then paid their share.",
            "Members can agree among themselves how to vote. The contract can't stop a group of friends from siding together, which is why you should only join people you trust.",
          ],
        },
      ],
    },
    {
      id: "waiting",
      heading: "How quickly can I get my money out?",
      answer:
        "Not instantly. Leaving has a notice period (30 days by default, up to 90), and you keep paying during it. You can't leave while you have an open loan or are guaranteeing one.",
      blocks: [
        {
          kind: "list",
          items: [
            "You are paid at the share price on the day the notice ends, which can be lower than when you asked.",
            "A circle can set an exit fee of up to 10%. It stays in the circle.",
            "If most of the circle's money is lent out, leavers wait in a queue until enough comes back.",
            "If you miss several months, the circle can vote to mark you dormant. Your payments stop and your share stays yours until you come back.",
            "An emergency pause can stop new loans and joins for up to 14 days. It never stops anyone from leaving.",
          ],
        },
      ],
    },
    {
      id: "fees",
      heading: "What do network fees cost?",
      answer:
        "Every transaction pays a small fee in AVAX to the Avalanche network. Fees are usually tiny but rise when the network is busy, and a failed transaction still costs its fee.",
      blocks: [
        {
          kind: "p",
          text: "Deadlines are checked on-chain in UTC. A payment that confirms after 23:59:59 UTC on the due day is late, even if you sent it earlier, so pay with time to spare.",
        },
      ],
    },
    {
      id: "law",
      heading: "Could the law change?",
      answer:
        "Yes. Rules on crypto assets, savings groups and lending are still changing in India and elsewhere. A new law could make it harder to use, cash out or pay tax on your savings.",
      blocks: [
        {
          kind: "p",
          text: "WealthKart might have to stop serving the website in some places. The circle contracts would keep running, and members could still use them directly.",
        },
      ],
    },
    {
      id: "testnet",
      heading: "Are test-network tokens worth anything?",
      answer:
        "No. On the Fuji test network, AVAX and test USDT have no value and can't be sold. Anything you do there is practice. Never pay anyone for test tokens.",
    },
    {
      id: "dependencies",
      heading: "What if a service WealthKart depends on goes down?",
      answer:
        "The website may not load, or exits may be paid out late. WealthKart depends on Core Wallet, the Avalanche network, public RPC endpoints, Cloudflare and Chainlink Automation.",
      blocks: [
        {
          kind: "p",
          text: "Your money stays in the contract either way. Anyone can trigger waiting exits by hand if the automation stops.",
        },
      ],
    },
    {
      id: "scams",
      heading: "How do scammers target circles?",
      answer:
        "Mostly with fake links and look-alike sites. Check the site address and the circle address before you pay, and never share your recovery phrase. WealthKart will never ask for it.",
    },
  ],
};

/** Legal pages, in footer and llms.txt order. */
export const LEGAL_PAGES: readonly PublicPage[] = [PRIVACY, TERMS, RISKS];

export function legalPageBySlug(slug: string): PublicPage | undefined {
  return LEGAL_PAGES.find((p) => p.slug === slug);
}
