# Testing: what really happens in production

Per [ADR 0013](decisions/0013-production-scenario-testing.md), tests describe **real situations**, not "function returns X". Each scenario below must have at least one test. When a bug is found anywhere (testnet, audit, prod), add a scenario here first, then the test, then the fix.

Test IDs (`S-PAY-03`) go in test names so failures map back to this file.

## Layers

| Layer              | Tool                                      | What it proves                                                                      |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Contract scenarios | Foundry (`forge test`)                    | Real member stories across months, with `vm.warp` time travel                       |
| Fuzz               | Foundry fuzz                              | Random amounts, timings, orders don't break rules                                   |
| Invariants         | Foundry invariant (handler-based)         | Money is never created or lost, whatever sequence happens                           |
| History replay     | Foundry + `packages/rules`                | G1's 104 months replayed (scaled into AVAX) give the same totals as the rule engine |
| Fork tests         | Foundry `--fork-url` Fuji                 | Works against real chain state, Chainlink Automation registry                       |
| Rule engine        | Vitest                                    | TS math = contract math (differential tests via `ffi` or shared vectors)            |
| E2E                | Playwright + Anvil + injected wallet mock | A member clicks through real flows against a local chain                            |
| Gas                | `forge snapshot` + CI diff                | No regressions; 500+ member circle still works                                      |
| Static analysis    | Slither, Aderyn, Solhint                  | Known vulnerability patterns                                                        |

### G1 history replay: status

`packages/rules/test/g1-replay.test.ts` replays `test/fixtures/g1-ledger.json` (made by `packages/rules/scripts/extract-g1.py` from the anonymised xlsx) and reproduces the Nov-26 snapshot **to the rupee**: paid in, cash, UTI, loans out, current value, profit and interest earned (S-ACCT-08..13).

Known gaps:

- **Per-loan interest history can't be replayed.** The sheet's Debit cells net interest, repayment and loan sent into one number per member per month, and loan dates live only in free-text notes. The replay checks interest month-wide instead (S-LOAN-17, Oct-26) and in total (S-ACCT-12).
- **Outstanding loans are hand-edited formulas** (Debit row 110 and Summary column E). The replay uses them as given and checks the two copies agree.
- The Foundry side (scaled into AVAX against `CircleVault`) waits for loans in Phase 2.

## Invariants (must hold after every action)

- I-1 `trackedCash + loansOutstanding + pendingExitsOwed == totalAssets` (internal accounting, never `address(this).balance`)
- I-2 `sum(member shares) == totalShares`
- I-3 No member can withdraw more than `shares × NAV − owed`
- I-4 NAV never decreases except through a voted loan write-off, or a USDT transfer fee of at most 1% that the circle absorbs (ADR 0050)
- I-5 Free cash for loans never dips below the reserve %
- I-6 A frozen member can't exit, borrow, or transfer anything
- I-7 Each member pays at most one installment per period
- I-8 Force-sent AVAX (selfdestruct or coinbase) doesn't change NAV or break accounting
- I-9 `memberCount` = creator + accepted founders + admitted members; the member list never holds duplicates
- I-10 A display name in use maps back to exactly one member, ignoring case
- I-11 Open join requests stay ≤ 20, each is Open and indexed by its applicant
- I-12 Vault balance ≥ total assets − loans outstanding + payouts waiting to be withdrawn (governance claims, refusing wallets); `≥` because AVAX can be forced in (EXIT-10)
- I-12u (USDT circles, ADR 0046) `token.balanceOf(vault) >= totalAssets - loansOutstanding + totalWithdrawable`, and equal to it plus tokens sent straight to the vault; run with random installments, loans, interest, repayments, exits, withdrawals, donations and Tether-style freezes (`CircleVault.usdtInvariant.t.sol`)
- I-13 The exit queue is a consistent linked list of live exits; exactly the queued members are flagged `exiting`, and `voterCount` leaves them out (ADR 0043)

## Scenario catalogue

### Contributions (S-PAY)

- S-PAY-01 Member pays on time → shares minted at NAV, no fee
- S-PAY-02 Pays at 23:59:59 UTC on the due day → **no** late fee (ADR 0014)
- S-PAY-03 Pays at 00:00:00 UTC the day after → late fee 1 (exact boundary)
- S-PAY-04 Pays after day 20 → fee 1 + fee 2
- S-PAY-05 Double-clicks Pay / resubmits the same tx → second payment for the period rejected, no AVAX lost
- S-PAY-06 Tries to pay next month in advance → rejected
- S-PAY-07 Sends the wrong amount (too little / too much) → rejected, not partially credited
- S-PAY-08 Misses 3 months, then pays all at once with fees → periods filled oldest first
- S-PAY-09 Installment changed by vote mid-month → members who already paid unaffected
- S-PAY-10 Sends plain AVAX directly to the vault address (no function call) → rejected or held as a donation without affecting NAV
- S-PAY-11 Member in 5 circles pays all of them → no cross-circle interference

### Membership (S-MEM)

