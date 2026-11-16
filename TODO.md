# To do

What's open right now. Phase-level progress is in [PHASES.md](PHASES.md); the full checklist is in [docs/STATUS.md](docs/STATUS.md).

Last updated: 2026-11-16

## Done in Phase 1

- [x] Activity feed with a Snowtrace link for every entry
- [x] Indexer: Cloudflare Worker + D1 (`workers/indexer`)

## Phase 2 (done)

- [x] Foundation: blueprint factory, shared ledger, rules with on-chain limits

- [x] Loan request → member vote → AVAX sent automatically
- [x] Interest, repayment, tenors, medical loans, caps, reserve (one loan per member for now)
- [x] Interest late fees, default after 2 missed months, frozen shares, settle by vote
- [x] Rule changes, fee waivers, dissolve and guardian-off by vote (contracts; screens in progress)
- [x] Exits: notice period → payout (Chainlink Automation, with a manual fallback) (contracts; screens in progress)
- [x] Independent reviews of loans, exits and governance; all high and medium findings fixed (ADR 0043)
- [ ] Open by design or deferred to the audit: RT-08 (unpaid interest not in NAV), RT-13 (migration), RT-15 (k ramp), RT-18 (exit haircut for overdue loans)
- [x] Screens: leaving, pause, proposals, rule changes, waivers, closing a circle
- [x] Loan screens

## Phase 3 (audit and mainnet beta)

- [x] Returns, projections and history CSV
- [x] Contract monitoring and alerts (indexer)
- [x] Security policy, bug bounty terms, audit pack
- [x] Reputation record (soulbound), wired into payments and loans, and the public repayment record page

## Next: Phase 4 (growth)

- [x] Landing page with the "one month" scroll scene (ADR 0049)
- [ ] Reminders (Web Push, keyed by wallet)
- [ ] Circle templates (friends, family, office)
- [ ] Hindi and Marathi
- [ ] Onboarding guide (install Core, back up the phrase, get AVAX)
- [ ] Free space in the vault before any new vault feature (891 B left under 24 KB)

## Owner actions (saved for after all phases are coded)

- [ ] Phase 1 milestone: G1 plus 2–3 test circles on Fuji, demo video, Team1 application
- [ ] Deploy the indexer: create the D1 database, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, run **Deploy indexer**, set `NEXT_PUBLIC_INDEXER_URL`
- [ ] Merge `abhijeet` → `dev` → `main` (ongoing): https://github.com/abhijeetkakade1234/wealthkart/compare/dev...abhijeet
- [ ] Fuji deploy: GitHub environment `fuji` with `DEPLOYER_PRIVATE_KEY`, faucet AVAX, run the deploy workflow
- [ ] Branch protection on `main` and `dev`
- [ ] Reown project id (WalletConnect for Core mobile)
- [ ] Commission the illustrator (the landing hero is still the placeholder piece)
- [ ] Cloudflare Pages project and preview deploys
- [ ] Book the lawyer review (before mainnet)
