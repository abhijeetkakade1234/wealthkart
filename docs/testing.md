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
- I-4 NAV never decreases except through a voted loan write-off
- I-5 Free cash for loans never dips below the reserve %
- I-6 A frozen member can't exit, borrow, or transfer anything
- I-7 Each member pays at most one installment per period
- I-8 Force-sent AVAX (selfdestruct or coinbase) doesn't change NAV or break accounting
- I-9 `memberCount` = creator + accepted founders + admitted members; the member list never holds duplicates
- I-10 A display name in use maps back to exactly one member, ignoring case
- I-11 Open join requests stay ≤ 20, each is Open and indexed by its applicant

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
- S-MEM-07 Wallet lost; 3 months missed → dormant vote → dues stop, shares untouched
- S-MEM-08 Dormant member comes back → can resume?
- S-MEM-09 Circle with 500 members → every action still under the gas limit (ADR 0015)
- S-MEM-10 Joins (or circle created) after this month's due moment → first installment is next month; nobody starts already late (ADR 0028)
- S-MEM-11 Smart-contract wallet that refuses plain AVAX is a member → can pay and vote
- S-MEM-12 Only members who joined before the request can vote; outsiders, the applicant and later joiners can't; one vote each
- S-MEM-13 Outcome certain mid-vote → settles on that vote; window ends without quorum → expired; tie → rejected
- S-MEM-14 Applicant cancels; second open request rejected; vote passes but circle hit max members → closed as full
- S-MEM-15 Display name held while the vote runs; freed if rejected, expired, cancelled or full
- S-MEM-16 Admitted member sees the circle in their portfolio; only factory circles can register members
- S-MEM-17 Applicant names a member as inviter → shown as unconfirmed until that member votes yes; naming a non-member reverts
- S-MEM-18 Name rules: 3–24 chars of letters, digits, space, `_` `.` `-`; case-insensitive uniqueness; changing frees the old name

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
- S-LOAN-10 Partial interest payments over a month → totals correct, "left to pay" correct
- S-LOAN-11 Overpaying repayment → rejected or capped, never lost
- S-LOAN-12 Two open loans; repayment → chosen loan first, then oldest
- S-LOAN-13 Interest missed → fee; 2 months missed → default, borrower + guarantor shares frozen
- S-LOAN-14 Tenor 1 → 2 → 3 rate steps; after tenor 3 the loan is due; vote → frozen shares repay
- S-LOAN-15 Guarantor tries to exit while guaranteeing → blocked
- S-LOAN-16 AVAX price crashes 60% mid-loan → nothing in the contract depends on price (sanity)
- S-LOAN-17 G1 replay: a month with no loan movements → each member's Debit cell equals 1% of their start-of-month balance

### Exits (S-EXIT)

- S-EXIT-01 Request exit → 30 days → automatic payout = shares × NAV − dues
- S-EXIT-02 Exit with an open loan → blocked
- S-EXIT-03 **Bank run:** 50% of members request exit the same day → queue, reserve respected, paid in order from inflows
- S-EXIT-04 Chainlink Automation is down for a week → member/anyone triggers `processExits()`, same result
- S-EXIT-05 Exiting member is a contract wallet that reverts on receive → queue not blocked, funds claimable via pull
- S-EXIT-06 Exiting member is a contract that re-enters on receive → no double payout
- S-EXIT-07 NAV changes during the notice period (interest arrives) → payout uses the snapshot at the end of notice
- S-EXIT-08 Member cancels exit during notice → restored to normal
- S-EXIT-09 Last member exits → vault empties cleanly, no dust stuck

### Governance (S-GOV)

- S-GOV-01 Rule change passes → applies from the next period, not retroactively
- S-GOV-02 Timelock: a passed change can't execute early
- S-GOV-03 Proposal spam by one member → rate limited
- S-GOV-04 Fee waiver vote passes → fee removed, NAV adjusted correctly

### Math and time (S-MATH)

- S-MATH-01 First depositor deposits 1 wei then donates to inflate share price → later members not robbed (virtual shares)
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

## Gates in CI

- All scenarios and invariants pass (invariant runs ≥ 256 runs × depth 100 on PRs, deeper nightly)
- Branch coverage ≥ 95% on `packages/contracts/src` money paths
- No new Slither high/medium findings
- Gas snapshot diff reviewed

## Red-team scenarios

From [`redteam/2026-11-plan-redteam.md`](redteam/2026-11-plan-redteam.md). Each ID names the finding it covers.

- S-RT-01 (RT-01) Circle page with `?id=` of a contract not created by the factory → "This isn't a WealthKart circle", no Pay or Holiday button, no tx possible
- S-RT-02 (RT-01, RT-27) Join page for a non-factory address → no rules shown, verified-circle line absent; for a real circle → "Verified WealthKart circle" with Snowtrace link
- S-RT-03 (RT-02) Creator lists 3 other founders → they are invited, not members; `memberCount` = 1 and they don't count in quorum until each calls `acceptInvite()`
- S-RT-04 (RT-02) Founder invite not accepted within 14 days → expires; the circle never appears in that wallet's `circlesOf`
- S-RT-05 (RT-03) Member admitted today votes on a loan proposal created yesterday → rejected (snapshot); can't vote at all until N installments paid
- S-RT-06 (RT-03) Admission vote with 60% yes when the pass mark is 66% → fails; one member with more than a third of open invites → warning shown on the request
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
- S-RT-18 (RT-11) Dormancy proposal for a member with fewer than N missed periods → rejected; dormant member pays or votes → dormancy cleared
- S-RT-19 (RT-12) Proposal to lower the reserve or raise k / exit fee / notice / fees → needs 66% and a 14-day delay; a lower-risk change keeps the normal pass mark
- S-RT-20 (RT-12) Member rage-quits during the delay → exit uses the old notice and fee even after the change takes effect
- S-RT-21 (RT-13) Migration proposal targeting an address not created by a registered factory → can't be created
- S-RT-22 (RT-14) Guardian pauses deposits over the due day → no late fees for paused days; second pause within 30 days → reverts; exits still process during a pause
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
