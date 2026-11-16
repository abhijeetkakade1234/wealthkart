# docs/legal

**What's here:** the brief for the lawyer who reviews WealthKart's legal pages before mainnet (ADR 0055). The pages themselves are code: `apps/web/src/content/legal.ts`, served at `/privacy`, `/terms` and `/risks`.
**Open this when:** booking or preparing the lawyer review, changing what the app stores, or removing the "Draft, pending legal review" notes.

## Where things stand

| Page    | Route       | Source                                       | Status                                             |
| ------- | ----------- | -------------------------------------------- | -------------------------------------------------- |
| Privacy | `/privacy/` | `PRIVACY` in `apps/web/src/content/legal.ts` | Draft, written 2026-11-16, not reviewed            |
| Terms   | `/terms/`   | `TERMS` in the same file                     | Draft, court city left as `[city to be confirmed]` |
| Risks   | `/risks/`   | `RISKS` in the same file                     | Draft, not reviewed                                |

Each page also has a Markdown twin (`/privacy.md`, `/terms.md`, `/risks.md`), which is the easiest thing to send the lawyer.

## What WealthKart actually stores (audit, 2026-11-16)

Checked in the code, not assumed. `S-LEGAL-04` keeps this honest: it fails if a new file touches browser storage or cookies, or if a tracker library shows up.

- **No user database.** The site is a static export on Cloudflare Pages. No names, phone numbers, email, KYC or documents anywhere (ADR 0004).
- **On-chain (public, permanent, not ours):** wallet addresses, payments, loans, votes, display names, nominee wallets, reputation records.
- **Browser, local storage:** `wagmi.store` (connected address, chain, connector), `wagmi.recentConnectorId`, `wagmi.injected.connected`, `wagmi.app.core.extension.disconnected`. These are written by the wagmi library because `apps/web/src/lib/wagmi.ts` uses its default storage.
- **Browser, session storage:** `wk:join:<circle>:<wallet>` holds a join request id (`apps/web/src/app/app/join/page.tsx`).
- **Browser, reminders (ADR 0052, being built):** `wk:reminders` holds the push endpoint, a device token, wallet address and chain id (`apps/web/src/lib/push.ts`).
- **Browser, Cache Storage:** the service worker (`apps/web/public/sw.js`) caches pages and static assets. No RPC, cross-origin or non-GET requests.
- **Cookies:** none set by the app.
- **Indexer (Cloudflare Worker + D1):** `circles`, `logs` (public chain events), `meta` (cursor), `alerts` (solvency alerts, ADR 0041). With reminders: `push_subs` (endpoint, two public keys, token hash, wallet address), `push_watch` (wallet, circle, reminder kinds), `push_sent` (dedupe log, pruned after 120 days), `push_nonces`, `push_rate`.
- **Third parties the browser talks to:** Cloudflare (hosting, indexer), the public Avalanche RPC (`api.avax-test.network` / `api.avax.network`, Ava Labs), Core Wallet (Ava Labs), Snowtrace (only when a link is opened), browser push services (only with reminders). Fonts are self-hosted by `next/font`; no Google Fonts requests at runtime.
- **Not used today:** WalletConnect/Reown (the packages are in the lockfile as wagmi dependencies but no connector is configured), analytics, ads, error trackers.

## Checklist for the lawyer

Please mark up the three pages and answer these. Each point names where it shows up.

1. **Jurisdiction and governing law.** Terms say Indian law; which city's courts (`[city to be confirmed]` in the "Which law applies?" section)? Is an arbitration clause better? Who is the contracting party while there is no company: the individual maintainer?
2. **Chit Funds Act, 1982 and state chit fund rules.** Circles pool monthly payments but have no rotating prize, auction or payout by turn; loans are voted and repaid with interest. Does that keep them outside "chit"? Does the answer change with circle size (cap 50, ADR 0045)?
3. **Banning of Unregulated Deposit Schemes Act, 2019 (BUDS).** Members' monthly payments into a contract that only members can withdraw from, with no promised return and no company receiving money. Is any part a "deposit", and is WealthKart (the software publisher) a "deposit taker" or a promoter?
4. **RBI / NBFC rules (RBI Act, 1934, s. 45-I, 45-IA).** Loans are made by a members' contract to members, not by WealthKart. Confirm the software publisher isn't carrying on a lending business. Any issue with interest at 1 to 5% a month?
5. **State money-lending acts** (for example the Maharashtra Money-Lending (Regulation) Act, 2014). Could a member or the circle be a "money-lender" needing a licence? Interest-rate caps?
6. **Collective investment schemes (SEBI Act s. 11AA).** We avoid "invest", never advertise gains, and present circles as savings among friends. Is that enough?
7. **DPDP Act, 2023 and the DPDP Rules.** Is a wallet address, a display name or a push endpoint personal data? Are we a data fiduciary for reminders? Do we need a named grievance officer, a consent notice in a set form, a response time, or a consent checkbox at sign-in? How to word "on-chain data can't be erased" against the right to erasure.
8. **Crypto rules.** PMLA reporting-entity status and FIU-IND registration for "virtual digital asset service providers": does a non-custodial open-source front end fall under it? Any effect from the RBI or government circulars on crypto?
9. **Tax.** Is the wording in the terms right: 30% tax on VDA gains, 1% TDS under s. 194S on transfers? Who deducts TDS on member-to-vault and vault-to-member transfers, if anyone? Is the CSV export enough to point members to?
10. **USDT.** Any extra exposure from offering a Tether-issued stablecoin (freezes, sanctions screening, foreign exchange rules under FEMA)?
11. **Sanctions and prohibited use.** Is the prohibited-use list enough, or do we need geo-blocking on the website? (The contracts can't block anyone.)
12. **Liability and warranty.** Do the MIT "as is" disclaimer and our limitation hold up under the Consumer Protection Act, 2019, given the app is free?
13. **Age.** Is "18 or older" right, and is a statement enough without any check?
14. **Changes to terms.** Is "new terms apply if you keep using it", with the date and GitHub history, enough notice?
15. **The sign-in line.** Is "By connecting you agree to the Terms and have read the Risks and the Privacy policy" a valid way to accept, or is a checkbox needed?
16. **Anything missing:** a cookie notice (we set none), an accessibility statement, an imprint.

## Things to check on our side before mainnet

- Reminders (ADR 0052): confirm the shipped behaviour matches the privacy page: what turning reminders off deletes (device record, per-circle choices), the 120-day log, and that the settings screen links to `/privacy/#reminders`.
- WalletConnect/Reown for Core mobile: when it ships, update the "third-parties" section of the privacy page and the audit list above in the same PR.
- Keep Cloudflare Web Analytics and similar off unless the privacy page is updated first.
- After the review: apply the lawyer's edits, set the court city, remove `draftNote` from each page (and `DRAFT_NOTE` if unused), bump `UPDATED`, and record the review in a new ADR that supersedes the draft status in ADR 0055.
