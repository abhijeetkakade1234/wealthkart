# To do

What's open right now. Phase-level progress is in [PHASES.md](PHASES.md); the full checklist is in [docs/STATUS.md](docs/STATUS.md).

Last updated: 2026-11-15

## Building now (Phase 1)

- [ ] Activity feed with a Snowtrace link for every entry
- [ ] Indexer, so charts and the feed stay fast for old circles (AvaCloud Data API, The Graph or a Cloudflare Worker cache; needs a choice and probably an account)
- [ ] Phase 1 milestone: G1 plus 2–3 test circles on Fuji, demo video, Team1 application

## Next phase (Phase 2: loans and governance)

- [ ] Loan request → member vote → AVAX sent automatically
- [ ] Interest, partial payments, repayment order, tenors, medical loans, caps, reserve
- [ ] Interest late fees, default after 2 missed months, frozen shares
- [ ] Rule changes, fee waivers and other proposals by vote
- [ ] Exits: notice period → payout (Chainlink Automation, with a manual fallback)
- [ ] Phase 2 red-team items (RT-08, 13, 15–18, 20)

## Owner actions (saved for after all phases are coded)

- [ ] Merge `abhijeet` → `dev` → `main` (ongoing): https://github.com/abhijeetkakade1234/wealthkart/compare/dev...abhijeet
- [ ] Fuji deploy: GitHub environment `fuji` with `DEPLOYER_PRIVATE_KEY`, faucet AVAX, run the deploy workflow
- [ ] Branch protection on `main` and `dev`
- [ ] Reown project id (WalletConnect for Core mobile)
- [ ] Commission the illustrator
- [ ] Cloudflare Pages project and preview deploys
- [ ] Book the lawyer review (before mainnet)
