# CLAUDE.md

Project memory for Claude Code. Loaded automatically in every session started in this folder.

## Project
WealthKart: phone app (installable PWA) for a savings group, "WealthKart G1". Members pay monthly installments and loan interest, request loans, and view fund analytics. Admins approve payments and loans and run the group.

- Payments go into the group's group bank account outside the app. The app records the claim; an admin approves it; approval writes it into the Google Sheet.
- Stack: Google Apps Script + Google Sheets (data) + Google Drive (payment screenshots). Free tier only; no paid services.
- Status: in testing. Rules can still change.

## New build (see PLAN.md)
Rebuilding WealthKart as a product on **Avalanche**: Next.js PWA + Solidity (Foundry) + Cloudflare (OpenNext/Workers, D1, R2, Cron). **Members contribute AVAX monthly into a per-group vault contract**; loans are disbursed and repaid in AVAX. A user can be in many groups; groups have open, configurable membership. Share/NAV accounting handles late joiners and exits. Rules are computed lazily on-chain; Cron only sends reminders. Contracts are asset-agnostic (USDC later). G1 is the pilot; its INR history is off-chain only.
- **Locked decisions (2026-11-14):** login = **Core Wallet only** (extension + mobile via WalletConnect); members pay their own gas (no paymaster/AA). Installments set **directly in AVAX** (no INR conversion). **Lost wallet = no recovery**; a dormant-member vote stops dues, and shares stay with the address. Groups are called **Circles**: 1 wallet → n circles, 1 circle → n members, private friends only. **Loans: request → member vote (quorum + majority, borrower can't vote) → auto-disbursed.** No admin approval for money. **Exit: notice period (default 30d) → NAV snapshot → AVAX auto-paid via Chainlink Automation `processExits()`** (permissionless fallback); blocked with an open loan or guarantee. **Penalties into the vault:** missed installment = late fee 1 after due day, fee 2 after day 20; missed loan interest = late fees, default after 2 months (freeze borrower + guarantor shares), tenor step-ups. Reminders = Phase 4. **All deadlines UTC on-chain** (pay before 23:59:59 UTC on the due day, due day ≤ 28); the UI also shows device local time and a countdown (ADR 0014). **Nominee wallet** per member (inside or outside the circle), claim = dormant + vote + notice, member can cancel (ADR 0016). **Payment holiday** 3×/year: fee-free delay, still owed (0017). **Loan cap** k × (own + guarantor stake), default 2 (0018). **Rule changes**: 7-day delay with rage-quit (0019). **Circle contracts immutable**, no proxies; new versions only by migration vote; guardian pause limited to 14 days and never blocks exits (0020). **Dissolve** by 66% vote (0021). Rules = fixed parameter menu with on-chain bounds (0022, table in PLAN.md §3). Charts for everything (PLAN.md D7). **UI: shadcn/ui themed per ADR 0025 (no Magic UI/Aceternity, no dark-first); every app page uses the same layout; every list paginated with URL state; debounced 300 ms search** (ADR 0023, `docs/ui.md`). Landing page: placeholder only, designed later. **SEO/GEO/llms.txt** on public pages only (`/`, how-it-works, faq, rules, security); `/app/*` is noindex; AI crawlers allowed; never advertise returns (ADR 0024, `docs/seo.md`). **Look LOCKED: "Gallery" (ADR 0025, reference `docs/design/gallery.html`):** light, premium and calm; near-monochrome UI with a cobalt accent; Instrument Serif for display and big numbers, Hanken Grotesk for UI, Geist Mono for data; folk-art cut-paper illustration only on the hero, circle covers, empty states and avatars. **Interaction (ADR 0026, `docs/ui.md` §8–12):** loaders wherever something waits; buttons show press/working/done/failed; lucide icons that animate on click, **no emojis anywhere**; every data component handles 8 states (loading, success, empty, error, failed tx, stale, offline, access) plus pending tx; error boundaries at app/page/widget level so nothing crashes; toasts for action results, inline alerts for attention; **all messages in plain language** via the message catalogue. **Generous whitespace is a hard requirement** (founder: "empty spacing is what makes it feel premium SaaS"); when crowded, add space rather than shrink text. Rejected: dark glow cards, material themes, the playful folk UI. Page map and monorepo layout are in PLAN.md §4; circle routes use `?id=` query params because the app is a static export.
- **Zero personal data:** wallet address = identity. No real names, phone or email stored anywhere. Members pick their own in-game-style display name per group, stored on-chain in `Membership` (unique per group, cooldown on changes). Passkey smart wallets or Core/MetaMask. No user DB, so the app is a static Next.js export on Cloudflare Pages reading from the chain.
- **Scope:** private, invite-only friend circles that lend on need. No public discovery, no chit-style rotating payouts, no advertised returns, and the company never holds keys or funds. Goal: Avalanche/Team1 funding, so each phase ends in a demoable grant milestone. The Apps Script app in the guide is the old version.

## Files
- `WealthKart-Guide.md`: user-facing guide. Source of truth for roles, rules and screens.
- `WealthKart G1 Monthly Investment.xlsx`: copy of the group's live Google Sheet (see "Sheet structure").
- No app source code in repo yet.

## Sheet structure (xlsx)
12 members, fixed columns E..P (same order in `WealthKart G1` and `Debit`). One row per month, Apr-18 (row 3) to Dec-26 (row 107); totals at row 109.
- `WealthKart G1`: `1` = installment paid. Q `Credits/ Deductions` (bank interest, fees, interest lump), R comment, S per-head installment, T month collected, U `UTI Investment`, W installments, X bank net.
  - Installment history: ₹1,000 (Apr-18..Oct-20, rows 3-33), ₹1,500 (rows 34-50), ₹2,000 (51-67), ₹3,000 (68-92), ₹4,000 (93+, Oct-25 on). Row 110 hardcodes these bands.
- `Debit`: one net cell per member per month mixing interest (+), repayment (+) and loan sent (−), written as formulas like `=2500-50000`. Free-text notes in R..U. Row 110 = current outstanding at 1% (hand-edited formula), rows 111/112 for 1.5%/2% (unused), row 114 interest gain, row 119 interest due this month.
- `Summary`: per-member totals; column E outstanding loan (hand-edited, duplicates `Debit` row 110). Fund value, profit, bank balance, reserve (C16 = ₹1L EF + 20% of (balance − ₹1L), capped ₹1L — differs from guide's flat 20%).
- `Guidlines`: rules 1-18 (source of rule numbers). `Guarantor`: borrower→guarantor pairs. `Account Details`: bank details (sensitive). `Sheet7`: old cumulative scratch.
- Snapshot Nov-26: paid in ₹26.58L (₹2.215L each), current value ₹35.74L, profit ₹9.16L, interest earned ₹8.65L, lent ₹23.35L, UTI ₹5.01L, bank ₹7.38L.

## Key rules (details in guide §4)
- Installment ₹4,000, due 10th. Changes only when an admin edits it; "yearly increase" is for projection only.
- Late fee ₹100 from 11th, +₹100 from 21st. Admin may waive with reason.
- Interest starts the month after disbursal, on balance at start of month. Repayment only reduces the payer's own loan (chosen loan first, then oldest).
- Rule 15 (super admin only): 6-month tenors at 1% / 1.5% / 2%; no extension after 18 months.
- Rule 18: medical loans up to ₹1,00,000, interest-free for disbursal month + next 2.
- Reserve 20% of fund (rule 12). Max owed per member ₹5,00,000. Min loan request ₹1,000.
- No advance payments, no overpayment, no duplicate installment for the same month.
- Invariant: cash + UTI + loans lent out = current value.

## Roles
Super admin, admins, members (see guide §1). Auth: mobile + 6-digit PIN, salted hash, 5 wrong tries = 15-min lock, 60-day session.

## Working rules (user requirements)
- **Every folder has a `README.md`**: what's here, when to open it, key files. Check the README before opening a folder; update it when the contents change. Format in `docs/engineering.md` §1.
- **Every decision gets an ADR** in `docs/decisions/` (next number, template 0000), plus a row in its README index. Never rewrite an accepted ADR; supersede it.
- **`docs/STATUS.md` is the phase + todo tracker.** Read it at session start; tick items and update the current phase as work lands.
- **Tests model real production scenarios** (`docs/testing.md` catalogue, IDs like `S-PAY-02` in test names), plus fuzz, invariants and a G1 history replay. A new bug means a new scenario first.
- Husky + lint + CI/CD per `docs/engineering.md`.
- **Repo skills** in `.claude/skills/` (see its README): run `solidity-hardening` + `redteam-attack` on every contract change; `frontend-design` for UI; `security-audit-orchestrator` pre-mainnet; `human-writing-style` for docs and pitch; `3d-website-guide` only when the landing page gets its Phase 4 upgrade. Source: `D:\skills`.

## Working notes
- Keep the Google Sheet layout compatible with the existing tabs; months before the app start month are read-only.
