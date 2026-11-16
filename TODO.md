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
- [x] Member cap 3 to 50 per circle (ADR 0045)
- [x] Circles in AVAX or USDT, chosen once at creation (ADR 0046, 0048), reviewed and hardened (ADR 0050)
- [x] Fuji or mainnet chosen by the environment; `main`/`dev`/local mapping (ADR 0051)
- [x] Indexer stays inside D1's free tier (ADR 0047); monitor reads USDT balances

## Next: Phase 4 (growth)

- [x] Landing page with the "one month" scroll scene (ADR 0049)
- [x] Reminders (Web Push, keyed by wallet, ADR 0052)
- [ ] Circle templates (friends, family, office)
- [ ] Hindi and Marathi
- [ ] Onboarding guide (install Core, back up the phrase, get AVAX)
- [x] Free space in the vault (now 22,109 B, 2,467 B left under 24 KB)
- [ ] "Get test USDT" faucet button on Fuji builds
- [ ] E2E for USDT loans (pay interest, repay) and the approve retry
- [ ] Confirm on Fuji/fork that Avalanche USDt allows re-approving over a non-zero allowance
- [ ] `pnpm dev:local`: one command for anvil + contracts + app on a PC
- [ ] Configurable E2E ports so parallel runs can't clash

## Owner actions (saved for after all phases are coded)

- [ ] Phase 1 milestone: G1 plus 2–3 test circles on Fuji, demo video, Team1 application
- [ ] Deploy the indexer: create the D1 database, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, run **Deploy indexer**, set `NEXT_PUBLIC_INDEXER_URL`
- [ ] Reminders: `pnpm --filter @wealthkart/indexer vapid:keys`, public key in `workers/indexer/wrangler.toml` and the Pages variable `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `wrangler secret put VAPID_PRIVATE_KEY` (own pair for `--env mainnet`), check `APP_DOMAINS` is the real domain
- [ ] Merge `abhijeet` → `dev` → `main` (ongoing): https://github.com/abhijeetkakade1234/wealthkart/compare/dev...abhijeet
- [ ] Fuji deploy: GitHub environment `fuji` with `DEPLOYER_PRIVATE_KEY`, faucet AVAX, run the deploy workflow
- [ ] Branch protection on `main` and `dev`
- [ ] Reown project id (WalletConnect for Core mobile)
- [ ] Commission the illustrator (the landing hero is still the placeholder piece)
- [x] Cloudflare Pages builds only `main` (Production) and `dev` (Preview)
- [ ] Set `NEXT_PUBLIC_NETWORK=fuji` for both Pages environments (Production switches to `mainnet` after the audit)
- [ ] GitHub `mainnet` environment with required reviewers
- [ ] Book the lawyer review (before mainnet)
