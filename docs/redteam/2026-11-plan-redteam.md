# Red-team review: PLAN.md, ADRs 0001–0027 and the Phase 1 contracts

Date: 2026-11-14. Reviewed: `PLAN.md`, `docs/decisions/0001`–`0027`, `packages/contracts/src` (`CircleVault`, `CircleFactory`, `FeeMath`, `PeriodMath`, `SharesMath`) at commit `807004f`.

## How to read this

We attacked the design the way a bad actor inside or near a friend circle would. That means a member with spare wallets, a borrower planning to walk away, a creator setting traps, an outsider with a fake link, and a company that might one day be seen as running a deposit scheme. Each finding has an ID (`RT-xx`), and the same fields:

- **Severity**: Critical (money can be taken or locked with little effort), High (real damage, and the attacker comes out ahead), Medium (limited damage, or needs special conditions), Low (hard to pull off, or minor).
- **Likelihood** in a real friend circle: High, Medium or Low. Friend circles are small and social, and that cuts both ways. Strangers rarely attack, but one member who falls out with the group knows exactly who isn't paying attention.
- **Scenario**: what the attacker does, step by step.
- **Impact**: who loses what.
- **Fix**: the concrete change.
- **Needs**: whether it changes PLAN.md, needs a new ADR (never an edit of an accepted one), or only needs a test. Test IDs `S-RT-xx` are listed at the end of `docs/testing.md`.

The contracts as they stand are tight for what they do: exact-amount payments, internal accounting, virtual shares, no plain transfers, mainnet blocked. Most of the risk is in what comes next: membership, votes, loans and exits. The design choices there decide whether one bad member can hurt everyone else.

---

## Must fix before Phase 1 membership ships

These belong to the join flow, member votes and display names being built now. They are cheapest to fix before the code exists.

### RT-01. Fake circles: the app trusts any address in `?id=`

- **Severity:** High. **Likelihood:** Medium.
- **Scenario:** an attacker deploys their own contract with the same function names as `CircleVault` (`name`, `amountDue`, `contribute`), where `contribute()` forwards the money to the attacker. They send a WhatsApp invite link `.../app/circle/?id=<fake>`. The app only checks that `name()` answers, so it renders the fake as a real circle with a real-looking Pay button.
- **Impact:** members pay installments straight to the attacker. Core shows the call as an ordinary contract interaction.
- **Fix:** add `mapping(address => bool) public isCircle` to `CircleFactory`, set in `createCircle`. In `useCircle` / `parseCircleId`, read `isCircle(id)` from the factory for the current chain before anything else. If it's false, show "This isn't a WealthKart circle" and disable every write. The join page must do the same check before showing rules. Future factory versions keep an on-chain list of past factories (see RT-13), so old circles still verify.
- **Needs:** contract change (factory) + web change + tests S-RT-01, S-RT-02.

### RT-02. Ghost founders: the creator can add anyone, including their own spare wallets, with no consent and no vote

- **Severity:** High. **Likelihood:** Medium.
- **Scenario:** `createCircle(cfg, founders)` makes every address in `founders` an active member straight away, up to 200 of them. A creator can:
  1. list five spare wallets of their own, so they control most votes from day one;
  2. list real friends who never agreed, so these "members" count toward quorum but never vote, and nothing can pass without the creator's spares;
  3. list strangers, so a circle named "WealthKart refund desk" appears in their portfolio through `circlesOf` (phishing).
- **Impact:** one person controls admission, loan and rule votes from the start, bypassing the "existing members approve by vote" promise in PLAN.md §2.4. Ghosts break quorum math for every later vote.
- **Fix:** founders other than the creator start as **invited**, not active. Each must call `acceptInvite()` from their own wallet to become a member. Until then they don't count in `memberCount`, quorum or `circlesOf`, and they can't be voted for or against. The factory registers a circle under a wallet only when that wallet accepts (the vault calls back to the factory, which checks `isCircle[msg.sender]`). Invites expire after 14 days. This also removes the 200-address loop's spam value.
- **Needs:** plan change (D2: "founders accept"), new ADR "Founders must accept; membership counted only after acceptance", tests S-RT-03, S-RT-04.

### RT-03. Sybil wallets voted in one at a time

