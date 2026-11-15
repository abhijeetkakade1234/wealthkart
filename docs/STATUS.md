# Status: where we are and what's left

**Current phase: Phase 2, loans and governance** (Phase 1 done; its milestone is deferred by the owner) (Phase 0 done except owner actions marked below; work lands on `abhijeet`)
Last updated: 2026-11-14

How to use this file:

- Tick `[x]` when done; add the PR or commit link if there is one.
- New work goes under the right phase. Don't start a later phase's items while the current phase's exit criteria are open.
- Phase details: [`../PLAN.md`](../PLAN.md) §5. Why things are this way: [`decisions/`](decisions/README.md).

---

## Phase 0: Foundation (target: 2 weeks)

**Exit criteria:** rule engine tested against G1 (done) · Core connect on Fuji · CI green · designs approved

### Planning

- [x] Understand G1 (guide + sheet) → `CLAUDE.md`
- [x] Product plan → `PLAN.md`
- [x] Decisions recorded → `docs/decisions/` (ADR 0001–0026)
- [x] Page map + monorepo layout
- [x] Testing strategy → `docs/testing.md`
- [x] ADR 0014: deadlines in UTC; UI shows local time too
- [x] ADR 0016: nominee wallet
- [x] ADR 0015: no loops over members
- [x] ADRs 0017–0022: payment holiday, loan cap vs stake, rule-change delay + rage-quit, immutable contracts, dissolve vote, rules as a parameter menu
- [x] Red-team PLAN.md → `docs/redteam/2026-11-plan-redteam.md` (32 findings; membership blockers fixed in ADRs 0028–0030)

### Repo and tooling

- [x] Monorepo: pnpm workspaces + Turborepo (pnpm store on D:)
- [x] `README.md` in every folder (exceptions in `docs/engineering.md` §1)
- [x] TypeScript strict, ESLint, Prettier, Solhint, `forge fmt`
- [x] Husky: pre-commit (lint-staged), commit-msg (commitlint), pre-push (typecheck + unit tests)
- [x] GitHub Actions CI, first version: format, lint, typecheck, test, build, Foundry fmt/build/test + Solhint + Slither (coverage gate, E2E still to add)
- [ ] Cloudflare Pages project + preview deploy per PR
- [x] PR template, CODEOWNERS
- [ ] Branch protection on `main` and `dev` (GitHub settings, owner action)
- [x] `.env.example`, secrets in GitHub/Cloudflare only
- [x] Manual "Deploy contracts" workflow (Fuji, environment approval, Snowtrace verify)
- [ ] Create GitHub environment `fuji` with `DEPLOYER_PRIVATE_KEY` (and optional `FUJI_RPC_URL`), fund the deployer from the Fuji faucet, run the workflow, commit `packages/sdk/src/deployments/43113.json`

### Contracts (`packages/contracts`)

- [x] Foundry project (D: oolsoundry), forge-std v1.9.7, OpenZeppelin v5.4.0
- [x] `PeriodMath` + `SharesMath` libraries with unit + fuzz tests
- [x] Solhint, Slither in CI (Slither first run happens in CI; not runnable on the dev machine)
- [x] `CircleFactory` + `CircleVault` contributions slice (shares/NAV, fees, holidays, invariants)
- [x] Scenario test harness (actors: honest member, late payer, attacker, contract wallet)

### SDK (`packages/sdk`)

- [x] Generated ABIs, chains, deployments map, formatting helpers

### Rules engine (`packages/rules`)

- [x] NAV/shares, UTC periods, late fees, payment holidays (15 scenario tests)
- [x] Interest, tenors, XIRR (`src/interest.ts`, `src/xirr.ts`; rules 15/17/18, repayment order)
- [x] G1 sheet fixtures: reproduce ₹35,73,552 value and ₹8,65,375 interest (exact; `test/g1-replay.test.ts`, gaps in `docs/testing.md`)

### Web (`apps/web`)

