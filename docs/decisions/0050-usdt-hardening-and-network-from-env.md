# 0050. USDT hardening, seats held for founders, and the network chosen at deploy

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Two independent reviews of the USDT circles (ADR 0046) and the 3..50 member cap (ADR 0045) found these problems (details in [`../redteam/2026-11-16-usdt-review.md`](../redteam/2026-11-16-usdt-review.md)):

- **Exit batches could fail half way (RT-USDT-01, M-1).** `processExits` stopped before an exit when less than 150k gas was left, but settling one exit costs up to about 121k before the payout, and the token payout itself needs 140k left. At many gas limits a batch reverted with `PayoutGasTooLow`, and more gas could pay fewer exits. Measured cold (one exit per transaction, creator first, long name), AVAX circles had the same problem.
- **A Tether fee would brick a circle (RT-USDT-02).** USDt is an upgradeable proxy and its owner can switch a transfer fee on. `Ledger.pull` refused any payment where the vault received less than sent, so nobody could pay, borrowers would slide into default for no fault of theirs, and an immutable circle can't be fixed.
- **A late founder could be locked out (RT-USDT-03).** Invited founders hold no seat until they accept. The creator, or the first founders to accept, could admit an outsider by vote and fill the circle, and the last founder's `acceptInvite` then failed with `CircleFull`.
- **Seats never come back from lost wallets (RT-USDT-04).** With a fixed cap, a member whose wallet is lost keeps a seat forever.
- **The deploy script only warned (RT-USDT-06).** On mainnet it logged a warning when `USDT_ADDRESS` was not C-Chain USDt and deployed anyway.
- **The vault still refused mainnet.** `CircleVault` reverted with `MainnetNotSupported` on chain 43114, with a comment that exits didn't exist yet. Exits exist now. Where the contracts run is a deploy decision, not a contract rule.
- Smaller points: tokens or AVAX sent straight to the vault are stuck (L-1); Tether can freeze the vault itself (L-2); a member paying with tainted USDT could draw a freeze onto the vault (L-4).

## Decision

1. **Exit gas guard per asset.** `_walk` now needs `Ledger.payoutGasFloor(store) + Exits.SETTLE_GAS` left before each exit: AVAX 90k + 140k = 230k, USDT 140k + 140k = 280k. `SETTLE_GAS` is the measured worst settle cost (about 121k, all slots cold) plus room. A batch that can't do even one exit reverts with `ExitGasTooLow`; otherwise it pays what fits and stops. It never reverts with `PayoutGasTooLow` (S-USDT-09, S-EXIT-14b sweep 150k..1.2M gas).
2. **Tolerate a token fee up to 1%.** `Ledger.pull` accepts a payment when the vault received at least `amount - amount × MAX_TOKEN_FEE_BPS / 10_000` (`MAX_TOKEN_FEE_BPS = 100`). The payer is credited in full: the installment, interest or principal counts as paid. The circle books only what arrived: the shortfall comes off `totalAssets` (for a repayment, `loansOutstanding` still drops by the full amount and cash rises by what arrived). The vault emits `TokenFeeAbsorbed(payer, expected, received)`. A bigger fee, or receiving more than sent, still reverts with `TokenAmountMismatch`. The solvency invariant `token.balanceOf(vault) >= totalAssets - loansOutstanding + totalWithdrawable` holds (S-USDT-10).
3. **Seats held for founder invites.** Membership counts invites not yet accepted, declined or cleared (`pendingInvites`; all invites share one expiry, `invitesExpireAt`, 14 days after creation). While they are live, join requests and join approvals treat the circle as full at `memberCount + pendingInvites >= maxMembers`. `acceptInvite` checks real seats only. After a decline or the 14 days, the seat is free (S-MEM-09b). The two fields pack into `seqCounter`'s slot, so no storage moves.
4. **Lost-wallet seats: no change.** Recorded as an accepted consequence below.
5. **Deploy script refuses a wrong mainnet USDT.** On chain 43114, `DeployFactory.s.sol` reverts with `WrongMainnetUsdt` unless `USDT_ADDRESS` is C-Chain USDt `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7` or unset (AVAX-only factory).
6. **Network chosen by the environment.**
   - a) `CircleVault` no longer has `MainnetNotSupported` or `AVALANCHE_MAINNET_CHAIN_ID`. On chain 43114 the deploy script reverts with `MainnetNotConfirmed` unless `CONFIRM_MAINNET=yes` is set. Fuji (43113) and anvil need nothing extra. The app and SDK still list only Fuji until the audit.
   - b) A member frozen by Tether keeps their payout in `withdrawable` until Tether unfreezes them. No `withdrawTo` another wallet.
7. **Accepted without code:** tokens or AVAX sent straight to the vault stay there (no skim function, ADR 0046 already says they don't move NAV); Tether can freeze the vault; a member paying with tainted USDT could draw a freeze onto the whole vault.

## Alternatives considered

- **Exit guard as one flat number for both assets.** Simple, but it would make AVAX batches carry the USDT margin. The per-asset floor costs one storage read.
- **Catch the low-gas payout and stop the batch there.** The settle effects already happened by then; undoing them needs a revert anyway.
- **Keep refusing any token fee.** Safest for accounting, but one Tether switch would brick every USDT circle forever, and contracts are immutable.
- **Charge the fee to the payer (ask for more).** The payer can't know the fee in advance and the amount due would no longer match what the app shows. 1% is small enough for the circle to carry.
- **Reserve founder seats by checking each invite.** Needs a loop over invitees; a counter plus the shared expiry is O(1).
- **Free seats of dormant members after some time.** Their shares stay theirs, so a seat release would need an exit path for someone who can't sign. Left for a future version.
- **`withdrawTo` for frozen members.** Lets a member route money around a freeze, which puts the vault at risk of a freeze itself. Not now.
- **Keep the mainnet block in the vault until the audit.** It hard-codes a release decision into immutable code and would need a new vault build just to lift it.

## Consequences

- Exit batches need more gas headroom: an exit is only started with 230k (AVAX) or 280k (USDT) left. A Chainlink upkeep of 20 exits still fits well under common limits; `claimExit` for the last place in a long queue needs a matching gas limit.
- If Tether turns on a fee of 1% or less, payments keep working and every member's NAV carries the fee. If it goes above 1%, USDT payments stop and the circle can only exit or dissolve. Watch `TokenFeeAbsorbed` events.
- A circle with pending founder invites can admit fewer outsiders for the first 14 days. The create form can say so.
- **Dormant or lost wallets hold seats forever under the cap (RT-USDT-04).** Members can still vote a lost wallet dormant to stop its dues (ADR 0032), but the seat frees only on exit or dissolve. A future version could add a seat release.
- **Tether can freeze the vault itself (L-2).** Then all USDT in that circle is stuck; no code here can move it. A member who pays with USDT traced to a hack could draw such a freeze (L-4). The create form and the circle page must say this plainly for USDT circles.
- **Money sent straight to the vault is stuck (L-1).** It never counts toward NAV and no one can take it out.
- A frozen member's payout waits in `withdrawable` until Tether unfreezes them (6b).
- Deploying to mainnet now takes an explicit `CONFIRM_MAINNET=yes` and the real USDt (or none); the GitHub deploy workflow still offers only Fuji.
- ABI: event `TokenFeeAbsorbed` added; error `MainnetNotSupported` and constant `AVALANCHE_MAINNET_CHAIN_ID` removed from `CircleVault`. Older apps that mapped `MainnetNotSupported` keep a harmless message.
- See also ADR 0045 (cap) and 0046 (asset); neither is rewritten.
