# WealthKart — Product & Build Plan

**WealthKart**: on-chain community savings-and-lending groups on Avalanche. Members contribute AVAX monthly into a group vault, borrow from it at rates the group votes on, and every rule is enforced by smart contracts.

**Terminology:** a group is called a **Circle** in the product. One wallet can be in any number of circles; a circle can have any number of members.

**Positioning:** private, invite-only circles of people who already know each other: friends, family, colleagues. WealthKart is software; it never holds keys or funds, promises no returns, and stores **no personal data**, only wallet addresses.

Status: planning · Last updated: 2026-11-14 · Current phase and todos: [`docs/STATUS.md`](docs/STATUS.md) · Decisions: [`docs/decisions/`](docs/decisions/README.md) · Testing: [`docs/testing.md`](docs/testing.md) · Engineering rules: [`docs/engineering.md`](docs/engineering.md)

---

## 1. Problem

Millions of informal savings groups (friends, family, colleagues, self-help groups, chit-style circles) pool money monthly and lend it to members. WealthKart G1 is one: 12 members since Apr 2018, ₹26.6L paid in, ₹35.7L value, ₹23.4L lent out, ~9% annual return.

They run on **a bank account + WhatsApp + one admin's spreadsheet**. Observed in G1's sheet:

- **Trust depends on one person.** Balances are hand-typed formulas like `=2500-50000`; history lives in comments.
- **No single source of truth.** Loan balances are typed in two places with no check.
- **Rules are written but not enforced.** Tenors, loan caps, minimum interest, guarantor freeze and medical limits all rely on memory.
- **Majority decisions happen in chat**, with no record.
- **Members are locked into one group**, the size is fixed, joining mid-way is messy, and nobody has portable proof of 8 years of on-time payments.

## 2. Solution

A mobile-first PWA on Avalanche where:

1. **Members contribute AVAX monthly** into their group's **vault contract**. The transfer itself is the proof of payment, so nobody has to check a bank statement.
2. **Loans are disbursed from the vault and repaid to it automatically**, with interest, tenors and fees computed by the contract.
3. **One wallet, many groups.** A user can join any number of groups, and each group can have any number of members (the group sets its own cap).
4. **Groups are invite-only.** An existing member shares an invite link or code, and existing members approve by vote. Joining mid-way is fair through **share-based accounting** (§3, D2).
5. **Rule changes, new members and big loans go through on-chain voting.**
6. **Members build a portable on-chain reputation**: months paid on time, loans repaid.

### Why blockchain

| Need              | Spreadsheet + bank                | WealthKart                                      |
| ----------------- | --------------------------------- | ----------------------------------------------- |
| Proof of payment  | Screenshot, admin checks the bank | The AVAX transfer is the proof                  |
| Custody           | One admin's bank login            | Vault contract; no single person can move funds |
| Rule enforcement  | Manual                            | The contract rejects invalid actions            |
| Joining / leaving | Recalculate shares by hand        | Shares minted and burned at NAV                 |
| Voting            | WhatsApp polls                    | Proposals, quorum, timelock                     |
| Many groups       | Separate sheets, separate trust   | One wallet, one dashboard                       |
| Reputation        | None                              | Soulbound on-chain record                       |

### Why Avalanche

- Sub-second finality and low C-Chain fees suit monthly micro-contributions.
- AVAX is the native asset, so there's no bridging and no token approvals for contributions.
- **Avalanche L1** later: a dedicated WealthKart chain with zero-fee gas and its own validators, plus **ICM** to move reputation and value between it and the C-Chain.
- An active India community (**Team1**) with grant, incubation and hackathon paths.

---

## 3. Key design decisions

### D1. Groups hold AVAX on-chain