- **Severity:** High. **Likelihood:** Medium.
- **Scenario:** an invite-only circle still lets any member invite. A member invites their own second and third wallets under friendly names ("Comet_K's brother"). With 50% quorum in a 6-person circle, two Sybils plus their owner are half the circle. Once their bloc is the majority, they approve loans to each other and pass rule changes.
- **Impact:** a voting bloc that drains through loans (bounded by the caps in RT-09) or changes rules (rage-quit is the only defence, see RT-12).
- **Fix:** none of these stop a determined person with friends' trust, but together they make it slow and visible:
  1. New members get **no vote until they have paid N installments** (default 2, circle setting 0–6). They're shown as "joining" in the members table.
  2. **Snapshot voting:** each proposal stores the member count and eligible voters (a `joinedAt` / `votingSince` stamp per member) when it is created. Members who become eligible later can't vote on it.
  3. **Admission needs a higher bar** than a loan: default 66% yes, with quorum counted on eligible voters.
  4. Each join request shows who invited the wallet and how many invites that member has open, plus a warning when one member has invited more than a third of the circle.
  5. **One open invite per member at a time** (circle setting).
- **Needs:** plan change (D2, D4c), new ADR "Voting eligibility and snapshots", tests S-RT-05, S-RT-06.

### RT-04. Invite codes can be front-run or leaked

- **Severity:** Medium. **Likelihood:** Medium.
- **Scenario:** if an invite is a secret code checked on-chain (`keccak256(code) == stored`), the code shows up in plain text in the pending `requestJoin(code)` transaction. Anyone watching the public mempool, or anyone the link was forwarded to, can submit their own request first. A single-use code is then spent on the attacker. A multi-use code lets the whole group chat's contacts flood the circle with requests.
- **Impact:** an honest invitee is locked out until someone issues a new invite (griefing), or join requests are spammed (see RT-05). The vote still blocks unknown wallets, so this isn't theft.
- **Fix:** bind each invite to the invitee's address. The flow is:
  1. The invitee opens the link, connects, and the app shows their address.
  2. The inviting member's app calls `invite(invitee, expiry)`, or signs an EIP-712 invite over `(circle, invitee, expiry, nonce, chainId)`.
  3. `requestJoin` checks `msg.sender == invitee`.

  If one-tap links matter more, keep a code but treat it only as a spam filter. Make it multi-use within a cap (e.g. 5 requests), expiring (7 days) and revocable, and keep the vote as the real gate. Never put anything secret in the URL path; `#fragment` keeps the code out of server logs.

- **Needs:** ADR (part of the membership ADR), tests S-RT-07.

### RT-05. Join-request and proposal spam

- **Severity:** Medium. **Likelihood:** Low (higher if codes leak).
- **Scenario:** one wallet, or many cheap wallets, opens hundreds of join requests or proposals. Each adds storage and an item on every member's Votes page. A member can also open many proposals to tire people out and slip one through on a quiet weekend.
- **Impact:** voter fatigue, unreadable UI, pagination on lists that never shrink. A gas cost on the attacker's side only, and that cost is tiny on C-Chain.
- **Fix:** at most one pending join request per address per circle. Requests expire after the voting window plus 7 days, and expired ones drop out of the "open" index. Keep open requests in a swap-and-pop array so reads stay bounded (ADR 0015). Cap open proposals per member (e.g. 2) and per circle (e.g. 20). Never iterate requests in a write path.
- **Needs:** test S-RT-08.

### RT-06. Display-name impersonation (look-alike characters, name recycling)

- **Severity:** Medium. **Likelihood:** Medium.
- **Scenario:**
  1. **Look-alikes:** "Rahul" written with a Cyrillic "а" passes a byte-level uniqueness check. Zero-width spaces, right-to-left override marks and trailing spaces give the same trick.
  2. **Name recycling:** Comet_K renames themselves, and two minutes later another member takes "Comet_K" and asks the group to approve "my" emergency loan to a new address.
  3. **Case games:** "nightowl" vs "NightOwl".
  4. **Join requests:** a request names itself after a member who just exited.
- **Impact:** votes cast for the wrong person; social-engineering loans.
- **Fix:**
  - Allow only `[A-Za-z0-9_.-]` and single inner spaces, 3–20 characters, no leading or trailing space.
  - Check uniqueness on a **lowercased key** (`keccak256(lower(name))`).
  - A released name stays **reserved for its last owner for the cooldown** (30 days).
  - Names of exited members stay reserved for 90 days.
  - The UI always shows the address-based avatar and a short address next to every name, and a "renamed 3 days ago" badge.
  - For join requests, check the name when the request is made **and again when it's approved**. If it's taken by then, admit the member with a placeholder ("member-4f2a") and ask them to pick a name, rather than reverting the vote (a revert would leave the approved request stuck).
- **Needs:** plan change (D3b tightens to ASCII), membership ADR, tests S-RT-09, S-RT-10.

### RT-07. Members who don't pay keep voting

