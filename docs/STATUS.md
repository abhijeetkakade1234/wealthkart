# Status: where we are and what's left

**Current phase: Phase 0, Foundation** (planning done; scaffolding nearly done; work lands on `abhijeet`)
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
- [ ] Red-team PLAN.md before writing contracts

### Repo and tooling

- [x] Monorepo: pnpm workspaces + Turborepo (pnpm store on D:)
- [ ] `README.md` in every folder
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
- [ ] Scenario test harness (actors: honest member, late payer, attacker, contract wallet)

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
- [ ] Placeholder cut-paper SVG piece set (`components/art`) + address-based avatar and circle-cover generator
- [x] Interaction kit (ADR 0026): Button (press/working/done/failed), AnimatedIcon, StateView (8 states), TxTracker, ErrorBoundary (app/page/widget), safeCall wrapper, toast helpers, plain-language message catalogue, no-emoji lint (`feat/interaction-kit`; showcase at `/kit`)
- [ ] Shared components: AppShell, PageHeader, StatCard, DataTable, Pagination (URL state), SearchInput (300 ms debounce), Empty/Error/Loading states, AddressLabel, AvaxAmount, TxButton, CountdownUTC
- [x] Landing page: minimal placeholder only (design later)
- [x] Look direction picked: "Gallery" (ADR 0025, `docs/design/gallery.html`)
- [ ] Brief and commission an illustrator: 1 hero + 20–30 cut-paper SVG pieces in the art palette
- [x] SEO base: metadata, sitemap, robots, OG images, JSON-LD, `/llms.txt` + `/llms-full.txt` + `.md` twins (ADR 0024, 0027, `docs/seo.md`)
- [x] Public pages: how-it-works, faq, rules, security (typed content in `src/content`, ADR 0027)
- [ ] Lighthouse budget in CI for public pages (docs/seo.md §2)
- [x] Core Wallet connect (EIP-6963), Fuji network switch, access gate
- [ ] WalletConnect for Core mobile (needs a Reown project id); Core's in-app browser works already
- [x] App shell: top bar, sidebar, bottom nav, page header, portfolio empty state
- [x] Circle pages: create, overview (members table, URL pagination), pay + holiday, UTC countdown
- [x] Circle switcher dropdown in the top bar

### Other

- [ ] Figma: portfolio, create, join, pay, loans, votes, members
- [ ] Lawyer review booked (pre-mainnet)

---

## Phase 1: MVP on Fuji (circles, vault, contributions)

- [ ] Create circle wizard → deploy via factory
- [ ] Invite link/QR → join request → member vote → member
- [ ] Display names (unique, cooldown)
- [ ] Contribute AVAX; shares minted at NAV
- [ ] Late fees 1 and 2 (lazy); dormant vote
- [ ] Portfolio across circles; circle overview charts; contribution heatmap
- [ ] Activity feed + Snowtrace links
- [ ] Indexer (AvaCloud Data API / The Graph / Worker cache)
- [ ] **Milestone:** G1 + 2–3 test circles on Fuji; demo video; Team1 application

## Phase 2: Loans and governance

- [ ] Loan request → vote → auto-disbursal
- [ ] Interest, partial payments, repayment allocation, auto-close
- [ ] Tenors (rule 15), minimum interest (rule 17), medical loans (rule 18), cap (rule 13), reserve (rule 12)
- [ ] Interest late fees; default after 2 missed months; share freeze (borrower + guarantor)
- [ ] Generic proposals: rule change, fee waiver, admit member, dormant
- [ ] Exit: notice → NAV snapshot → Chainlink Automation payout + permissionless fallback
- [ ] Charts: loans, inflows, NAV per share, vote tallies
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

## Phase 6: Ecosystem (circle-to-circle lending, credit lines)