- Each group is a **vault contract** holding native AVAX.
- The installment is set **in AVAX** (e.g. 0.5 AVAX/month), changeable only by group vote.
- Loans are disbursed and repaid in AVAX; interest is paid in AVAX.
- **Volatility:** the AVAX price moves, so the rupee value of contributions and loans moves too. A borrower who takes 10 AVAX repays 10 AVAX plus interest regardless of price. This is a feature to explain clearly in the UI ("you're saving in AVAX").
- **Future option (Phase 5):** let a group pick a **USD stablecoin (USDC)** as its vault asset at creation, for groups that want stable value. The contract is written asset-agnostic from day one (native AVAX or ERC-20) so this doesn't need a rewrite.

### D2. Multi-group, open membership, fair shares

- `user ↔ group` is many-to-many. The app shows a **group switcher plus a combined portfolio** (total AVAX across groups).
- Group size: unlimited by default; the group can set `maxMembers` (checked when a join vote settles).
- **Joining (ADR 0028):** the invite link is just the circle address; there is no secret code, because anything on-chain is public. Anyone with the link asks to join with a display name and, optionally, the member who invited them. Members who were in the circle when the request was made vote; it passes on quorum plus 66% yes. Members two or more months behind on dues can't vote. Founders named at creation must accept their invite within 14 days before they count. Someone who joins after this month's due day starts paying next month, with no late fee.
- **Share accounting (like a mutual fund NAV):** each contribution mints _vault shares_ at the current NAV (vault value ÷ total shares). Interest earned raises NAV for everyone, and a member's stake = shares × NAV.
  - Fixes G1's implicit "everyone owns 1/12", which breaks when people join late or skip months.
  - A late joiner simply buys in at today's NAV. There's no catch-up payment unless the group sets one.
- Shares are **non-transferable** (soulbound to the member within that group).
- **Exit with notice period, auto-payout:**
  1. Member calls `requestExit()`. A notice period starts (circle setting, default 30 days). Their dues continue until the end of the notice period.
  2. At the end of the notice period, the contract **snapshots NAV and computes their exact share**: shares × NAV, minus any unpaid dues or fees.
  3. **AVAX is sent to their wallet automatically**: Chainlink Automation (live on Avalanche C-Chain) calls `processExits()` daily. As a fallback, anyone can call it (permissionless), and the member can trigger it themselves.
  4. Blocked while they have an open loan or are guaranteeing one. If free cash (cash − reserve) is short, the payout is queued and paid first from incoming contributions and repayments, still automatically.
  - No exit fee by default; a circle can vote one in.
- **Dormant members** (e.g. lost wallet): after N missed months (circle setting, default 3), the circle can vote to mark the member dormant. Dues and late fees stop accruing; their shares stay theirs and redeemable only by that wallet. No one can seize them.

### D3. Wallet: Core Wallet login, wallet address = identity

- **Login = connect Core Wallet.** No sign-up, no name, no phone, no email. Core is Avalanche's own wallet, so it's the natural pitch fit for Team1.
  - Desktop: Core browser extension (EIP-1193 injected provider, EIP-6963 discovery).
  - Mobile: Core mobile app via WalletConnect, or opening the PWA inside Core's in-app browser.
- Members pay their own gas in AVAX (C-Chain fees are tiny and they already hold AVAX). No paymaster or account abstraction, which keeps the stack simple.
- **Getting AVAX:** members buy AVAX on any exchange and send it to their Core wallet. No in-app on-ramp.
- **Lost wallet = lost access. No recovery.** Clearly stated in onboarding ("back up your Core recovery phrase; WealthKart cannot recover it"). A lost member's shares stay in the vault, owned by that address. They keep their value but are untouchable by anyone else (see D2, dormant members).

### D3b. Display names: self-chosen, like an in-game name

- Each member **picks their own display name**, like a gamer tag ("NightOwl", "Comet_K", or a real name if they want). It's set by the member's wallet, and no one else can set or change it.
- Stored **on-chain in the group's `Membership` contract**, so every member's app shows the same name and nothing lives on our servers.
- **Per group:** the same wallet can be "Owl" in the college group and "Rahul S" in the family group. A default name carries over when joining a new group.
- Rules in the contract (ADR 0029): 3–24 ASCII characters (letters, digits, space, `_ . -`), unique within the group ignoring case, changeable once per 30 days, and a dropped name stays reserved for its last owner for 30 days. Old names stay in the event history. If a requested name gets taken while the join vote runs, the member joins without a name and picks one later.
- The UI notes that names are public on-chain, so pick a nickname if you want privacy.
- Avatars are generated from the address itself (cut-paper art, ADR 0025; no emojis), so nothing is uploaded.
- Optional extra: support `.avax` names (Avalanche name service) when a member already has one.