- **Severity:** Medium. **Likelihood:** Medium.
- **Scenario:** late fees are capped at fee1 + fee2 per period, and nothing else changes when a member stops paying. A member 5 months behind still votes on loans and rule changes, and still counts toward quorum.
- **Impact:** people with no money at stake decide how everyone else's money is lent. Quorum gets harder to reach, because absent non-payers sit in the denominator.
- **Fix:** voting eligibility requires being **at most 1 period behind** (`nextPeriod >= currentPeriod - 1`). Members further behind don't count in quorum for proposals created while they're behind. They get their vote back the moment they catch up. Dormant members (ADR 0010) are excluded the same way.
- **Needs:** voting ADR (with RT-03), test S-RT-11.

### RT-08. Late joiners buy in below fair value (lazy interest not in NAV)

- **Severity:** High once loans exist. **Likelihood:** Medium.
- **Scenario:** interest is computed lazily and booked into `totalAssets` only when the borrower pays (ADR 0006, D4). Say a borrower owes 6 months of interest (2.4 AVAX) and has paid none of it. Someone who knows the borrower is about to pay gets themselves admitted and pays their first installment at the current NAV, which leaves that 2.4 AVAX out. The borrower pays, NAV jumps, and the newcomer owns part of interest earned before they arrived. A member can do the same by timing a late installment just before a big repayment.
- **Impact:** a quiet transfer of value from long-standing members to well-timed joiners. It grows with outstanding interest. In G1's scale, that is ₹8.65L of interest over the years.
- **The reverse:** joining just before a defaulted loan is written off means buying in at an inflated NAV. The joiner loses.
- **Fix:**
  - Keep `accruedInterest` as an O(1) running total, updated per loan when that loan is touched and per period with a global rate accumulator. Count it in the NAV used for **minting and burning** shares.
  - Loans past due by more than one period count at a **haircut** (impaired value) in that NAV.
  - The join page shows "loans in default" and "interest not yet paid" before anyone joins.
  - `packages/rules` should model accrued-interest NAV so the G1 replay checks it.
- **Needs:** plan change (D2 NAV definition), new ADR "NAV includes accrued interest and impairs overdue loans", tests S-RT-12, S-RT-13.

### RT-09. Re-joining and first-period edge cases

- **Severity:** Medium. **Likelihood:** Medium.
- **Scenario:**
  1. A member who exited is re-admitted with the same address. The current `Member` struct would keep stale `shares`, `nextPeriod`, `holidaysUsed` for the year and `holidayFor`. `_memberList` would get a duplicate entry.
  2. A member admitted on the 25th, after the due day, gets `nextPeriod = current` and immediately owes fee1 + fee2 for a month they weren't in.
  3. Two approvals finalise in the same block and push the circle past `maxMembers`.
- **Impact:** wrong balances, unfair fees, broken limits.
- **Fix:**
  1. On exit, delete the member record except an `everJoined` flag. On re-join, start fresh and don't push a duplicate to `_memberList`; keep an index mapping instead.
  2. If admission happens after that period's due moment, the first period owed is the **next** one.
  3. Check `maxMembers` (and the "eligible member" count) inside `finalize`, not only at request time.
- **Needs:** tests S-RT-14, S-RT-15, S-RT-16.

---

## Governance and voting

### RT-10. Early finalisation and last-minute swings

- **Severity:** Medium. **Likelihood:** Medium.
- **Scenario:** if a vote can be finalised as soon as yes passes quorum and majority, a bloc votes in the first minutes and finalises before anyone else wakes up. A loan is then disbursed on the spot (D4c step 4). The reverse also happens: a bloc waits until the last minute to flip the result, when others can no longer react.
- **Impact:** decisions made by whoever is online, which defeats the voting window.
- **Fix:** finalisation is allowed only **after the window ends**, unless the result can no longer change: every eligible voter has voted, or yes already exceeds half of all eligible voters and the proposal type allows early finish. Loans and admissions are never early. Votes can be changed until the window closes.
- **Needs:** voting ADR, test S-RT-17.

### RT-11. Quorum shrinking through dormancy votes

- **Severity:** Medium. **Likelihood:** Low.
- **Scenario:** quorum counts active members. A bloc votes honest members who are merely travelling "dormant" (ADR 0010), which shrinks the denominator. Then it passes loans with fewer votes.
- **Impact:** a minority bloc gains effective control.
- **Fix:** a dormancy proposal is valid only if the contract itself sees **N missed periods** (`currentPeriod - nextPeriod >= missedMonthsBeforeDormant`). Any payment or vote from the wallet clears dormancy automatically. A dormant member's next payment covers only the current period (dues stopped while dormant, per ADR 0010).
- **Needs:** test S-RT-18. A small plan note in D2.
- **Status (2026-11-15):** fixed by ADR 0032 (contract checks N missed installments; paying clears dormancy and covers only the current month). Deliberate change: a vote does not clear dormancy, because counting a vote from someone outside the quorum snapshot would break it; `wake()` is the one-tap alternative.

