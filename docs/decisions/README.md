# docs/decisions: Architecture Decision Records (ADRs)

**What's here:** one file per decision: why we chose it, what we rejected, and what it costs us. Read this index first; open a file only if you need the reasoning.

**Rules**
- Any decision that changes architecture, money flow, security, data or scope gets an ADR *before* its code is merged.
- Never rewrite an accepted ADR's decision. Write a new ADR that supersedes it, and mark the old one `Superseded by NNNN`.
- Copy [`0000-template.md`](0000-template.md) and use the next number.

| # | Decision | Status |
|---|---|---|
| [0001](0001-avalanche-c-chain.md) | Build on Avalanche C-Chain (own L1 later) | Accepted |
| [0002](0002-avax-onchain-vault.md) | Contributions in AVAX held in an on-chain vault per circle | Accepted |
| [0003](0003-core-wallet-only.md) | Login with Core Wallet only; members pay their own gas | Accepted |
| [0004](0004-zero-personal-data.md) | Zero personal data; self-chosen on-chain display names | Accepted |
| [0005](0005-private-invite-only-circles.md) | Private, invite-only circles; no rotating payouts or public discovery | Accepted |
| [0006](0006-share-nav-accounting.md) | Share/NAV accounting for fair joins and exits | Accepted |
| [0007](0007-loans-by-vote.md) | Loans and all money decisions by member vote; auto-disbursal | Accepted |
| [0008](0008-exit-notice-auto-payout.md) | Exit via notice period with automatic payout | Accepted |
| [0009](0009-penalties-into-vault.md) | Late fees and loan penalties paid into the vault | Accepted |
| [0010](0010-no-wallet-recovery.md) | No wallet recovery; dormant-member rule instead | Accepted |
| [0011](0011-static-nextjs-cloudflare-pages.md) | Static Next.js PWA on Cloudflare Pages | Accepted |
| [0012](0012-monorepo-foundry.md) | Monorepo (pnpm + Turborepo) with Foundry for contracts | Accepted |
| [0013](0013-production-scenario-testing.md) | Tests model real production failures, not happy paths | Accepted |
| [0014](0014-utc-deadlines.md) | All deadlines in UTC on-chain; local time shown only in the app | Accepted |
| [0015](0015-no-unbounded-loops.md) | No loops over members in contracts (n members must scale) | Accepted |
| [0016](0016-nominee-wallet.md) | Nominee wallet per member (G1 rule 1) | Accepted |
| [0017](0017-payment-holiday.md) | Payment holiday: fee-free delay, up to 3 times a year | Accepted |
| [0018](0018-loan-cap-vs-stake.md) | Loan cap tied to the borrower's own stake | Accepted |
| [0019](0019-rule-change-delay-rage-quit.md) | 7-day delay on rule changes, with exit under old rules | Accepted |
| [0020](0020-immutable-circle-contracts.md) | Circle contracts are immutable; new versions are opt-in by vote | Accepted |
| [0021](0021-dissolve-circle.md) | Circles can be dissolved by vote | Accepted |
| [0022](0022-rules-as-parameter-menu.md) | Circle rules are a fixed menu of parameters | Accepted |
| [0023](0023-ui-system.md) | UI system: shadcn/ui + web3-style components, one layout, real pagination and search | Accepted (look superseded by 0025) |
| [0024](0024-seo-geo-llms-txt.md) | SEO, GEO and llms.txt on public pages only | Accepted |
| [0025](0025-visual-identity-gallery.md) | Visual identity "Gallery": calm premium light UI + folk-art illustration, generous whitespace | Accepted |
| [0026](0026-interaction-states-feedback.md) | Every action gives feedback; eight UI states; nothing crashes; plain-language messages | Accepted |