### D4. Rules computed lazily on-chain (no admin approval for payments)

- Contributions, interest due, late fees and tenor rates are **computed from timestamps when someone interacts** (pay, borrow, view). No admin or keeper has to "run" them.
- Time-based payouts (exits) are triggered by Chainlink Automation, with a permissionless fallback. Nothing depends on our servers being up.
- **No admin approvals for money.** Loans, new members, fee waivers and rule changes are all decided by **member vote**. Admin is limited to circle setup and pausing in an emergency.

### D4b. Penalties (from the original rulebook, in AVAX)

Every penalty goes **into the vault**, so it benefits all members. All amounts and days are circle settings.

**Missed installment** (rules 6–8):

| When                       | Penalty (default)                                                    |
| -------------------------- | -------------------------------------------------------------------- |
| Not paid by due day (10th) | Late fee 1, e.g. 0.01 AVAX                                           |
| Still unpaid after day 20  | Late fee 2, another 0.01 AVAX                                        |
| 3 months missed            | Circle can vote the member dormant (dues and fees stop; shares stay) |

**Missed loan interest:**

| When                         | Penalty (default)                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Interest not paid by due day | Late fee on interest, e.g. 0.01 AVAX or 2% of the interest due, whichever is higher                                                                          |
| Still unpaid after day 20    | Second late fee                                                                                                                                              |
| Unpaid interest              | Added to next month's due (no compounding unless the circle votes for it)                                                                                    |
| 2 months missed              | **Default**: borrower's shares are frozen as collateral, guarantor's locked shares are frozen too (rule 16), new loans are blocked, and reputation is marked |
| Tenor ends unpaid (rule 15)  | Rate steps up 1% → 1.5% → 2%; after tenor 3 the full loan is due, and if unpaid the frozen shares are **used to repay the loan** after a member vote         |

Fees can be waived only by member vote, with a reason recorded on-chain.

### D4c. Loans by vote

1. Member requests: amount, type (regular or medical), optional public note, optional guarantor.
2. Contract checks: amount ≤ free cash (cash − 20% reserve, rule 12), ≤ cap per member (rule 13, % of corpus), no other pending request, not in default.
3. **Voting window** (default 48 hours): members vote yes or no; the borrower can't vote. Passes on quorum (default 50% of members) plus majority (rule 2). The guarantor must also sign if the circle requires one.
4. On pass, the AVAX is **disbursed to the borrower automatically** in the same transaction that finalises the vote.
5. Interest starts the month after disbursal, on the start-of-month balance; minimum one month's interest (rule 17); medical loans interest-free for 3 months (rule 18).

### Rule settings (ADR 0022)