### RT-12. Rule changes and rage-quit without reminders

- **Severity:** High. **Likelihood:** Medium.
- **Scenario:** a majority votes a change that is legal under the bounds but hostile:
  - reserve to 0%, max loan to 100%, k to 10;
  - exit notice to 90 days, exit fee to 10%;
  - fee1 raised a lot.

  ADR 0019 gives dissenters 7 days to rage-quit, but reminders are Phase 4 (D6), so no one is told. Members who don't open the app that week are trapped under the new rules.

- **Impact:** the rage-quit right exists on paper only. With hostile loan settings, a majority can lend most of the fund to itself.
- **Fix:**
  - Classify parameters. "Risky" changes need the **dissolution pass mark (66%)** and a **14-day** delay: lowering the reserve, raising max-loan / k / exit fee / notice, raising fees, turning guarantors off.
  - Move a minimal **governance alert** forward from Phase 4 to Phase 2: Web Push keyed by wallet, only for proposals that affect money rules.
  - Until push exists, the app shows a blocking banner on every circle page while a rule change is pending.
  - Rage-quit exits keep the **old parameters for the full notice period**: snapshot the parameters per exit.
- **Needs:** new ADR "Risky parameter changes need a supermajority and a longer delay", plan change (Phase 2 scope), tests S-RT-19, S-RT-20.

### RT-13. Migration vote to a hostile contract

- **Severity:** Critical once migration exists. **Likelihood:** Low.
- **Scenario:** ADR 0020 lets a circle "vote to migrate" funds and member state to a new contract version. If the target is any address in the proposal, a majority bloc proposes its own contract, waits out the delay, and moves the whole vault there.
- **Impact:** every member who missed the rage-quit window loses everything.
- **Fix:** a migration target must be a circle created by a factory listed in an on-chain **`FactoryRegistry`**. Entries are added only by the founder multisig behind a 30-day timelock, and can never be removed or edited. Migration also needs 66% and the 14-day delay (RT-12). Members who didn't vote yes are paid out at NAV, not moved.
- **Needs:** new ADR "Migration targets come only from the factory registry", test S-RT-21 (when migration is built).

### RT-14. Guardian pause abuse

- **Severity:** Medium. **Likelihood:** Low.
- **Scenario:** ADR 0020's guardian can pause new deposits for 14 days. Pausing over the due date blocks payments, and unless fees also pause, everyone gets fee1 and fee2. Re-pausing right after a pause ends extends the 14-day limit forever. A compromised multisig key could do this to every circle at once.
- **Impact:** unfair fees for everyone; a never-ending freeze of new loans.
- **Fix:** while deposits are paused, late fees don't accrue (pause time pushes back due moments). After a pause ends, the guardian can't pause again for 30 days. Every pause emits an event with a reason code, and the UI shows it. `processExits` and claims never check the pause flag (already in the ADR, so add a test).
- **Needs:** test S-RT-22. A note in the next guardian ADR.

---

## Loans and guarantees

### RT-15. Collusive borrow-and-walk inside the k-cap

- **Severity:** High. **Likelihood:** Medium.
- **Scenario:** with k = 2 (ADR 0018), A and B each have a stake of 2 AVAX. A guarantees B. B borrows 2 × (2 + 2) = 8 AVAX, the circle approves because they're friends, then both stop paying. At default, B's 2 and A's 2 are frozen and later used. The circle recovers 4 of 8 AVAX. A and B net +4 AVAX from everyone else.
- **Impact:** a built-in profit for any pair willing to burn their friendships. It's worse in young circles, where stakes are small and the 40% fund cap is the only limit.
- **Fix:**
  - **k scales with tenure and payment history:** k = 1 for the first 6 paid periods, then rising to the circle's k.
  - Cap any one loan at the circle's rule-13 limit, computed on **cash and loans excluding the borrower's own stake**.
  - Show the expected recovery ("if this loan defaults, the circle gets back 4 of 8 AVAX") on the vote screen.
  - Keep the fund-wide 40% cap. Also add a per-circle limit on the **share of outstanding loans backed by one guarantor** (e.g. 25%).
- **Needs:** new ADR superseding the k default in 0018 ("k ramps with tenure"), plan change (rule table), tests S-RT-23.

### RT-16. One guarantee stake backing many loans

- **Severity:** High. **Likelihood:** Medium.
- **Scenario:** if the guarantor's stake isn't locked per guarantee, A's stake of 3 AVAX "backs" loans for B, C and D at the same time, each counting A's 3 AVAX toward its k-cap.
- **Impact:** the collateral gets counted three times; the cap means nothing.
- **Fix:** keep `lockedShares` per member. A guarantee locks shares worth the guaranteed amount ÷ k at the current NAV, and sum(locked) ≤ the member's shares. Locked shares can't back another loan, can't be exited, and unlock pro-rata as the loan is repaid. The same applies to the borrower's own stake.
- **Needs:** plan detail in D4c, test S-RT-24.

