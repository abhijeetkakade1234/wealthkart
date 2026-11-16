# 0046. Circle asset: AVAX or USDT, chosen once at creation

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Circles hold AVAX (ADR 0002). AVAX moves a lot against the rupee, so a member who saved 12 months of installments can see the value drop by a third in a bad month. Several founders want a dollar-stable option. ADR 0002 already said the contracts should be asset-agnostic so a stablecoin could follow. On Avalanche C-Chain the most used dollar token is Tether's USDt.

USDT is not like AVAX in three ways that matter here:

- It is an ERC-20, so a payment is two steps: approve, then pay.
- It has 6 decimals, not 18.
- Tether can freeze any address. A frozen member can't receive; a frozen vault can't send anything to anyone.

## Decision

- **One asset per circle, fixed at creation.** `Config.asset` is `Asset.AVAX` or `Asset.USDT`. It is stored immutable (`asset()` returns the token address, `address(0)` for AVAX) and no vote can change it. Switching asset would mean a new circle (ADR 0020).
- **Only the factory's token.** `CircleFactory` takes one `usdt` address in its constructor (immutable, `address(0)` on chains without one). A circle never accepts an arbitrary token address. Creating a USDT circle on a factory without one reverts with `UsdtNotAvailable`. The contracts do not hardcode the address; the deploy script passes it:
  - Avalanche C-Chain mainnet USDt: `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7`.
  - Fuji: a testnet-only `MockUSDT` (6 decimals, public faucet `mint` capped per call), deployed first and passed to the factory.
- **Money in: approve, then pay the exact amount.** `contribute`, `payInterest` and `repay(amount)` charge the same numbers as for AVAX (installment, late fees, interest), in token units. A USDT circle refuses any AVAX sent with them (`AvaxNotAccepted`). It checks the allowance and balance first and reverts with a plain error (`TokenAllowanceTooLow`, `TokenBalanceTooLow`), pulls the amount with OpenZeppelin `SafeERC20.safeTransferFrom`, and checks that its own balance grew by exactly that amount, so fee-on-transfer tokens are refused (`TokenAmountMismatch`). The app asks for an exact allowance, never an unlimited one.
- **`repay` gets an amount.** A new overload `repay(uint256 amount)` works for both assets (an AVAX circle needs `msg.value == amount`). The old `repay()` stays for AVAX circles and repays `msg.value`, so existing callers keep working.
- **Money out: one path, never blocking.** `Ledger.payOut` sends AVAX (capped-gas call, as before) or the token (low-level `transfer` with a gas cap and at most 32 bytes of return data read). If the token transfer fails, for example because Tether froze the recipient, the amount moves to `withdrawable`, exactly like a refused AVAX payout (RT-20). Loan disbursal, exits, dissolution claims and settlements all use it, so one frozen member never blocks a vote, a loan or the exit queue. `withdraw` sends the token with all remaining gas and reverts if it fails.
- **Gas is still AVAX.** Members need a little AVAX in the wallet for every transaction (ADR 0003), even in a USDT circle.
- **Decimals.** The contracts never read decimals; every amount is in the asset's smallest unit (wei for AVAX, 1e-6 USDT). The app formats with 18 or 6 decimals and shows the symbol from the circle's asset. Share maths keeps its virtual offsets; with 6 decimals the first-deposit inflation attack still costs the attacker about a million times what it can take (tested in S-MATH).
- **Solvency.** For a USDT circle the invariant is `token.balanceOf(vault) >= totalAssets - loansOutstanding + totalWithdrawable` (tokens sent straight to the vault only add to the left side).
- **Reputation and loan maths stay asset-agnostic.** They count payments and outcomes, not amounts in a currency.

## Alternatives considered

- **Any ERC-20 picked by the creator.** Opens the door to tokens with hooks, rebasing, fees or a malicious owner. One reviewed token per factory is much easier to audit.
- **USDC instead of USDT.** Also freezable, so no difference on that point. USDT has more use among our users; a later factory can add USDC with its own ADR.
- **Let a vote switch the asset.** It would force a valuation between two assets at some price feed, which brings oracles and manipulation into an immutable contract.
- **Revert when a token payout fails.** One frozen member would block every exit behind them, and a loan vote whose borrower is frozen would never close.

## Consequences

- **Tether can freeze the vault itself.** If that happens, all funds in that circle are stuck and no code here can move them. This is inherent to USDT. The create form must say so in plain words before the creator picks USDT.
- A frozen member's payouts wait in `withdrawable`; they can claim them only if Tether unfreezes the address (open question: let a member withdraw to another wallet of theirs).
- The web app must add the asset choice to the create form, show amounts with the right decimals and symbol, and run approve-then-pay for USDT circles.
- Test suites run the solvency invariants for both assets, plus USDT scenarios (lifecycle, fee-on-transfer, frozen member, AVAX sent to a USDT circle, missing approval, factory without USDT).
- The factory constructor is now `(bytes vaultCode, address usdt)`; deploy scripts and the E2E setup pass the token.
