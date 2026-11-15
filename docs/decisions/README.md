# docs/decisions: Architecture Decision Records (ADRs)

**What's here:** one file per decision: why we chose it, what we rejected, and what it costs us. Read this index first; open a file only if you need the reasoning.

**Rules**

- Any decision that changes architecture, money flow, security, data or scope gets an ADR _before_ its code is merged.
- Never rewrite an accepted ADR's decision. Write a new ADR that supersedes it, and mark the old one `Superseded by NNNN`.
- Copy [`0000-template.md`](0000-template.md) and use the next number.

| #                                                       | Decision                                                                                         | Status                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------- |
| [0001](0001-avalanche-c-chain.md)                       | Build on Avalanche C-Chain (own L1 later)                                                        | Accepted                           |
| [0002](0002-avax-onchain-vault.md)                      | Contributions in AVAX held in an on-chain vault per circle                                       | Accepted                           |
| [0003](0003-core-wallet-only.md)                        | Login with Core Wallet only; members pay their own gas                                           | Accepted                           |
| [0004](0004-zero-personal-data.md)                      | Zero personal data; self-chosen on-chain display names                                           | Accepted                           |
| [0005](0005-private-invite-only-circles.md)             | Private, invite-only circles; no rotating payouts or public discovery                            | Accepted                           |
| [0006](0006-share-nav-accounting.md)                    | Share/NAV accounting for fair joins and exits                                                    | Accepted                           |
| [0007](0007-loans-by-vote.md)                           | Loans and all money decisions by member vote; auto-disbursal                                     | Accepted                           |
| [0008](0008-exit-notice-auto-payout.md)                 | Exit via notice period with automatic payout                                                     | Accepted                           |
| [0009](0009-penalties-into-vault.md)                    | Late fees and loan penalties paid into the vault                                                 | Accepted                           |
| [0010](0010-no-wallet-recovery.md)                      | No wallet recovery; dormant-member rule instead                                                  | Accepted                           |
| [0011](0011-static-nextjs-cloudflare-pages.md)          | Static Next.js PWA on Cloudflare Pages                                                           | Accepted                           |
| [0012](0012-monorepo-foundry.md)                        | Monorepo (pnpm + Turborepo) with Foundry for contracts                                           | Accepted                           |
| [0013](0013-production-scenario-testing.md)             | Tests model real production failures, not happy paths                                            | Accepted                           |
| [0014](0014-utc-deadlines.md)                           | All deadlines in UTC on-chain; local time shown only in the app                                  | Accepted                           |
| [0015](0015-no-unbounded-loops.md)                      | No loops over members in contracts (n members must scale)                                        | Accepted                           |
| [0016](0016-nominee-wallet.md)                          | Nominee wallet per member (G1 rule 1)                                                            | Accepted                           |
| [0017](0017-payment-holiday.md)                         | Payment holiday: fee-free delay, up to 3 times a year                                            | Accepted                           |
| [0018](0018-loan-cap-vs-stake.md)                       | Loan cap tied to the borrower's own stake                                                        | Accepted                           |
| [0019](0019-rule-change-delay-rage-quit.md)             | 7-day delay on rule changes, with exit under old rules                                           | Accepted                           |
| [0020](0020-immutable-circle-contracts.md)              | Circle contracts are immutable; new versions are opt-in by vote                                  | Accepted                           |
| [0021](0021-dissolve-circle.md)                         | Circles can be dissolved by vote                                                                 | Accepted                           |
| [0022](0022-rules-as-parameter-menu.md)                 | Circle rules are a fixed menu of parameters                                                      | Accepted                           |
| [0023](0023-ui-system.md)                               | UI system: shadcn/ui + web3-style components, one layout, real pagination and search             | Accepted (look superseded by 0025) |
| [0024](0024-seo-geo-llms-txt.md)                        | SEO, GEO and llms.txt on public pages only                                                       | Accepted                           |
| [0025](0025-visual-identity-gallery.md)                 | Visual identity "Gallery": calm premium light UI + folk-art illustration, generous whitespace    | Accepted                           |
| [0026](0026-interaction-states-feedback.md)             | Every action gives feedback; eight UI states; nothing crashes; plain-language messages           | Accepted                           |
| [0027](0027-public-content-in-typescript.md)            | Public page content is typed TypeScript (not MDX); OG images as `.png` routes                    | Accepted                           |
| [0028](0028-membership-founder-accept-and-join-vote.md) | Founders accept invites; others join by request + vote (quorum, 66% yes, snapshots)              | Accepted                           |
| [0029](0029-display-names.md)                           | Display names: ASCII, unique ignoring case, 30-day cooldown and reservation                      | Accepted                           |
| [0030](0030-late-fee-cap.md)                            | Each late fee is capped at half the installment (supersedes the fee rows of 0022)                | Accepted                           |
| [0031](0031-vault-modules-linked-libraries.md)          | Vault logic in linked external libraries (Membership first); fixes factory size, no proxies      | Accepted                           |
| [0032](0032-dormant-members.md)                         | Dormant members: vote after N missed months, >50% yes, pay or wake to return                     | Accepted                           |
| [0033](0033-voting-rights-invite-cap-circle-names.md)   | Voting rights after N payments, 3 open requests per member, circle names without links           | Accepted                           |
| [0034](0034-charts-from-chain-events.md)                | Charts read circle events from the chain (chunked from `createdAtBlock`) until the indexer       | Accepted                           |
| [0035](0035-no-circle-to-circle-lending.md)             | No circle-to-circle lending: a circle lends only to its own members                              | Accepted                           |
| [0036](0036-indexer-cloudflare-worker-d1.md)            | Indexer: Cloudflare Worker + D1 caching public circle events; RPC stays the fallback             | Accepted                           |
| [0037](0037-phase2-architecture.md)                     | Phase 2 architecture: blueprint factory, shared Ledger, Rules in storage, one module per feature | Accepted                           |
| [0040](0040-governance.md)                              | Governance: rule changes with delay to next period, fee waivers, dissolve, guardian off          | Accepted                           |