### RT-17. Lending out the cash exiters are waiting for

- **Severity:** High. **Likelihood:** Medium.
- **Scenario:** ADR 0008 queues exits when free cash is short. A bloc keeps approving loans to itself, so cash never builds up. Queued exiters wait for months while new contributions go out as loans before they reach the queue.
- **Impact:** exits become hostage to the majority, so members can't leave.
- **Fix:** **no new loan disbursal while the exit queue is non-empty.** Incoming installments and repayments go to the queue first (already in ADR 0008; make it a hard check in `finalizeLoan`). The reserve can be used for exits after the notice ends. Say so explicitly, because otherwise the reserve sits idle while people wait.
- **Needs:** plan clarification in D2 (reserve usable for exits), test S-RT-25.

### RT-18. Exit before the loss shows up in NAV

- **Severity:** High. **Likelihood:** High (people talk).
- **Scenario:** members hear that a borrower lost their job. The loan is one month late, which isn't a default yet (that takes 2 months). Informed members request exit. Their NAV snapshot at day 30 still counts the loan at full value, so the loss lands on everyone who stays.
- **Impact:** a classic run: the first to leave are paid in full and the loyal members eat the loss.
- **Fix:** at the exit snapshot, overdue loans count at a haircut (1 month late: 25%, 2+ months or default: 100%, circle setting within bounds). The exiter's share of the haircut is **held back** as a claim and paid later, as and when those loans recover. That keeps the exit fair both ways.
- **Needs:** new ADR (pairs with RT-08: one "impaired loans" policy for joins and exits), tests S-RT-26.

### RT-19. Medical-loan and holiday gaming

- **Severity:** Low. **Likelihood:** Medium.
- **Scenario:** rule 18 gives 3 interest-free months with a 24-hour vote. Members label routine loans "medical" to skip interest, and the short window catches people asleep. Separately, a member uses all 3 holidays back to back across a year boundary (Nov, Dec, Jan) to delay four installments with no fees.
- **Impact:** small interest losses; holidays are allowed by design (ADR 0017).
- **Fix:**
  - Medical loans: once per member per 12 months (already planned), a separate cap, the normal quorum, and a minimum 12-hour window. The vote screen shows the borrower's past medical loans.
  - Holidays: count them over a **rolling 12 months** instead of the calendar year, if the circle wants (a setting). Otherwise accept and document.
- **Needs:** test S-RT-27.

---

## Exits, payouts and automation

### RT-20. One bad recipient blocks the exit queue

- **Severity:** High. **Likelihood:** Low.
- **Scenario:** `processExits()` pushes AVAX to each exiting member in a batch. A member whose wallet is a contract that reverts on receive (on purpose, or a multisig with a broken fallback), or that burns all gas, makes the whole batch revert every time.
- **Impact:** nobody behind them in the queue is paid. Chainlink Automation keeps failing and burning LINK.
- **Fix:**
  - Each exit is processed independently.
  - Send with a fixed gas stipend (e.g. 50k) and limit the returned data copied back, to avoid return bombs.
  - **If the send fails, credit `pendingWithdrawals[member]`** and move on. The member pulls later with `withdraw()`.
  - Never revert the batch because of one recipient.
- **Needs:** plan detail in D2, tests S-RT-28.

### RT-21. Chainlink Automation stops (unfunded upkeep, outage)

- **Severity:** Medium. **Likelihood:** Medium. Upkeeps run out of LINK all the time.
- **Scenario:** nobody tops up the upkeep, or Chainlink has an outage, so exits aren't paid on time. If the upkeep is funded from a company wallet, the company becomes an operational dependency, against the "never holds funds" stance.
- **Impact:** late payouts and support load; the "auto-paid" promise is broken.
- **Fix:**
  - `processExit(member)` callable by anyone once the notice has ended. The app shows the exiting member a "Collect now" button after day N.
  - Gas cost is the caller's.
  - Monitor upkeep balance and alert (Phase 3 monitoring item).
  - Never make correctness depend on the keeper. The UI copy says "usually paid automatically within a day; you can collect it yourself any time after".
- **Needs:** plan wording (D2 step 3), test S-RT-29.

### RT-22. Nominee claim hijack