- [x] Next.js 15 static export
- [x] PWA manifest + service worker (app-shell cache, never caches RPC; icons generated at build)
- [x] shadcn/ui init + "Gallery" theme tokens + fonts (ADR 0025, `docs/ui.md`)
- [x] Placeholder cut-paper SVG piece set (`components/art`) + address-based avatar and circle-cover generator
- [x] Interaction kit (ADR 0026): Button (press/working/done/failed), AnimatedIcon, StateView (8 states), TxTracker, ErrorBoundary (app/page/widget), safeCall wrapper, toast helpers, plain-language message catalogue, no-emoji lint (`feat/interaction-kit`; showcase at `/kit`)
- [x] Shared components: AppShell, PageHeader, StatCard, DataTable, Pagination (URL state), SearchInput (300 ms debounce), Empty/Error/Loading states, AddressLabel, AvaxAmount, TxButton, CountdownUTC
- [x] Landing page: minimal placeholder only (design later)
- [x] Look direction picked: "Gallery" (ADR 0025, `docs/design/gallery.html`)
- [x] Illustrator brief → `docs/design/illustrator-brief.md`
- [ ] Commission the illustrator (owner action)
- [x] SEO base: metadata, sitemap, robots, OG images, JSON-LD, `/llms.txt` + `/llms-full.txt` + `.md` twins (ADR 0024, 0027, `docs/seo.md`)
- [x] Public pages: how-it-works, faq, rules, security (typed content in `src/content`, ADR 0027)
- [x] Lighthouse budget in CI for public pages (docs/seo.md §2)
- [x] Core Wallet connect (EIP-6963), Fuji network switch, access gate
- [ ] WalletConnect for Core mobile (needs a Reown project id); Core's in-app browser works already
- [x] App shell: top bar, sidebar, bottom nav, page header, portfolio empty state
- [x] Circle pages: create, overview (members table, URL pagination), pay + holiday, UTC countdown
- [x] Circle switcher dropdown in the top bar

### Testing

- [x] Playwright E2E against a local anvil chain with a fake Core wallet; every user-facing feature ships with one (CLAUDE.md)

### Other

- [ ] Figma: portfolio, create, join, pay, loans, votes, members
- [ ] Lawyer review booked (pre-mainnet)

---

## Phase 1: MVP on Fuji (circles, vault, contributions)

- [x] Create circle → deploy via factory (single-page form; wizard steps later if needed)
- [x] Invite link → join request → member vote → member (ADR 0028; `/app/join`, `/app/circle/votes`, E2E S-E2E-04..06)
- [x] Founders accept their invite before they count (RT-02)
- [x] Factory `isCircle` registry and web guard against look-alike circles (RT-01)
- [x] Display names (unique, cooldown, ADR 0029); set from the circle overview (S-E2E-07)
- [x] Sign-in page (`/login`, split layout) with safe return path (S-E2E-08..10)
- [x] Contribute AVAX; shares minted at NAV
- [x] Late fees 1 and 2 (lazy), capped at half the installment (ADR 0030)
- [x] Dormant-member vote (ADR 0032): propose after N missed months, >50% yes, pay or `wake()` to return; members table action, Votes card, dormant notice; forge S-MEM-07/08, S-RT-18, S-TRUST-03, invariants I-12/I-13; E2E S-E2E-11/12
- [x] Vault split into linked libraries (ADR 0031): `Membership` module; factory 18.4 KB (was 23.99 KB)
- [x] Red-team leftovers for membership (ADR 0033): voting rights after N payments with a running voter count as the quorum base (RT-03), 3 open requests per member and inviter stats on join cards (RT-03, RT-05), circle names without links (RT-26); RT-07's quorum part is handled by the dormant vote. Forge S-RT-05/06/34, invariant I-12b; E2E S-E2E-14
- [x] Portfolio across circles; circle overview charts; contribution heatmap (ADR 0034): circle value, money in each month, value of one share, payments heatmap with year filter, portfolio totals and split; every chart has a table view; unit S-ACT-02..04; E2E S-E2E-15
- [x] Activity feed + Snowtrace links: `/app/circle/activity`, every event as a plain sentence with UTC time, filters (payments, members, votes), 300 ms search over names, addresses and tx, 20 per page, URL state; unit S-ACT-05; E2E S-E2E-16
- [x] Indexer (ADR 0036): `workers/indexer` Cloudflare Worker + D1, cron every minute plus catch-up per request, paged API; the app reads history from it and falls back to the RPC; unit S-IDX-01..06; every E2E run goes through it. Deploy is an owner action (`deploy-indexer.yml`)
- [ ] **Milestone (deferred by the owner, 2026-11-15):** G1 + 2–3 test circles on Fuji; demo video; Team1 application

