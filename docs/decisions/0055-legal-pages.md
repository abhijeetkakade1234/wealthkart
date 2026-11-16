# 0055. Legal pages: privacy policy, terms of use and risks, as drafts

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

The founder asked for a privacy policy "and other things". WealthKart had none. Three facts shape what those pages can say:

- We hold almost no data. There is no account or user database (ADR 0004, 0011). Everything a member does is public on Avalanche, and the indexer only copies public chain events (ADR 0036, 0047).
- We never hold keys or funds, contracts are immutable (ADR 0020), and circles are private groups of friends with no public discovery (ADR 0005, 0035). Public copy must never advertise returns (ADR 0024).
- The app runs on Fuji now and moves to mainnet only after an external audit (ADR 0051). A lawyer has not reviewed anything yet; "book the lawyer review" was already an open owner action.

Before mainnet, a member must be able to read in plain words what we store, what they agree to, and what can go wrong.

## Decision

- **Three public pages:** `/privacy`, `/terms` and `/risks`. Content lives in `apps/web/src/content/legal.ts` with the same `PublicPage` shape as the help pages (ADR 0027), so each gets the shared layout, a `.md` twin, an llms.txt entry, an OG card and a sitemap row. They are indexable. They are linked from the footer, in their own "Legal" row, and not from the header.
- **No page JSON-LD.** `docs/seo.md` §3 names a schema type for every help page and none for legal pages, so `schema` is optional and legal pages leave it out. The site-wide `Organization` and `WebSite` blocks still apply.
- **Draft until reviewed.** Every legal page shows a quiet note under the title: "Draft, pending legal review." The note goes away only after the lawyer review, when `draftNote` is removed from each page in the same PR that records the review. The questions for the lawyer are in `docs/legal/README.md`.
- **What the pages promise:**
  - Privacy: no names, phone numbers, email, KYC, analytics, ads, trackers or cookies of our own; no selling data. Wallet activity and display names are public on-chain by nature, and on-chain data can't be erased by anyone. Every browser storage key the app writes is listed. The indexer holds public chain data only. Reminders (ADR 0052) store a push endpoint and wallet address only if the member turns them on, and turning them off deletes the device record. Cloudflare hosting, the public RPC, Core and (later) WalletConnect/Reown are named as third parties. Contact is GitHub issues or GitHub's private security report; no email address is published.
  - Terms: WealthKart is MIT-licensed open-source software, not a bank, lender, deposit-taker, chit fund, investment scheme, broker or adviser. It is non-custodial and can't reverse or recover anything. Circles are private arrangements between members. Nobody promises any gain. Users must be 18+, keep their phrase safe, follow local law and pay their own tax. Prohibited uses include laundering, sanctioned persons, scams and public solicitation. No warranty, liability limited as far as the law allows. Indian law, with the court city left as `[city to be confirmed]` for the lawyer.
  - Risks: contract bugs and audit status, lost wallets, price moves, USDT freezes and fees (ADR 0046, 0050), unpaid loans and guarantees, votes, notice periods and exit queues, network fees and UTC deadlines, regulatory change, valueless testnet tokens, dependency outages and scams.
- **The privacy policy is tested against the code.** `S-LEGAL-04` fails if a new source file touches browser storage or cookies without being on the list the policy covers, if a tracker library appears, or if Google Fonts are linked directly. Any change to what the app stores updates `PRIVACY` in the same PR.
- **The sign-in page says it.** Under "Connect Core": "By connecting you agree to the Terms and have read the Risks and the Privacy policy", with links. There is no checkbox: connecting is the act, and a checkbox would need storage to remember it.
- **Copy rules.** Plain words per the `human-writing-style` skill. The words banned by S-WEB-20 and S-LAND-07 ("returns", "profit", "yield", "guaranteed" and so on) are banned on legal pages too, even in a denial, so "we don't promise returns" is written as "nobody promises that you will get back more than you put in".

## Alternatives considered

- **A generated policy from a template site.** Those assume accounts, cookies, analytics and email, none of which we have. They would promise things we don't do and miss the on-chain points that matter most.
- **One combined "Legal" page.** Harder to link to a single topic (the sign-in line links two of them), and answer engines quote shorter pages better.
- **Waiting for the lawyer before publishing anything.** Testnet users would have no statement at all of what is stored or what can go wrong. A clearly marked draft is better than nothing, and it gives the lawyer a concrete text to mark up.
- **A consent checkbox on sign-in.** Adds a step and a stored flag for little gain; the lawyer can ask for it if Indian law needs it (listed in the checklist).

## Consequences

- Footer, sitemap, llms.txt, llms-full.txt and OG cards each gained a legal block. Help-page code paths are unchanged.
- The "never advertise returns" check now also covers legal copy, which forces careful wording in the terms and risks pages.
- Whoever ships a feature that stores something new (a storage key, an indexer table, a third-party call) must update the privacy policy, or S-LEGAL-04 fails.
- Before mainnet: lawyer review of all three pages (TODO, `docs/legal/README.md`), then remove the draft notes and set the court city.