- **Severity:** Medium. **Likelihood:** Low.
- **Scenario:** a member's nominee is also in the circle. The nominee and friends mark the member dormant after 3 missed months (the member is ill or travelling) and vote the claim through. The member can cancel during the notice period only if they hear about it, and there are no reminders before Phase 4.
- **Impact:** the payout goes to the nominee while the member is alive.
- **Fix:**
  - The nominee claim notice period is **at least 60 days** and never shorter than the exit notice.
  - Any transaction from the member's wallet cancels the claim automatically: a payment, a vote, or a simple `ping()`.
  - The nominee can't vote on their own claim.
  - The claim proposal is shown as a blocking banner to every member.
- **Needs:** new ADR superseding the notice detail in 0016, test S-RT-30.

---

## Time and deadlines

### RT-23. Paying in the last seconds before a UTC deadline

- **Severity:** Low. **Likelihood:** High (honest users).
- **Scenario:** a member sends the transaction at 23:59:55 UTC on the due day. It lands in a block stamped 00:00:01 the next day, so the exact-amount check fails with `WrongAmount`, or fees apply. Block timestamps can drift a few seconds. Anyone who controls when the transaction is included can push an honest payment over the line, though there's little reason to.
- **Impact:** a reverted payment and a surprise fee; support complaints.
- **Fix:** the UI turns amber at 2 hours left and red at 15 minutes, and below 10 minutes it **includes fee1 in the amount** with a note ("if this lands after the deadline, the late fee is included"). The contract accepts `msg.value` between the expected amount and the expected amount + fee1 only in the first hour after the deadline and refunds the difference (a pull credit). Or keep it exact and have the app re-quote and retry once. Pick one, record it in an ADR, and test it.
- **Needs:** small ADR, test S-RT-31.

### RT-24. Changing the voting or due-day rules mid-period

- **Severity:** Low. **Likelihood:** Low.
- **Scenario:** a rule change moving the due day from 10 to 5 is applied in the middle of a month, so members who planned to pay on the 8th are suddenly late.
- **Impact:** unfair fees.
- **Fix:** ADR 0019 already says changes apply from the next period. Enforce it in the contract by storing `effectiveFromPeriod` and reading parameters per period. A change can never apply to a period that has already started.
- **Needs:** test S-RT-32.

---

## Creator traps and circle settings

### RT-25. Trap settings at creation (huge fees, no upper bounds)

- **Severity:** Medium. **Likelihood:** Low.
- **Scenario:** the ADR 0022 table sets fees at "≥ 0" with no maximum, and the contracts store `uint128`. A creator sets fee1 = 100 AVAX on a 0.5 AVAX installment. Invitees skim the join page, join, miss one day, and owe 100 AVAX. Contracts are immutable, so the trap is permanent.
- **Impact:** a circle built to confiscate.
- **Fix:** add upper bounds: each late fee ≤ 50% of the installment; interest late fee ≤ 10 × the base fee; exit fee ≤ 10% (already). Enforce them in the constructor. The join page highlights any setting more than 2× G1's defaults, in plain words.
- **Needs:** new ADR "Upper bounds on fees" (amends the 0022 table by superseding the fee rows), plan table update, test S-RT-33.

### RT-26. Circle names used for phishing

- **Severity:** Low. **Likelihood:** Medium.
- **Scenario:** a circle is named "Claim refund: wealthkart-help.app" or "Core Support". The name shows in portfolios and in the switcher (and a ghost founder sees it without consent, RT-02).
- **Impact:** social-engineering bait inside our own UI.
- **Fix:** restrict circle names to the same safe character set as display names plus spaces. Reject anything containing `://`, `www.` or a dot followed by letters (a domain pattern) in the UI validator and the contract. RT-02's acceptance step stops unwanted circles from appearing at all.
- **Needs:** test S-RT-34.

### RT-27. Invite links leading to a look-alike site

- **Severity:** Medium. **Likelihood:** Medium.
- **Scenario:** a fake site at `wealthkart-app.pages.dev` copies the UI and asks the user to "verify your wallet" by signing a message, or to pay into a fake circle. The real app's links all go through WhatsApp, so a forwarded fake link looks normal.
- **Impact:** stolen installments. Seed-phrase theft if the fake site asks for it.
- **Fix:**
  - Publish one canonical domain and list it in Core's dapp list if possible.
  - The app never asks for signatures except transactions, and never for a seed phrase. Say so on every join page and in `llms.txt`.
  - The join page shows the circle's factory check (RT-01) as a visible "Verified WealthKart circle" line, with the Snowtrace link.
  - Use a **custom domain** before mainnet, not `*.pages.dev`, because anyone can register a look-alike `*.pages.dev` subdomain.
- **Needs:** plan item (Phase 3: custom domain), test S-RT-02.

---

## Legal and regulatory (India)

None of these is a code bug, but any one can end the product. Each needs the lawyer review planned before mainnet; these are the questions to bring.