- S-MEM-01 Join request from the circle link → vote passes (quorum + 66% yes) → member; vote fails → not a member (ADR 0028)
- S-MEM-02 Founder invite not accepted within 14 days → can't be accepted; the person can still request to join (no secret invite codes, RT-04)
- S-MEM-03 Joins late (month 40) → buys in at current NAV, existing members not diluted
- S-MEM-04 Two people pick the same display name → second rejected
- S-MEM-05 Changes name twice in 30 days → second rejected
- S-MEM-06 Name with emoji / RTL / zero-width chars / 200 chars → normalised or rejected
- S-MEM-07 Wallet lost; 3 months missed → dormant vote → dues stop, shares untouched; dormant member can't vote, take a holiday or rename
- S-MEM-08 Dormant member comes back with `wake()` → dues restart this month (or next if the due moment passed); votes only on requests opened after waking; bad `dormantAfter` setting refused
- S-MEM-09 Circle at the 50-member cap (ADR 0045) → every action still under the gas limit and flat in the member count (ADR 0015)
- S-MEM-09a 50 founders (creator + 49) fit a cap of 50; a full circle refuses join requests; 51 founders are refused at creation (ADR 0045)
- S-MEM-09b Founder invites hold their seats (RT-USDT-03, ADR 0050): cap 3, creator + f1 + f2, f1 accepts → a join request is refused `CircleFull` while f2's invite is live; f2 can still accept; after f2 declines or the 14 days pass, a join succeeds. Cap 4: an approval that would take a held seat closes as Full and the late founder still gets in
- S-MEM-10 Joins (or circle created) after this month's due moment → first installment is next month; nobody starts already late (ADR 0028)
- S-MEM-11 Smart-contract wallet that refuses plain AVAX is a member → can pay and vote
- S-MEM-12 Only members who joined before the request can vote; outsiders, the applicant and later joiners can't; one vote each
- S-MEM-13 Outcome certain mid-vote → settles on that vote; window ends without quorum → expired; tie → rejected
- S-MEM-14 Applicant cancels; second open request rejected; vote passes but circle hit max members → closed as full
- S-MEM-15 Display name held while the vote runs; freed if rejected, expired, cancelled or full
- S-MEM-16 Admitted member sees the circle in their portfolio; only factory circles can register members
- S-MEM-17 Applicant names a member as inviter → shown as unconfirmed until that member votes yes; naming a non-member reverts
- S-MEM-18 Name rules: 3–24 chars of letters, digits, space, `_` `.` `-`; case-insensitive uniqueness; changing frees the old name
- S-MEM-19 Every membership error the contract can return is shown in plain language, never as a code

### Loans (S-LOAN)

- S-LOAN-01 Request → vote passes → AVAX arrives in the same tx as finalisation
- S-LOAN-02 Vote fails / quorum not met / window expires → nothing disbursed
- S-LOAN-03 Borrower tries to vote on own loan → rejected
- S-LOAN-04 Someone joins after a proposal was created and votes → rejected (snapshot)
- S-LOAN-05 Two loans approved at once that together exceed free cash → second fails safely at execution
- S-LOAN-06 Loan would breach the 20% reserve → rejected at request and re-checked at execution
- S-LOAN-07 Interest starts next month; repaying mid-month doesn't cut this month's interest
- S-LOAN-08 Loan taken and repaid in the same month → minimum one month's interest (rule 17)
- S-LOAN-09 Medical loan → 3 interest-free months, then the normal rate
- S-LOAN-10 Partial interest payments over a month → totals correct, "left to pay" correct (Phase 2, ADR 0038: interest is paid in full only, so a part payment is rejected and "left to pay" is unchanged)
- S-LOAN-11 Overpaying repayment → rejected or capped, never lost
- S-LOAN-12 Two open loans; repayment → chosen loan first, then oldest (Phase 2, ADR 0037: one active loan and one pending request per member, so a second request is rejected)
- S-LOAN-13 Interest missed → fee; 2 months missed → default, borrower + guarantor shares frozen
- S-LOAN-14 Tenor 1 → 2 → 3 rate steps; after tenor 3 the loan is due; vote → frozen shares repay
- S-LOAN-15 Guarantor tries to exit while guaranteeing → blocked
- S-LOAN-16 AVAX price crashes 60% mid-loan → nothing in the contract depends on price (sanity)
- S-LOAN-17 G1 replay: a month with no loan movements → each member's Debit cell equals 1% of their start-of-month balance
- S-LOAN-18 Loan with a guarantor → can't pass until the guarantor accepts; accepting after a passing vote pays out at once; never accepted by the window end → closed as failed
- S-LOAN-19 Circle requires a guarantor (rule 11) → request without one, naming yourself, or naming a non-member → rejected
- S-LOAN-20 Borrower cancels the request → borrower and guarantor ties released; the guarantor can back someone else
- S-LOAN-21 Settle vote on a default → borrower's shares, then the guarantor's, repay at NAV; the rest is written off; loans out back to 0; neither is frozen any more
- S-LOAN-22 Borrower cures, or repays in full, while a settle vote runs → the settle vote closes as cancelled
- S-LOAN-23 Guardian pause → no new requests, a passed loan waits; dissolved circle → no new loans, a passed loan fails
- S-LOAN-24 Borrower's wallet refuses AVAX → the loan is recorded, the AVAX waits in `withdrawable`, the vote doesn't revert
- S-LOAN-25 Borrower contract re-enters the vault while receiving the loan → re-entry blocked
- S-LOAN-26 Request checks: non-member, zero amount, fewer members than `minMembersForLoans`, bad ids; open requests page
- S-LOAN-27 Fuzz: interest for any number of months equals the month-by-month tenor schedule (1% / 1.5% / 2%, rounded up)
- S-LOAN-28 Invariants: AVAX held = cash + refused payouts; loans out = sum of principal; `loanTies` and `frozen` exactly match open requests, loans and accepted guarantees

### Exits (S-EXIT)