Rule **logic** is fixed in audited code; each circle picks the **numbers** in the Create-circle wizard (G1's values pre-filled). Changes: proposal → vote → 7-day delay with rage-quit (ADR 0019) → applies from the next period. All times UTC (ADR 0014).

| Group       | Setting                                | Default                                                   | Bounds                          |
| ----------- | -------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| Installment | Amount                                 | creator sets (e.g. 0.5 AVAX)                              | > 0                             |
|             | Due day (23:59:59 UTC)                 | 10                                                        | 1–28                            |
|             | Late fee 1 (after due day)             | 0.01 AVAX                                                 | 0–50% of installment (ADR 0030) |
|             | Late fee 2 (after day 20)              | 0.01 AVAX                                                 | 0–50% of installment            |
|             | Payment holidays per year (ADR 0017)   | 3                                                         | 0–12                            |
|             | Missed months before dormant vote      | 3                                                         | 1–12                            |
| Loans       | Interest per month                     | 1%                                                        | 0–5%                            |
|             | Tenors (rule 15)                       | on: 6 months, 1% → 1.5% → 2%, max 3                       | 1–24 months per tenor           |
|             | Reserve (rule 12)                      | 20% of fund                                               | 0–80%                           |
|             | Max loan per member (rule 13)          | 40% of fund                                               | 1–100%                          |
|             | Loan cap vs stake, k (ADR 0018)        | 2× (own + guarantor stake)                                | 1–10×                           |
|             | Minimum one month's interest (rule 17) | on                                                        | on/off                          |
|             | Medical loans (rule 18)                | cap set by creator, 3 interest-free months, once per year | 0–12 months                     |
|             | Guarantor required (rule 11)           | off                                                       | on/off                          |
|             | Interest late fee                      | 0.01 AVAX                                                 | ≥ 0                             |
|             | Missed interest months → default       | 2                                                         | 1–6                             |
| Voting      | Voting window                          | 48 h (medical 24 h)                                       | 1 h–14 days                     |
|             | Quorum (of active members)             | 50%                                                       | 20–100%                         |
|             | Pass mark (loans, rules)               | > 50%                                                     | 50–100%                         |
|             | Dissolution pass mark (ADR 0021)       | 66%                                                       | 50–100%                         |
|             | Rule-change delay (ADR 0019)           | 7 days                                                    | 3–30 days                       |
| Membership  | Max members                            | unlimited                                                 | ≥ 3                             |
|             | Admission pass mark (ADR 0028)         | 66% of votes cast, fixed                                  | fixed                           |
|             | Min members to allow loans             | 3                                                         | ≥ 3                             |
|             | Exit notice period                     | 30 days                                                   | 0–90 days                       |
|             | Exit fee                               | 0%                                                        | 0–10%                           |
| Safety      | Guardian pause (ADR 0020)              | on (max 14 days, never blocks exits)                      | circle can vote it off          |

### D5. Privacy: zero personal data

- **We store nothing about people.** No names, phones, emails, documents, or KYC. The only identifier is the wallet address.
- On-chain: addresses, amounts, votes, rule parameters. Optional loan notes are short and public, so the UI warns before posting.
- Medical loans (rule 18): no document upload. The group approves by vote, since members know each other.
- No database of users, so there's nothing to leak and DPDP obligations are minimal.

### D6. Hosting: a static app on Cloudflare Pages

- With no user database and no server-side login, the web app can be a **static Next.js export on Cloudflare Pages**: cheap, fast, and nothing to breach.
- All data is read from the chain: RPC (Avalanche public RPC or a provider) plus an event indexer for history, using AvaCloud Data API, The Graph, or a small Cloudflare Worker that only caches public chain events.
- **Reminders: Phase 4.** Until then the app shows dues, fees and pending votes on opening. Later: optional Web Push keyed only by wallet address (no PII), sent by a Cloudflare Cron Worker.

### D7. Charts and analytics (everything visible)

All figures come straight from chain data, so every member sees the same numbers.

**Circle dashboard**

- Fund value over time: contributions vs NAV (stacked area: contributed, interest earned, penalties)
- NAV per share over time (line)
- Where the money is: cash, lent out, reserve (donut)
- Monthly inflows: installments, interest, penalties, repayments (stacked bars)
- Loans outstanding per member (bar), with tenor and rate
- Contribution heatmap: members × months (paid on time, late, missed), the on-chain version of G1's `1`s grid
- Annual return (XIRR) and a projection for the next 5, 10 or 30 years

**My portfolio (across all circles)**

- Total AVAX value and gain, split by circle
- My share % in each circle
- My contributions vs my current value (line)
- My loans: balance, interest paid, next due
- My on-time streak and reputation

**Votes and activity**

- Open votes with live tally; vote history
- Activity feed with a Snowtrace link for every entry

---

## 4. Architecture

```
  Member (PWA, many groups)
        │
        ▼
 ┌────────────────────────────────────────────┐
 │ Next.js PWA, static export, Cloudflare Pages│
 │ Portfolio · Group switcher · Contribute ·   │
 │ Loans · Vote · Analytics · Admin            │
 │ Display names read from chain (self-chosen) │
 └──────┬──────────────────────────┬──────────┘
        │ read                     │ sign (Core Wallet: extension / mobile via WalletConnect)
 ┌──────▼─────────────┐     ┌──────▼──────────────────────────────┐
 │ Public-data helpers │     │ Avalanche C-Chain (Fuji → Mainnet)  │
 │ (no PII anywhere)   │     │                                     │
 │ Indexer: chain      │     │ GroupFactory ──clones──► Group N     │
 │   events → cache    │     │   │                                 │
 │ Push Worker: wallet │     │   ├─ GroupVault   (AVAX, shares, NAV)│
 │   → push endpoint   │     │   ├─ Membership   (join/leave, roles)│
 │ Cron: due reminders │◄────┤   ├─ Contributions(monthly, fees)    │
 └─────────────────────┘ evts│   ├─ LoanBook     (loans, interest,  │
                             │   │                tenors, medical)  │
                             │   ├─ Governance   (proposals, votes) │
                             │   └─ (shared) Reputation SBT         │
                             └─────────────────────────────────────┘
                                   Phase 5: WealthKart L1 + ICM
```

### Pages

The app is a static export, so circle pages use query params (`?id=0x…`) rather than dynamic path segments; there are no server routes to pre-render.

**Public**

| Route                                  | Page              | Notes                                                                 |
| -------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| `/`                                    | Landing           | Placeholder for now; designed later                                   |
| `/how-it-works`                        | How it works      | Create → contribute → borrow by vote → exit (SEO/GEO, `HowTo` schema) |
| `/faq`                                 | FAQ               | Real questions, direct answers (`FAQPage` schema)                     |
| `/rules`                               | Rules             | Every circle setting, defaults and bounds                             |
| `/security`                            | Security          | Immutable contracts, audit, addresses, no personal data               |
| `/llms.txt`, `/llms-full.txt`, `/*.md` | For AI assistants | Generated at build (ADR 0024, `docs/seo.md`)                          |

**App** (requires Core Wallet; prompts to install Core or switch to Avalanche/Fuji if needed)

| Route                       | Page                 | What's on it                                                                                                                                                    |
| --------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/app`                      | **Home / Portfolio** | All my circles (cards), total AVAX value and gain, **action items**: dues, fees, open votes, loan interest due                                                  |
| `/app/new`                  | **Create circle**    | Wizard: name → installment (AVAX) and due day → late fees → loan rules (rate, tenors, cap, reserve) → voting (quorum, window) → exit notice → review and deploy |
| `/app/join?code=…`          | **Join circle**      | Circle preview and rules → pick display name → request to join (goes to vote)                                                                                   |
| `/app/circle?id=…`          | **Circle: Overview** | Charts (fund value, cash/lent/reserve, NAV), my stake, my dues, members strip                                                                                   |
| `/app/circle/pay?id=…`      | **Pay**              | Installment + late fees + loan interest + repayment, with checkboxes; one transaction                                                                           |
| `/app/circle/loans?id=…`    | **Loans**            | All loans (amount, rate, tenor, status), my loans, **request loan** form                                                                                        |
| `/app/circle/votes?id=…`    | **Votes**            | Open proposals with live tally, vote yes/no, history, **new proposal** (change rule, waive fee, admit member, mark dormant, …)                                  |
| `/app/circle/members?id=…`  | **Members**          | Display names, share %, status (active / late / dormant / exiting / default), contribution heatmap, **invite** (link + QR)                                      |
| `/app/circle/activity?id=…` | **Activity**         | Every event with a Snowtrace link                                                                                                                               |
| `/app/circle/settings?id=…` | **Rules & Leave**    | Current rules (read-only; change by proposal), my display name, **leave circle** (starts notice period, shows estimated payout)                                 |
| `/app/profile`              | **Profile**          | Wallet, default display name, reputation across circles, full history, CSV export (for members' own tax filing)                                                 |

**System:** 404, wrong network, no wallet installed, transaction pending/success/failed toasts.

Navigation: bottom tab bar on mobile (Home · Pay · Loans · Votes · More), circle switcher at the top.

**UI system (ADRs 0023 + 0025, full spec `docs/ui.md`):** shadcn/ui with the "Gallery" look: light, premium and calm, near-monochrome with a cobalt accent, Instrument Serif + Hanken Grotesk, generous whitespace, folk-art cut-paper illustration only on hero, circle covers, empty states and avatars. Every app page uses the same layout (AppShell → PageHeader → stats → toolbar → content → pagination). Every list is paginated, with page, size, search and filters in the URL; search is debounced 300 ms where useful. Landing page design comes later.

### Repo layout: monorepo (pnpm workspaces + Turborepo)

```
wealthkart/
├── apps/web/            Next.js 15 PWA (App Router, static export, TS, Tailwind, shadcn/ui, wagmi/viem)
│   └── app/
│       ├── page.tsx             Landing (/)
│       └── app/                 Wallet-gated app (/app/…)
│           ├── page.tsx         Portfolio
│           ├── new/  join/  profile/
│           └── circle/          Overview + pay/ loans/ votes/ members/ activity/ settings/
├── packages/
│   ├── contracts/       Solidity + Foundry (tests, fuzz, invariants, deploy scripts)
│   ├── sdk/             Typed client: ABIs, addresses, read/write helpers
│   └── rules/           Pure TS mirror of contract math (NAV, interest, tenors,
│                        fees, XIRR) for UI previews and cross-checking tests
├── workers/
│   ├── push/            Web Push reminders keyed by wallet address (no PII, no fund movement)
│   └── indexer/         Public chain events → cache (optional if AvaCloud / The Graph is used)
└── docs/
```

### Contracts (Solidity 0.8.x, Foundry, OpenZeppelin)

| Contract        | Responsibility                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GroupFactory`  | Create a group from a template (EIP-1167 clones); registry of groups per user                                                                                                                                                                                                                                                                                                                |
| `GroupVault`    | Holds AVAX; mints and burns non-transferable shares at NAV; tracks cash, lent-out and reserve; exit queue with notice period and `processExits()` (Chainlink Automation compatible, permissionless)                                                                                                                                                                                          |
| `Membership`    | Invite codes, join requests, approval by member vote, `maxMembers`, roles, self-chosen display names (unique per group, cooldown), leave / notice period, freeze (rule 16)                                                                                                                                                                                                                   |
| `Contributions` | One installment per member per period, no future periods, no duplicates, lazy late fees 1 and 2 (rules 6–8), dormant status, fee waiver by member vote                                                                                                                                                                                                                                       |
| `LoanBook`      | Request → member vote → auto-disburse from vault; interest late fees and default handling (D4b); interest on start-of-period balance; repayment allocation (chosen → oldest); tenors at 1% / 1.5% / 2% (rule 15); minimum one month's interest (rule 17); medical loans (rule 18); cap as % of corpus (rule 13); reserve (rule 12); guarantor stakes can be frozen on default (rules 11, 16) |
| `Governance`    | Proposals: change parameters, admit a member, approve a loan, waive a fee, mark dormant, nominee claim, dissolve, migrate to a new version. Snapshot voting, quorum, majority, 7-day delay with rage-quit (rule 2, ADRs 0019–0021)                                                                                                                                                           |
| `Reputation`    | Soulbound per-user record across all groups: periods paid on time, loans repaid, defaults                                                                                                                                                                                                                                                                                                    |

**Security bar** (custody of real funds):

- Checks-effects-interactions, `ReentrancyGuard`, pull-over-push withdrawals.
- 100% branch coverage on money paths; fuzz plus invariants, e.g. `vault balance + loans outstanding == NAV × shares`, and "no member can withdraw more than their shares".
- Slither and Aderyn in CI; a public testnet bug bounty; an **external audit before any mainnet group holds real AVAX**.
- **Immutable circle contracts** (no proxies, no upgrades); new versions only by member vote to migrate (ADR 0020).
- Guardian pause (founder multisig): pauses new loans and deposits only, max 14 days, never blocks exits or moves funds; each circle can vote it off.
- Per-circle deposit caps during beta.

---

## 5. Phased roadmap

Durations assume 2–3 developers. Each phase ends in a demo that doubles as a grant milestone.

### Phase 0 — Foundation (2 weeks)

- Monorepo, CI (lint, typecheck, Foundry tests, Slither), Cloudflare preview deploys per PR.
- Core Wallet connect on Fuji: extension (EIP-6963) and mobile (WalletConnect), using wagmi/viem.
- Figma: portfolio, group, contribute, loan, vote, join flows.
- `packages/rules`: NAV/shares, interest, tenors, fees, XIRR as pure TS, tested against G1's sheet logic.
- Legal consult on running pooled crypto groups for Indian users (see §7).

**Exit:** rule engine tested; Core connect working on Fuji; designs approved.

### Phase 1 — MVP on Fuji: groups, vaults, contributions (5 weeks)

- Connect Core Wallet. No sign-up form; the member picks a display name (in-game-style) when joining a group.
- Create a group (name, installment in AVAX, due day, late fees, maxMembers, join policy).
- Invite link/code → join request → approve → member.
- **Contribute AVAX monthly** to the vault; shares minted at NAV; lazy late fees.
- **Multi-group portfolio**: all groups, total AVAX, NAV per group.
- Late fees 1 and 2 on missed installments (lazy, on-chain).
- First charts: fund value, cash vs reserve, contribution heatmap, my portfolio.
- Activity feed with Snowtrace links.

**Exit / Grant milestone 1:** G1 and 2–3 test groups contributing test AVAX on Fuji; public demo video.

### Phase 2 — Loans and governance (5 weeks)

- Loan request (regular or medical) → **member vote** → auto-disbursal from the vault (D4c).
- Interest, partial payments, repayment, auto-close; tenors; minimum interest; reserve and cap checks.
- Loan penalties: interest late fees, default after 2 missed months, share freeze, tenor step-ups (D4b).
- Guarantors: a guarantor's shares are locked as backing; freeze on default.
- Governance: proposals and votes for parameters, members and large loans; timelock.
- Leave circle: notice period → NAV snapshot → automatic AVAX payout via Chainlink Automation (D2).
- Charts: loans per member, monthly inflows, NAV per share, vote tallies.

**Exit / Grant milestone 2:** full G1 rulebook enforced on-chain; test report and invariant suite published.

### Phase 3 — Audit and mainnet beta (5 weeks)

- Full analytics (D7): XIRR, projections, portfolio across circles, reputation, exportable history for members' own tax filing.
- Reputation SBT plus a public "repayment record" page.
- Testnet bug bounty → **external audit** → fixes.
- **Mainnet launch on C-Chain** with per-group deposit caps; G1 as the first live group.

**Exit / Grant milestone 3:** audited contracts live on mainnet; G1 contributing real AVAX.

### Phase 4 — Growth platform (6 weeks)

- Group templates: friends circle, family fund, office circle (all invite-only, lend-on-need). No chit-style rotating payouts and no public group discovery, to stay clear of chit-fund and deposit-scheme rules.
- Invite links shareable by QR and WhatsApp (the link carries the group address and invite code only).
- **Reminders:** Web Push for due dates, late fees, open votes and tenor alerts (keyed by wallet only).
- Hindi and Marathi UI.
- Onboarding guide: install Core, back up the recovery phrase, buy and send AVAX.

**Exit:** 25+ groups, 300+ members, measurable TVL.

### Phase 5 — Stablecoin vaults and WealthKart L1 (8+ weeks)

- USDC as an optional vault asset (asset-agnostic contracts already support it).
- **WealthKart Avalanche L1**: zero-fee gas for members, own validators, ICM bridge to the C-Chain for AVAX and USDC in and out.
- Reputation readable cross-chain via ICM.

### Phase 6 — Ecosystem

- Group-to-group lending (surplus groups lend to deficit groups via vault-to-vault loans).
- Reputation-based credit lines with DeFi protocols on Avalanche.
- Optional yield on idle reserve, by group vote only.

---

## 6. Funding plan

| Track                                                | What to show                                 | After |
| ---------------------------------------------------- | -------------------------------------------- | ----- |
| **Team1 India** (community, mini grants, mentorship) | Fuji MVP, G1's 8-year real-world story       | P1    |
| **Avalanche hackathons / buildathons**               | Vault + loans + voting demo                  | P1–P2 |
| **Avalanche Foundation grants / retro funding**      | Audited mainnet, TVL, active groups, L1 plan | P3–P5 |
| **Codebase (Avalanche incubator)**                   | Traction, team, roadmap                      | P4    |
| Fintech / impact angels                              | Users, retention, repayment data             | P4+   |

Programs, amounts and deadlines change. Confirm the current ones with the Team1 contacts.

**Pitch assets:** a one-pager, a 10-slide deck, a 2-minute demo video, a live stats page (groups, members, AVAX in vaults, loans repaid, on-time %), and G1 as the anchor case study.

---

## 7. Risks

| Risk                                                                                                                                                                                               | Mitigation                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Legal (India):** deposit-scheme, chit-fund and lending laws target public or for-profit schemes; crypto income is taxed at 30% plus 1% TDS on transfers; crypto service-provider (FIU-IND) rules | Private invite-only circles only; no rotating payouts; no advertised returns; fully non-custodial (company holds no keys or funds); no user data. Lawyer review before mainnet. Members are responsible for their own crypto tax (the app can export their on-chain history). |
| Smart-contract bug = lost funds                                                                                                                                                                    | Invariant tests, audit, bug bounty, pause, deposit caps in beta                                                                                                                                                                                                               |
| AVAX volatility                                                                                                                                                                                    | Clear UI messaging, AVAX-denominated accounting, USDC option in Phase 5                                                                                                                                                                                                       |
| Lost wallet (no recovery by design)                                                                                                                                                                | Strong onboarding warning plus a recovery-phrase backup check; dormant-member rule so the circle keeps working; the lost member's shares stay intact                                                                                                                          |
| Loan default (unsecured)                                                                                                                                                                           | Reserve, caps, guarantor share locks, freeze, reputation hit                                                                                                                                                                                                                  |
| Bank-run on exits                                                                                                                                                                                  | Notice period, liquidity limits, exit fee (group-set)                                                                                                                                                                                                                         |
| Gas costs                                                                                                                                                                                          | Members pay small C-Chain fees themselves; gas-optimised contracts; Phase 5 L1 with zero-fee gas                                                                                                                                                                              |
| Data leak                                                                                                                                                                                          | Nothing to leak: no personal data stored anywhere                                                                                                                                                                                                                             |

---

## 8. Success metrics

- **P1:** 3+ groups on Fuji, 100% of G1 members onboarded, 0 failed contributions.
- **P3:** audit with no open high/critical findings; G1 fully on mainnet.
- **P4:** 25 groups, 300 members, 95%+ on-time contributions, loans repaid ≥ 98%.
- **P5:** L1 on testnet; first USDC group.

---

## 9. Immediate next steps

1. ~~Confirm decisions~~ Done: Core login, AVAX-only installments, no wallet recovery, private circles, n circles per wallet, n members per circle.
2. Core Wallet connect spike on Fuji (extension and mobile).
3. Scaffold the monorepo (Phase 0).
4. Write `GroupVault` + `Contributions` with invariant tests first (highest-risk code).
5. Book the legal consult; share this plan with the Team1 contact.

### Note on G1's history

G1's 8 years of INR history stays as the case study and can be imported as **off-chain history plus a reputation bootstrap**, not as vault balance. G1 starts its on-chain vault fresh in AVAX.