### RT-28. Unregulated deposit scheme (BUDS Act 2019)

- **Severity:** High. **Likelihood:** Medium.
- **Scenario:** the Banning of Unregulated Deposit Schemes Act bans taking "deposits" with a promise of return unless the scheme falls under a listed exemption. A circle collects money every month and pays it back later with gains. A complaint from one unhappy member could describe exactly that. The company's role (building the factory, hosting the app, a reputation SBT, marketing pages) could be read as "promoting" it.
- **Impact:** criminal liability for promoters; the app is shut down.
- **Fix:**
  - Keep the stance: no advertised returns (already enforced by the copy test S-WEB-20), no company custody, private circles only.
  - Ask the lawyer specifically whether a member-run, member-governed pool with no promised return is a "deposit" under BUDS Section 2(4), and whether the "contributions from relatives" or "amounts received in the course of business" exemptions help.
  - Consider a per-circle member cap (e.g. 50) as a default to keep circles visibly private.
- **Needs:** plan risk table update, legal question list.

### RT-29. Money-lending licences and interest caps (state laws)

- **Severity:** Medium. **Likelihood:** Low.
- **Scenario:** state money-lending acts (for example Maharashtra's Money-Lending (Regulation) Act, 2014) require a licence to lend at interest as a business and cap interest. A circle lending regularly at 1–2% a month (12–24% a year) could be called a moneylender, and the 2% step-up rate may exceed some state caps.
- **Impact:** loans are unenforceable; penalties for members.
- **Fix:** ask the lawyer whether lending only to members of a closed group is outside "business of money-lending". Keep the interest bounds (0–5% a month) under review; consider a 2% a month hard cap.
- **Needs:** legal question list, possibly an ADR tightening the rate bound.

### RT-30. Crypto tax: 1% TDS and 30% tax on each transfer

- **Severity:** Medium. **Likelihood:** High (applies to everyone).
- **Scenario:** Section 194S requires 1% TDS when someone pays consideration for a transfer of a virtual digital asset. If contributing AVAX in return for vault shares, or receiving an exit payout in AVAX, is treated as a "transfer", then someone has to deduct and file TDS. A smart contract can't do that. Gains on exit are taxed at 30%, with no loss set-off.
- **Impact:** members break tax rules unknowingly; the product's reputation suffers.
- **Fix:** ask the lawyer and a CA for a written opinion on whether contribution, loan and exit are VDA transfers. Ship the CSV export (Phase 3) early with a per-transaction INR value at the time. Write "you're responsible for your own crypto tax" plainly in onboarding and the FAQ (no tax advice).
- **Needs:** plan risk table update; FAQ copy.

### RT-31. FEMA: members living abroad

- **Severity:** Medium. **Likelihood:** Medium (Indian friend groups often include NRIs).
- **Scenario:** a resident lends to a non-resident member, or the reverse, through the circle. FEMA restricts lending between residents and non-residents, and crypto's status under FEMA is unclear.
- **Impact:** a breach of foreign-exchange rules for the members involved.
- **Fix:** add a FEMA question to the legal review. Until answered, onboarding asks members to confirm they're residents of the same country as the circle (a self-declaration checkbox in the app; nothing stored).
- **Needs:** legal question list; onboarding copy.

### RT-32. FIU-IND registration as a VDA service provider

- **Severity:** Medium. **Likelihood:** Low.
- **Scenario:** since March 2023, entities that hold or exchange virtual digital assets for others must register with FIU-IND under PMLA. A non-custodial app that only provides software may be outside this. But the guardian pause, a Chainlink upkeep the company funds, and a "WealthKart" brand on every circle blur that line.
- **Impact:** registration duties, KYC obligations (which clash with zero personal data).
- **Fix:** keep the company out of every money path: no fee collection, no upkeep paid from company funds that touch circle money, and the guardian can't move funds (ADR 0020 already says so). Ask the lawyer for a written view.
- **Needs:** legal question list.

---

## Priority matrix

| ID    | Title                             | Severity | Fix effort | When                         |
| ----- | --------------------------------- | -------- | ---------- | ---------------------------- |
| RT-01 | Fake circles via `?id=`           | High     | Low        | **Now** (before Fuji launch) |
| RT-02 | Ghost founders                    | High     | Medium     | **Phase 1 membership**       |
| RT-03 | Sybil wallets voted in            | High     | Medium     | **Phase 1 membership**       |
| RT-08 | Late joiners and lazy interest    | High     | Medium     | Phase 1 design, Phase 2 code |
| RT-06 | Display-name impersonation        | Medium   | Low        | **Phase 1 membership**       |
| RT-04 | Invite front-run / leak           | Medium   | Low        | **Phase 1 membership**       |
| RT-05 | Request and proposal spam         | Medium   | Low        | **Phase 1 membership**       |
| RT-07 | Non-payers keep voting            | Medium   | Low        | **Phase 1 membership**       |
| RT-09 | Re-join and first-period edges    | Medium   | Low        | **Phase 1 membership**       |
| RT-25 | Trap fee settings                 | Medium   | Low        | **Phase 1**                  |
| RT-26 | Phishing circle names             | Low      | Low        | Phase 1                      |
| RT-10 | Early finalisation                | Medium   | Low        | Phase 1 (admission votes)    |
| RT-11 | Quorum shrinking via dormancy     | Medium   | Low        | Phase 1 (dormant vote)       |
| RT-15 | Borrow-and-walk inside k-cap      | High     | Medium     | Phase 2                      |
| RT-16 | Guarantee counted many times      | High     | Low        | Phase 2                      |
| RT-17 | Loans starve the exit queue       | High     | Low        | Phase 2                      |
| RT-18 | Exit before loss shows up         | High     | Medium     | Phase 2                      |
| RT-20 | Bad recipient blocks exits        | High     | Low        | Phase 2                      |
| RT-12 | Hostile rule change, no reminders | High     | Medium     | Phase 2                      |
| RT-21 | Automation stops                  | Medium   | Low        | Phase 2                      |
| RT-22 | Nominee claim hijack              | Medium   | Low        | Phase 2                      |
| RT-14 | Guardian pause abuse              | Medium   | Low        | Phase 2                      |
| RT-19 | Medical / holiday gaming          | Low      | Low        | Phase 2                      |
| RT-23 | Last-second payments              | Low      | Low        | Phase 1 (UI), Phase 2 (ADR)  |
| RT-24 | Mid-period rule changes           | Low      | Low        | Phase 2                      |
| RT-13 | Hostile migration target          | Critical | Medium     | Before migration exists      |
| RT-27 | Look-alike domains                | Medium   | Low        | Phase 3 (custom domain)      |
| RT-28 | BUDS Act                          | High     | n/a        | Lawyer, before mainnet       |
| RT-29 | Money-lending laws                | Medium   | n/a        | Lawyer                       |
| RT-30 | 1% TDS / 30% tax                  | Medium   | n/a        | Lawyer + CA                  |
| RT-31 | FEMA and NRI members              | Medium   | n/a        | Lawyer                       |
| RT-32 | FIU-IND registration              | Medium   | n/a        | Lawyer                       |

## Launch-blocker checklist

Before Phase 1 membership ships on Fuji:

- [ ] RT-01: `CircleFactory.isCircle` and an app-side check on every circle page and the join page
- [ ] RT-02: founders accept before they count; `circlesOf` only after acceptance
- [ ] RT-03: voting needs N paid installments; proposals snapshot eligible voters; admission at 66%
- [ ] RT-04: invites bound to the invitee address (or a capped, expiring code that is only a spam filter)
- [ ] RT-05: one pending request per address; requests and proposals expire and are capped
- [ ] RT-06: ASCII names, lowercase uniqueness, names reserved after rename/exit, re-check at approval
- [ ] RT-07: members more than one period behind can't vote and don't count in quorum
- [ ] RT-09: clean re-join, no fees for a join period whose due day has passed, `maxMembers` checked at finalise
- [ ] RT-25: upper bounds on late fees in the constructor

Before Phase 2 (loans, exits) ships:

- [ ] RT-08 and RT-18: one impaired-loan and accrued-interest NAV policy (ADR), used for joins and exits
- [ ] RT-15 and RT-16: k ramps with tenure; per-guarantee share locks
- [ ] RT-17: no loans while exits are queued; reserve usable for exits
- [ ] RT-20 and RT-21: per-exit processing, pull fallback, "Collect now" after notice
- [ ] RT-12: risky changes at 66% with a 14-day delay; minimum governance alert moved before Phase 4

Before mainnet:

- [ ] RT-13: factory registry for migration targets
- [ ] RT-27: custom domain
- [ ] RT-28 to RT-32: legal opinions in writing

## What we didn't find

To save the next reviewer time, these checks came back clean in the current contracts:

- **Reentrancy:** `contribute()` is `nonReentrant` and makes no external call.
- **Forced AVAX:** `selfdestruct` or coinbase transfers change `address(this).balance` but not `totalAssets`, so NAV can't be moved.
- **First-depositor inflation:** blocked by the virtual offsets in `SharesMath`.
- **Exact-amount rule:** no overpayment or advance payment is possible.
- **Overflow:** `SafeCast` is used on every narrowing, and periods fit in `uint32` for millions of years.
- **Funds locked on mainnet:** blocked by the chain-id check until exits exist.