## Phase 2: Loans and governance

- [x] Phase 2 foundation (ADR 0037): blueprint factory (3.2 KB; vault code in data contracts), shared `Ledger` with push-then-pull payouts (RT-20), `Rules` in storage with on-chain bounds, Membership hooks, one marked vault section per module
- [ ] Each Phase 2 feature lands as its own module under `src/modules/` (ADR 0031, 0037); vault has ~9 KB runtime left
- [ ] Re-enable Slither `locked-ether` once exits exist
- [ ] Red-team Phase 2 items: NAV includes interest owed and marks down overdue loans (RT-08, RT-18), k rises with tenure (RT-15), guarantee locks shares (RT-16), no new loans while exits wait (RT-17), pull-payment fallback for wallets that reject AVAX (RT-20), migration targets from a timelocked registry (RT-13)
- [ ] Loan request → vote → auto-disbursal
- [ ] Interest, partial payments, repayment allocation, auto-close
- [ ] Tenors (rule 15), minimum interest (rule 17), medical loans (rule 18), cap (rule 13), reserve (rule 12)
- [ ] Interest late fees; default after 2 missed months; share freeze (borrower + guarantor)
- [x] Governance contracts (ADR 0040): rule change (delay, then next period; rage-quit window), fee waiver with a fixed reason, dissolve + pro-rata claims, guardian off; admit member and dormant votes live in Membership. Risky-parameter supermajority (RT-12) still open
- [ ] Exit: notice → NAV snapshot → Chainlink Automation payout + permissionless fallback
- [x] Exits and governance screens: leave with notice, collect, waiting-for-cash and rage-quit notes, guardian pause banner and button, withdraw refused payouts; proposals on Votes (rule change with before/after and apply, fee waiver, dissolve + claim, guardian off) with a "New proposal" dialog checked against `Rules.validate` bounds; E2E S-E2E-18..22
- [x] Loans screens (ADR 0043): Loans page (your loan with interest due, tenor timeline, pay interest, repay part or full, default notice and how to lift it; ask dialog with live limit checks and a cost preview; guarantor notice with "Back this loan"; all loans with URL filters, sort and search, "Mark as defaulted", "Ask the circle to settle"), loan and settle cards on Votes (`?lpage=`), loan sentences in Activity; unit S-WEB-49..59, E2E S-E2E-23..26
- [ ] Charts: vote tallies (done: loans outstanding per member, where the money is, inflows, NAV per share)
- [ ] **Milestone:** full rulebook on-chain; test report published

## Phase 3: Audit and mainnet beta

- [ ] Full analytics, XIRR, projections, CSV export
- [ ] Reputation SBT
- [ ] Testnet bug bounty
- [ ] External audit + fixes
- [ ] Mainnet deploy with deposit caps; contract verification on Snowtrace
- [ ] Monitoring and alerts on contracts
- [ ] **Milestone:** G1 live on mainnet

## Phase 4: Growth

- [ ] Reminders (Web Push, wallet-keyed)
- [ ] Circle templates (friends / family / office)
- [ ] Hindi + Marathi
- [ ] Onboarding guide (install Core, back up phrase, get AVAX)

## Phase 5: USDC vaults + WealthKart L1

## Phase 6: Ecosystem (credit lines, reserve yield by vote; no circle-to-circle lending, ADR 0035)