- S-EXIT-01 Request exit → 30 days → automatic payout = shares × NAV − dues
- S-EXIT-02 Exit with an open loan → blocked
- S-EXIT-03 **Bank run:** 50% of members request exit the same day → queue, reserve respected, paid in order from inflows
- S-EXIT-04 Chainlink Automation is down for a week → member/anyone triggers `processExits()`, same result
- S-EXIT-05 Exiting member is a contract wallet that reverts on receive → queue not blocked, funds claimable via pull
- S-EXIT-06 Exiting member is a contract that re-enters on receive → no double payout
- S-EXIT-07 NAV changes during the notice period or before the exit is processed (interest, fees arrive) → payout uses NAV at the moment it is paid (ADR 0039)
- S-EXIT-08 Member cancels exit during notice → restored to normal
- S-EXIT-09 Last member exits → vault empties cleanly, no dust stuck
- S-EXIT-10 Exit fee → stays in the vault; everyone else's NAV goes up
- S-EXIT-11 Dormant member exits → paid for their shares; dormant count drops
- S-EXIT-12 Rage-quit window open (ADR 0019, 0043) → exit matures at `min(now + notice, rageQuitUntil)` under the old rules, never instantly, and is paid at the switch even if an earlier exit is still in its notice
- S-EXIT-13 Member takes a loan tie or is frozen during the notice → exit dropped at processing, `exitsWaiting` stays exact
- S-EXIT-14b Gas sweep, AVAX circle (RT-USDT-01, ADR 0050): 6 matured exits (creator first, 24-byte names, cold storage via `isolate`), `processExits` at 150k..1.2M gas in 2k steps → each call pays ≥ 1 exit or reverts only `ExitGasTooLow`; never `PayoutGasTooLow`; paid count never drops as gas rises

### Governance (S-GOV)

- S-GOV-01 Rule change passes → applies from the next period, not retroactively
- S-GOV-02 Timelock: a passed change can't execute early
- S-GOV-03 Proposal spam by one member → rate limited (2 open per member, 10 in all, one new proposal per member per day)
- S-GOV-04 Fee waiver vote passes → fee removed, NAV adjusted correctly; the member it is about can't vote on it; unpaid started periods only
- S-GOV-05 Rule change outside the bounds → refused when proposed
- S-GOV-06 One rule change at a time: a second is refused while one is open or waiting; a due one is applied first
- S-GOV-07 Only current voters propose (non-members and members two periods behind can't)
- S-GOV-08 Quorum and pass mark: no quorum → expired; quorum but no majority → rejected; majority at the end → passes (ordinary rule changes); guardian-off and dissolve need the pass mark of all eligible members (ADR 0043)
- S-GOV-09 Vote guards: twice, outsider, after the window, unknown id → revert
- S-GOV-10 Proposer cancels an open proposal; nobody else can
- S-GOV-11 Guardian voted off → pause cleared and can't be voted off twice
- S-GOV-12 Snapshot: a member who gains a vote after the proposal opened can't vote on it

### Math and time (S-MATH)

- S-MATH-01 First depositor deposits 1 wei then donates to inflate share price → later members not robbed (virtual shares)
- S-MATH-01a Same attack at 6 decimals (USDT) → attacker never profits; the next member loses at most about donation / 1e6
- S-MATH-02 10 years of monthly rounding → dust always favours the vault, never a member
- S-MATH-03 Due day 28 in February (incl. a leap year)
- S-MATH-04 Timestamp exactly at a period boundary
- S-MATH-05 Max values: 10,000 AVAX loan, 1,000 members, 30 years of periods → no overflow

### Trust and collusion (S-TRUST)

- S-TRUST-01 A majority votes big loans to themselves, then defaults → loss limited by per-member cap / loan-to-stake limit; minority can exit before the next one
- S-TRUST-02 A majority votes a huge exit fee to trap the minority → the change is timelocked and members can exit under old rules first (rage-quit)
- S-TRUST-03 Quorum with dormant members → dormant excluded, so lost wallets can't block every vote forever
- S-TRUST-04 Member's wallet is **stolen** (not lost), thief requests exit → notice period gives time; circle can vote to freeze (not seize) pending review
- S-TRUST-05 Lookalike display name ("Rahul" with a Cyrillic "а") → rejected by normalisation
- S-TRUST-06 Admin multisig pauses forever → pause has a max duration; exits stay possible while paused

### Accounting edge cases (S-ACCT)

- S-ACCT-01 Loan defaults → NAV marks the loan down **before** anyone exits, so leavers don't take more than their real share
- S-ACCT-02 Interest lands in a lump on the 10th; someone joins on the 9th → interest accrues into NAV over the month, so a newcomer doesn't capture income earned by older members
- S-ACCT-03 A payment covers installment + fees + interest but is short → defined order (fees → interest → installment), or rejected whole
- S-ACCT-04 Frozen shares are worth less than the loan → shortfall written off evenly across members, recorded on-chain
- S-ACCT-05 Medical loan "once per financial year" → FY is Apr–Mar in UTC (ADR 0014)
- S-ACCT-06 Medical interest-free months overlap a tenor boundary → defined precedence
- S-ACCT-07 Two loan requests compete for the same cash (rule 14) → first finalised wins, second re-checked
- S-ACCT-08 G1 replay fixture covers Apr-18..Dec-26, 12 members, no missing months
- S-ACCT-09 G1 installment bands (₹1,000 → ₹4,000) match the sheet's hard-coded row 110
- S-ACCT-10 G1 replay: paid in ₹26,58,000 (₹2,21,500 each) at Nov-26
- S-ACCT-11 G1 replay: current value ₹35,73,552 = cash ₹7,37,552 + UTI ₹5,01,000 + loans ₹23,35,000
- S-ACCT-12 G1 replay: interest earned ₹8,65,375 = net Debit + outstanding; the sheet's two outstanding copies agree
- S-ACCT-13 G1 replay: fund XIRR Apr-18..Nov-26 ≈ 9.06% a year (installments on the 10th, value on 30 Nov 26)

### Circle lifecycle (S-LIFE)

- S-LIFE-01 Circle with 1 or 2 members → borrowing needs ≥ 3 members (the borrower can't vote, so someone else must)
- S-LIFE-02 Members vote to dissolve → new loans stop, existing loans must close, then everything is paid out by shares
- S-LIFE-03 Member dies (rule 1, ADR 0016) → nominee claims after dormancy + vote + notice → paid automatically
- S-LIFE-03a Nominee files a fake claim while the member is alive → member cancels during notice
- S-LIFE-03b Member with an open loan dies → loan repaid from their share first, remainder to the nominee
- S-LIFE-03c Member changes nominee during a pending claim → pending claim cancelled
- S-LIFE-04 Member takes a payment holiday before the due day (ADR 0017) → no late fee; pays both installments by the next due date
- S-LIFE-04a Holiday declared after the due day → rejected
- S-LIFE-04b 4th holiday in a year → rejected; 1st holiday in the new UTC year → allowed
- S-LIFE-04c Holiday month still unpaid at the next due date → normal late fees start
- S-LIFE-08 Migration vote to a new contract version passes (ADR 0020) → funds, shares, loans and nominees identical in the new circle; dissenters exit under old rules during the delay
- S-LIFE-09 Guardian pause → new loans and deposits blocked; exits still work; auto-unpauses after 14 days
- S-LIFE-10 Parameter set outside bounds (e.g. 50% interest, due day 31) → rejected on-chain (ADR 0022)
- S-LIFE-10a Member cap outside 3..50 (0 = unlimited, 2, 51) → rejected with a plain message; 3 and 50 accepted (ADR 0045)
- S-LIFE-11 Loan above k × (own + guarantor stake) → rejected (ADR 0018)
- S-LIFE-05 Member leaves, later rejoins → treated as a new member at the current NAV
- S-LIFE-06 AVAX 10× in price makes the installment unaffordable → vote to change the installment; applies from the next period
- S-LIFE-07 Member has exactly the installment but no AVAX left for gas → UI warns before sending

### Interaction and resilience (S-UX)

- S-UX-01 Click Pay → pressed feedback, spinner, "Paying…", button disabled; double-click sends one transaction
- S-UX-02 Every data component renders all eight states (Storybook/visual tests per state)
- S-UX-03 Indexer returns 500 → widget shows error card with Retry; rest of the page works
- S-UX-04 A component throws during render → widget-level boundary catches it; no white screen
- S-UX-05 Unhandled promise rejection → toast, no crash
- S-UX-06 RPC times out → fallback RPC tried, then friendly message
- S-UX-07 Every contract custom error has a catalogue message (CI check: no error without a message)
- S-UX-08 No emoji characters in UI strings (CI lint)
- S-UX-09 Toast + dialog + dropdown open together → correct stacking, nothing overlaps
- S-UX-10 Longest display name (20 chars) and 7-digit amounts → no overflow at 360 px width
- S-UX-11 Offline → banner, writes disabled, reads from cache marked stale
- S-UX-12 Reduced motion → no animations, all state changes still visible

### Reputation (S-REP)

- S-REP-01 Only circles from the same factory can write the record
- S-REP-02 Counts on-time and late months, loans repaid, defaults and circles across circles; mints the token once
- S-REP-03 Soulbound: transfers and approvals revert; ERC-5192 locked; ERC-721 interface reported
- S-REP-04 No record means no token
- S-REP-05 Fuzz: counters only ever go up
- S-REP-06 A vault writes to its own factory's record
- S-REP-07 Each installment is recorded as on time (no late fee) or late
- S-REP-08 A loan repaid in full is recorded
- S-REP-09 A default is recorded and stays even after a cure

### Circle asset: AVAX or USDT (S-USDT, ADR 0046)

- S-USDT-00 The asset is fixed at creation: `asset()` is the factory's USDT (or 0 for AVAX); an AVAX circle on the same factory never touches the token
- S-USDT-01 Full USDT lifecycle: approve-then-pay installments, late fee, loan paid out in USDT, interest, `repay(amount)`, exit paid after notice, dissolve and every claim; vault ends empty
- S-USDT-02 Transfer fee above 1% (1.01%) → payment rejected (`TokenAmountMismatch`), nothing booked (ADR 0050)
- S-USDT-03 Tether freezes one member → their exit payout goes to `withdrawable`, the member behind them is paid; `withdraw` fails while frozen and works once unfrozen
- S-USDT-03b Frozen borrower → the loan vote still settles; the loan waits in `withdrawable`
- S-USDT-04 AVAX sent with `contribute`, `payInterest` or `repay` in a USDT circle → `AvaxNotAccepted`
- S-USDT-05 Paying without approval → `TokenAllowanceTooLow`; approved but short of funds → `TokenBalanceTooLow`
- S-USDT-06 USDT sent straight to the vault doesn't move NAV
- S-USDT-07 Factory without a USDT address → USDT circle creation reverts `UsdtNotAvailable`
- S-USDT-08 AVAX circle `repay(amount)` needs `msg.value == amount`
- S-USDT-09 Gas sweep, USDT circle (RT-USDT-01 / M-1, ADR 0050): as S-EXIT-14b → every call pays ≥ 1 exit or reverts only `ExitGasTooLow`; never `PayoutGasTooLow`; monotonic in gas
- S-USDT-10 Tether turns on a 0.01% fee (RT-USDT-02, ADR 0050) → `contribute`, `payInterest` and `repay` succeed and count as paid in full; `TokenFeeAbsorbed` emitted; `totalAssets` short by exactly the fee; for a repayment `loansOutstanding` drops by the full amount; I-12u holds. S-USDT-10b: exactly 1% is absorbed, 2% reverts `TokenAmountMismatch`
- S-DEPLOY-01 `DeployFactory.s.sol` on chain 43114 (RT-USDT-06, ADR 0050) → reverts without `CONFIRM_MAINNET=yes`, with a USDT other than C-Chain USDt, or with the mock token

### Analytics and activity (S-ACT)

- S-ACT-01 A circle records the block it was created in, so the app reads its events from there
- S-ACT-02 Monthly series: each installment counts in the month it's for; value accumulates; the share index starts at 1.00 and fees lift it
- S-ACT-03 Heatmap squares: before joining, on time, late, paid after a holiday, missed (holiday months only after the next due moment), due, upcoming, dormant (between dormant and wake)
- S-ACT-05 Activity feed: every known event becomes one plain sentence, newest first; join and dormant votes name who they're about; filter by type; search names, addresses and tx hashes
- S-ACT-04 Event reading: lifetime split into RPC-sized block ranges; very old circles keep the newest chunks and say so; only known events are used

### Indexer (S-IDX)

- S-IDX-01 Bigints survive storage; strings that look like numbers stay strings
- S-IDX-02 Catches up in chunks; a circle created and used in the same range is complete; API serves its logs with open CORS
- S-IDX-03 Re-running changes nothing; stops at the chunk limit and resumes next time
- S-IDX-04 Pages results; rejects bad addresses and paging values; 404 and 405 for other routes and methods
- S-IDX-05 RPC down: answers from what is already indexed
- S-IDX-06 App client: revives bigints, pages through, ignores logs past the first page's cursor, ignores an indexer on another chain
- S-IDX-07 D1 soft size limit: the indexer stops storing new events and its cursor, `/v1/health` reports `full` and the size; no limit keeps indexing

### Frontend / E2E (S-WEB)

- S-WEB-01 Core not installed → install prompt
- S-WEB-02 Wrong network (Ethereum, Fuji vs mainnet) → switch prompt; no tx sent on the wrong chain
- S-WEB-03 User rejects the tx in Core → clean state, can retry
- S-WEB-04 Tx pending for minutes / dropped → UI doesn't double-submit, shows status
- S-WEB-05 RPC down or rate-limited → fallback RPC, readable error
- S-WEB-06 Indexer lagging behind chain → UI shows chain truth for the user's own state
- S-WEB-07 Switch account in Core mid-session → app reloads for the new wallet
- S-WEB-08 Mobile Core via WalletConnect: session drops mid-payment → recovers
- S-WEB-09 Offline PWA → shows cached data marked stale; no writes
- S-WEB-10 Values shown in AVAX with correct decimals (18), no float rounding in display
- S-WEB-12 Paginate to page 3, refresh / back / share link → same page, size, search and filters restored
- S-WEB-13 Typing "ravi" fast → one request after 300 ms, stale responses never overwrite newer ones
- S-WEB-14 Search or filter change while on page 5 → resets to page 1
- S-WEB-15 `?page=99` after data shrank → clamps to last page, no error
- S-WEB-16 Members list with 500+ members → pagination and search stay fast
- S-WEB-17 `prefers-reduced-motion` → no animations, layout identical
- S-WEB-11 Deadline shown in UTC and device local time, with a countdown; correct across midnight in IST and in UTC−5
- S-WEB-18 Sitemap and robots.txt list public pages only; `/app/` and `/kit/` are disallowed for every crawler, AI crawlers allowed elsewhere
- S-WEB-19 `/llms.txt`, `/llms-full.txt` and each page's `.md` twin carry the same questions and answers as the HTML page
- S-WEB-20 Public copy never advertises returns; titles ≤ 60 chars, descriptions ≤ 155; JSON-LD can't break out of its script tag
- S-WEB-21 PWA: manifest opens `/app/` standalone with 192/512 and maskable icons; the service worker never caches RPC, cross-origin or non-GET requests
- S-WEB-25 Circle switcher lists your circles by name and keeps you on the same page (overview or pay) when switching
- S-WEB-30 Same wallet or circle address (any letter case) always gives the same avatar and cover, on every device, with no network call
- S-WEB-31 Different addresses spread across every avatar shape and cover layout; neighbours in a members list rarely look identical
- S-WEB-32 Generated art uses only the art palette and stays inside its frame
- S-WEB-33 Avatars are decorative next to a visible name and labelled when standing alone; covers carry the circle name as their label
- S-WEB-34 Every empty-state variant shows a fixed, decorative spot illustration
- S-WEB-35 Invite link carries only the circle address and the inviter; any look-alike contract that isn't in the factory registry shows a "don't pay this" warning on every circle page (RT-01)
- S-WEB-40 Sign-in return path guard: only `/app/` paths are accepted as `next`; absolute URLs, `//host`, backslashes and encoded tricks fall back to `/app/`
- S-WEB-41 Proposal kinds and fee-waiver reasons map from the contract enums to plain titles and labels; reasons are a fixed list, never free text
- S-WEB-42 Proposal outcome mirrors `Governance._outcome` and `Rules.passes` (50% means more than half; early decision; expired without quorum); tally and settled lines in plain words
- S-WEB-43 Exit phase (none, notice, ready, waiting for cash) mirrors `Exits.claimExit`; notice reads "no notice" during a rage-quit window
- S-WEB-44 A fee waiver can only name started, unpaid months of that member, newest first
- S-WEB-45 Basis points show as percentages without trailing zeros and typed percentages convert back exactly (two decimals at most)
- S-WEB-46 Every rule setting reads in plain words; a rule diff lists only what changed, before and after
- S-WEB-47 `rulesProblem` refuses every out-of-bounds setting `Rules.validate` refuses, on the right field, and accepts the edges
- S-WEB-48 The rule-change form round-trips the current rules and reads viem's struct output
- S-WEB-49 Rage-quit shortens the exit notice to the moment new rules apply (ADR 0043)
- S-WEB-50 Loan limits mirror `LoanBook._limit`: the lowest of the fund cap, k x (own + guarantor stake) and lendable cash, plus the medical cap for medical loans; each limit explained in plain words
- S-WEB-51 Typed AVAX amounts parse to exact wei; zero, negatives, commas, exponents and more than 18 decimals are refused
- S-WEB-52 The loan preview uses the rules engine: monthly interest per tenor rounded up, first charged month (later for medical), repay-by month, rule-17 minimum (none for medical)
- S-WEB-53 The tenor timeline marks past, current and next terms and "due in full" after the third; the rate charged per month mirrors `LoanBook._span`
- S-WEB-54 A loan is defaultable after `defaultAfter` late months or past the third tenor, never twice; the cure text says what to pay
- S-WEB-55 The repay form refuses what `repay` refuses: overdue interest, closing with interest owed, a part payment that covers the whole loan
- S-WEB-56 Asking for a loan is blocked with the first reason that applies (closed, paused, frozen, dormant, not a voter, loan or request open, too few members)
- S-WEB-57 `loanOf` structs and request enums read correctly; small amounts keep four decimals; settled lines say what happens next
- S-WEB-58 The loans list is built from events (voting, active, repaid, default, settled, didn't go ahead), filters by status, type and borrower name or address, and sorts by date, amount and rate; bad URL values fall back
- S-WEB-59 "Loans outstanding per member" counts running and defaulted loans, biggest first; "Where the money is" splits value into lent out, reserve (rounded up, capped at cash) and free cash that add up
- S-WEB-60 Every loan event reads as a plain sentence in the activity feed (request, guarantee, vote, payout, interest, repayment, default, cure, settle, not approved) under the "Loans" filter
- S-WEB-61 One stake, one loan (ADR 0043): borrowers with a live request or loan and guarantors who accepted one are tied, so the guarantor picker leaves them out and a guarantor can't ask; asking is also refused while you've asked to leave; a loan's own `defaultAfter` decides when it can be marked as defaulted
- S-WEB-62 Circle asset helpers (ADR 0046): `vault.asset()` zero = AVAX/18 decimals, else USDT/6; amounts format, parse (extra decimals refused) and chart in the right unit; loan, rule and CSV text name the circle's asset
- S-WEB-63 Create form (ADR 0045, 0046): AVAX by default with a cap of 12; USDT parses 6 decimals and sends `asset = 1`; caps 2 and 51 refused, 3 and 50 accepted, a note above 20; more starting members than the cap refused

### End-to-end (Playwright, `apps/web/e2e/`)

Real static export, local anvil chain posing as Fuji (chain id 43113), test wallet that announces itself as Core and forwards to anvil. Every user-facing feature adds one here (CLAUDE.md).

- S-E2E-01 Public pages load and stay indexable; app pages are noindex; robots.txt blocks `/app/`
- S-E2E-02 Connect Core and see the portfolio
- S-E2E-03 Start a circle, land on it; started after the due day means first installment next month; pay it and see "all paid up"
- S-E2E-04 Founder named at creation isn't a member until they accept; after accepting, members count goes up
- S-E2E-05 Friend opens the invite link, picks a free name, asks to join; members vote yes in their own browsers; request settles on the deciding vote and the friend sees "You're in" and their name in the members table
- S-E2E-06 Request nobody votes on: after the voting window anyone can settle it as expired; the applicant sees the result
- S-E2E-07 Picking a name another member uses (different letter case) is refused before sending; a free name saves and the change button locks for 30 days
- S-E2E-08 A wallet page while signed out sends you to sign in, then back to the page you asked for
- S-E2E-09 Without Core installed, sign-in offers the Core download instead of a broken button
- S-E2E-10 A crafted `next` link on the sign-in page can't send you outside the app
- S-E2E-11 Circle created with "missed months before a dormant vote" = 1; a member stops paying; another member sees "Missed N months" and starts a vote from the members table; a third member's yes settles it; the table shows "Dormant, payments paused"
- S-E2E-12 The dormant member sees "Your payments are paused", the Pay page explains paying brings them back, and "I'm back" wakes them
- S-E2E-16 Activity page from the nav: on-time and late payments and joins are listed with Snowtrace links; the Payments filter and a search update the list and the URL
- S-E2E-15 Two members pay (one on time, one late); the circle page shows the summary line, the three charts (each readable as a table) and the heatmap with one on-time and one late square; the home page shows portfolio totals and each circle's share
- S-E2E-14 A circle name that looks like a web address is refused by the create form before anything is sent; a member voted in shows "can vote after 2 more payments"; a join card shows the inviter's open invites
- S-E2E-13 The sign-in page fits one screen with no scrolling on a small phone, a laptop and a desktop; Back returns to the previous page on this site, or home
- S-E2E-18 A member asks to leave from the circle page: the dialog shows the 30-day notice and today's value; the card shows the notice with UTC and local time and "Stay in the circle"; after the chain passes the notice, "Collect my share" pays out, vault value goes down and the member count drops
- S-E2E-19 The guardian pauses from a confirm dialog that explains the 14-day and 90-day limits; the banner shows on the overview and Pay pages for everyone, only the guardian gets Unpause, another member can still ask to leave, and Unpause ends it
- S-E2E-20 A rule change (notice 30 to 14 days) is proposed from the dialog, an out-of-bounds fee is refused before sending, a second member's yes passes it, the banner shows "New rules apply on" and members see they can leave before the new rules start; after the wait "Apply new rules" works and the rules card shows 14 days
- S-E2E-21 A late member's fee waiver is proposed by another member (member, month, reason), the subject can't vote on it, a yes passes it, and she pays the late month with no late fee
- S-E2E-22 Closing the circle is proposed and passes at 66% with a calm warning on the card; a member claims her share from the circle page, vault value goes down and she leaves
- S-E2E-23 A member opens Loans from the nav and asks for 0.5 AVAX (limits shown, an amount over the limit refused before sending, monthly interest previewed); two others vote yes on the Votes page in their own browsers; the borrower's balance goes up by exactly 0.5 AVAX, the loan panel and the list show it, and the overview shows both loan charts with a table view
- S-E2E-24 A month later the borrower pays the exact interest from the loan panel, then repays in full from the Repay dialog; the panel returns to "no loan" and the activity feed's Loans filter lists the interest and the repayment
- S-E2E-25 A borrower names a guarantor in the dialog (the limit counts both savings); the card shows "not agreed yet"; after two yes votes it waits for the guarantor, who sees the notice explaining what backing means, clicks "Back this loan", and the AVAX reaches the borrower
- S-E2E-26 After two months of unpaid interest another member sees "Interest 2 months late", marks the loan as defaulted from a confirm dialog, the row turns to default with "Ask the circle to settle", and the borrower sees the frozen notice with how to lift it
- S-E2E-31 Start a USDT circle: USDT is offered (factory has one), the freeze and AVAX-for-gas warning shows, amounts are in USDT; the Pay page says the wallet has too little USDT; after the faucet mint the member pays in two steps (approve up to installment plus both fees, then pay), exactly 50.00 USDT leaves the wallet, 2 USDT of allowance is left, and the overview shows the USDT badge and amounts
- S-E2E-32 The create form refuses member caps of 2 and 51 before sending and notes slower votes above 20; a cap of 50 creates an AVAX circle with `maxMembers = 50` and the AVAX badge

## Gates in CI

- All scenarios and invariants pass (invariant runs ≥ 256 runs × depth 100 on PRs, deeper nightly)
- Branch coverage ≥ 95% on `packages/contracts/src` money paths
- No new Slither high/medium findings
- Gas snapshot diff reviewed
- Playwright E2E suite green (`pnpm --filter @wealthkart/web e2e`)

## Security review fixes (S-RV)

From the November 2026 module reviews ([governance](redteam/2026-11-governance-review.md), [exits](redteam/2026-11-exits-review.md), [loans](redteam/2026-11-loans-review.md)); decisions in ADR 0043. Tests: `packages/contracts/test/CircleVault.reviewFixes.t.sol`.

- S-RV-LAYOUT Storage slots the tests poke with `vm.store` haven't moved (transient lock, `exiting` byte, exit list head, rules)
- S-RV-GOV-01 6 of 12 members vote to dissolve with quorum met → expires, not dissolved; in a 5-member circle at 20% quorum the proposer alone can't dissolve
- S-RV-GOV-02 Exit pending when the circle dissolves → paid with no exit fee; new exits refused; a waiting exit is cleared when its member claims dissolution (`exitsWaiting` exact)
- S-RV-GOV-03 Rule change that lowers the dissolve bar (or touches any risky field) → needs the dissolve pass mark of all eligible members; safer changes keep the ordinary bar
- S-RV-GOV-04 A passed change is shown in force from `effectiveAt` and the next write applies it, with no poke
- S-RV-GOV-05 Every forwarded Governance write, then a `nonReentrant` call in the same transaction → the lock was never left set
- S-RV-GOV-07 Proposer tries to cancel after the window closed → refused; the vote is finalised as passed
- S-RV-GOV-09 Member two periods behind proposes a waiver for themselves → refused; nobody can open a waiver for a dormant member
- S-RV-GOV-13 Dirty or short calldata through the forwarder → reverts; a view called by CALL writes nothing
- S-RV-EXIT-01 Two members churn request/cancel hundreds of times → queue holds only live exits, cancel stays O(1); two waiting exits are both paid once cash returns
- S-RV-EXIT-02 Seven self-claims at the front → keeper still sees the next matured exit
- S-RV-EXIT-03 Rage-quit exit matures at the earlier of the notice and the switch, never at once
- S-RV-EXIT-04 Member four months behind exits → paid full value (arrears forgiven by design)
- S-RV-EXIT-05 Later exit claims while an earlier matured one is unmarked → the earlier one is paid first
- S-RV-EXIT-06 Member asks to exit → can't vote or propose and leaves the quorum base; cancel → votes again on new proposals only
- S-RV-EXIT-09 Caller sweeps gas limits on a payout → never pushes it into `withdrawable`
- S-RV-EXIT-11 Creator leaves → guardian role and any pause end for good, even after rejoining
- S-RV-LOAN-01 Mutual guarantees, a borrower guaranteeing, or a guarantor with an open request → refused
- S-RV-LOAN-02 Circle dissolves with a loan out → untied members claim cash now; the default is settled by anyone with no vote; everyone claims the rest and the vault empties
- S-RV-LOAN-03 Borrower wallet return-bombs or burns gas → the vote still closes; a refused payout becomes withdrawable
- S-RV-LOAN-04 `defaultAfter` and the interest late fee change after payout → the running loan keeps its own
- S-RV-LOAN-05 Medical cap lowered before payout → the request closes as Failed
- S-RV-LOAN-06 Settle months after a default → charges interest and fees only up to the default month
- S-RV-LOAN-07 Exit matured but unmarked at the head of the queue → disbursal waits until it is paid
- S-RV-LOAN-08 Frozen member → can't vote on loans or proposals
- S-RV-LOAN-09 Member in exit notice → can't borrow or guarantee
- S-RV-LOAN-11 `loanRequest(0)` → clean revert, not a panic

## Red-team scenarios

From [`redteam/2026-11-plan-redteam.md`](redteam/2026-11-plan-redteam.md). Each ID names the finding it covers.

- S-RT-01 (RT-01) Circle page with `?id=` of a contract not created by the factory → "This isn't a WealthKart circle", no Pay or Holiday button, no tx possible
- S-RT-02 (RT-01, RT-27) Join page for a non-factory address → no rules shown, verified-circle line absent; for a real circle → "Verified WealthKart circle" with Snowtrace link
- S-RT-03 (RT-02) Creator lists 3 other founders → they are invited, not members; `memberCount` = 1 and they don't count in quorum until each calls `acceptInvite()`
- S-RT-04 (RT-02) Founder invite not accepted within 14 days → expires; the circle never appears in that wallet's `circlesOf`
- S-RT-05 (RT-03) Member admitted today votes on a loan proposal created yesterday → rejected (snapshot); can't vote at all until N installments paid; founders vote from the start; N = 0 votes on admission; rights survive dormancy and return on wake; quorum base counts only voters
- S-RT-06 (RT-03) Admission vote with 60% yes when the pass mark is 66% → fails; one member with more than a third of open invites → warning shown on the request; a 4th open request naming the same member → reverts; only confirmed invites count as "brought in"
- S-RT-07 (RT-04) Attacker copies an address-bound invite from the mempool and calls `requestJoin` from another wallet → reverts; the invitee's request still succeeds
- S-RT-08 (RT-05) Same address opens a second join request while one is pending → reverts; expired requests leave the open list and reads stay bounded
- S-RT-09 (RT-06) Name with a Cyrillic look-alike letter, zero-width space, RTL mark, leading/trailing space, or differing only by case from an existing name → rejected
- S-RT-10 (RT-06) Member renames; another member tries to take the old name within 30 days → rejected; name taken between request and approval → member admitted with a placeholder name, vote not reverted
- S-RT-11 (RT-07) Member 2 periods behind → can't vote and isn't counted in quorum for proposals created while behind; pays up → can vote on new proposals
- S-RT-12 (RT-08) Borrower owes 6 months of unpaid interest; newcomer pays first installment → shares minted at NAV that includes accrued interest; after borrower pays, long-standing members' stakes aren't diluted
- S-RT-13 (RT-08) Loan 2 periods overdue → join NAV counts it at the impaired value; join page lists it
- S-RT-14 (RT-09) Exited member re-admitted with the same address → shares 0, fresh `nextPeriod`, holiday counters reset, no duplicate in `membersPage`
- S-RT-15 (RT-09) Member admitted after that month's due day → first period owed is next month, no late fees for the join month
- S-RT-16 (RT-09) Two admission votes finalised in the same block with one seat left under `maxMembers` → second finalise reverts or is rejected cleanly
- S-RT-17 (RT-10) Loan vote reaches majority 5 minutes in → can't finalise until the window ends; a voter changes their vote before the end → counted once, latest choice
- S-RT-18 (RT-11) Dormancy proposal for a member with fewer than N missed periods → rejected; holiday grace isn't "missed"; the member can't vote on it and the proposer's yes counts; proposer more than a month behind → refused; member catches up during the vote → closed as cancelled; majority no → rejected; dormant member pays → woken, pays only the current month (ADR 0032: a vote doesn't clear dormancy, to keep quorum snapshots honest)
- S-RT-19 (RT-12) Proposal to lower the reserve or raise k / exit fee / notice / fees → needs 66% and a 14-day delay; a lower-risk change keeps the normal pass mark
- S-RT-20 (RT-12) Member rage-quits during the delay → exit uses the old notice and fee even after the change takes effect
- S-RT-21 (RT-13) Migration proposal targeting an address not created by a registered factory → can't be created
- S-RT-22 (RT-14) Guardian pause → new joins and loans stop for 14 days, deposits never stop (so no late-fee issue); second pause within 90 days of the last → reverts; voted-off or departed guardian can't pause and anyone can unpause; exits, claims and withdraw still work during a pause
- S-RT-23 (RT-15) Pair with stakes 2 + 2, borrower has 3 paid periods → cap uses k = 1 (4 AVAX), not 8
- S-RT-24 (RT-16) Guarantor backs a second loan with already-locked shares → rejected; locked shares can't be exited
- S-RT-25 (RT-17) Exit queue non-empty and a loan vote passes → disbursal blocked until the queue is paid; reserve used for the queued exit
- S-RT-26 (RT-18) Member requests exit while a loan is 1 month late → payout excludes the haircut share, which is held and paid when the loan recovers
- S-RT-27 (RT-19) Second medical loan within 12 months → rejected; medical vote window under 12 hours → rejected at proposal time
- S-RT-28 (RT-20) Exiting member is a contract that reverts on receive or burns all gas → its payout goes to `pendingWithdrawals`; the next exits in the batch still pay
- S-RT-29 (RT-21) Keeper never runs → exiting member calls `processExit(self)` after the notice and is paid
- S-RT-30 (RT-22) Nominee claim passes; the member sends any tx during the notice → claim cancelled; nominee can't vote on their own claim
- S-RT-31 (RT-23) Payment sent at 23:59:55 UTC lands after the deadline → behaves per the deadline ADR (re-quote or accepted with fee1 and a refund credit); never silently overcharges
- S-RT-32 (RT-24) Rule change passing mid-month → applies from the next period only
- S-RT-33 (RT-25) Create a circle with fee1 above 50% of the installment → reverts with a plain message
- S-RT-34 (RT-26) Circle name containing `://`, `www.` or a domain pattern → rejected by the form and the contract
