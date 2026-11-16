// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Ledger
/// @notice A circle's money (ADR 0037): total assets, shares, money lent out, and payouts that a
///         recipient's wallet refused and that wait to be withdrawn. The money is AVAX or the
///         factory's USDT, fixed at creation (ADR 0046); amounts are in its smallest unit.
/// @dev Internal library (inlined), so every module shares one bookkeeping struct that lives in
///      the vault. `totalAssets` = cash + loans outstanding; accrued but unpaid interest is not
///      counted until paid (ADR 0006, RT-08 noted for the audit). Never uses
///      `address(this).balance`.
library Ledger {
    struct Store {
        /// @dev Cash plus loans outstanding, in wei.
        uint256 totalAssets;
        uint256 totalShares;
        /// @dev Principal currently lent out to members, in wei.
        uint256 loansOutstanding;
        /// @dev Payouts a wallet refused (RT-20), claimable with `withdraw`.
        mapping(address account => uint256) withdrawable;
        /// @dev Sum of `withdrawable`; this money is owed and not part of the circle's assets.
        uint256 totalWithdrawable;
        // ---- cross-module switches (ADR 0037); each has exactly one writer
        /// @dev Exits whose notice has ended but aren't paid yet. Written by Exits. While > 0,
        ///      LoanBook disburses nothing (RT-17).
        uint256 exitsWaiting;
        /// @dev Guardian pause end (ADR 0020). Written by Exits (guardian functions). Pauses new
        ///      loans and joins, never exits.
        uint64 pausedUntil;
        /// @dev Until this time members may exit with no notice, because a rule change passed and
        ///      waits for its delay (ADR 0019). Written by Governance, read by Exits.
        uint64 rageQuitUntil;
        /// @dev The circle voted to dissolve (ADR 0021). Written by Governance.
        bool dissolved;
        /// @dev The guardian role ended for good (ADR 0020, 0043): the circle voted it off
        ///      (Governance), or the creator left the circle (Exits, EXIT-11).
        bool guardianDisabled;
        /// @dev The circle's token (ADR 0046): address(0) = AVAX, else the factory's USDT. Set
        ///      once by the vault constructor, never changed.
        address token;
    }

    /// @dev Gas a payout transfer may use: enough for a smart wallet, too little to burn the
    ///      caller's transaction (RT-20). No return data is copied, so a return bomb costs nothing.
    uint256 internal constant PAYOUT_GAS = 50_000;
    /// @dev Gas that must be left before a payout is sent: the full `PAYOUT_GAS` after the 63/64
    ///      rule plus room to queue a refused payout. A caller can't starve the transfer to push a
    ///      payout into `withdrawable` (EXIT-09).
    uint256 internal constant PAYOUT_GAS_FLOOR = 90_000;
    /// @dev Gas a token payout may use: a USDT transfer (proxy, blacklist checks, a new balance
    ///      slot) costs about 40-60k. Only 32 bytes of return data are ever read (ADR 0046).
    uint256 internal constant TOKEN_PAYOUT_GAS = 100_000;
    /// @dev `PAYOUT_GAS_FLOOR` for token payouts: `TOKEN_PAYOUT_GAS` after 63/64 plus room.
    uint256 internal constant TOKEN_PAYOUT_GAS_FLOOR = 140_000;

    event PayoutQueued(address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    error NothingToWithdraw();
    error WithdrawFailed();
    error InsufficientCash(uint256 needed, uint256 available);
    /// @notice The transaction ran low on gas before a payout; send it again with more gas.
    error PayoutGasTooLow();
    /// @notice This circle is paid in USDT; send no AVAX with the payment (ADR 0046).
    error AvaxNotAccepted();
    /// @notice Approve the circle for at least `needed` USDT first (approve, then pay).
    error TokenAllowanceTooLow(uint256 needed, uint256 allowance);
    /// @notice The wallet holds less USDT than the payment needs.
    error TokenBalanceTooLow(uint256 needed, uint256 balance);
    /// @notice The circle received a different amount than was sent (fee-on-transfer token).
    error TokenAmountMismatch(uint256 expected, uint256 received);

    /// @notice Money the circle holds right now and may use (assets minus loans out).
    function cash(Store storage self) internal view returns (uint256) {
        return self.totalAssets - self.loansOutstanding;
    }

    /// @dev Effects are done by the caller first; this is the last step. The one send path for
    ///      every payout (loans, exits, dissolution): push with a gas cap; if the wallet refuses
    ///      (or Tether froze it), keep it claimable instead of reverting, so one bad wallet never
    ///      blocks a vote, an exit queue or a loan (RT-20, ADR 0046).
    function payOut(Store storage self, address to, uint256 amount) internal {
        if (amount == 0) return;
        address token = self.token;
        bool avax = token == address(0);
        if (gasleft() < (avax ? PAYOUT_GAS_FLOOR : TOKEN_PAYOUT_GAS_FLOOR)) {
            revert PayoutGasTooLow();
        }
        // `to` is a member or borrower chosen by the rules.
        if (!_send(token, to, amount, avax ? PAYOUT_GAS : TOKEN_PAYOUT_GAS)) {
            self.withdrawable[to] += amount;
            self.totalWithdrawable += amount;
            // slither-disable-next-line reentrancy-events (only when the payment was refused)
            emit PayoutQueued(to, amount);
        }
    }

    /// @notice Claim a payout your wallet refused earlier. Pull payment, CEI.
    function withdraw(Store storage self, address to) internal {
        uint256 amount = self.withdrawable[to];
        if (amount == 0) revert NothingToWithdraw();
        self.withdrawable[to] = 0;
        self.totalWithdrawable -= amount;
        emit Withdrawn(to, amount);
        // Pull payment to the caller, with all the gas left.
        if (!_send(self.token, to, amount, gasleft())) revert WithdrawFailed();
    }

    /// @dev Takes exactly `amount` of the circle's token from the caller (USDT circles only; the
    ///      caller has already refused any AVAX sent). Checks allowance and balance first so the
    ///      wallet gets a plain error, then checks the vault received exactly `amount`, which
    ///      rejects fee-on-transfer behaviour (ADR 0046). The token is the factory's, fixed.
    function pull(Store storage self, uint256 amount) internal {
        IERC20 t = IERC20(self.token);
        uint256 allowed = t.allowance(msg.sender, address(this));
        if (allowed < amount) revert TokenAllowanceTooLow(amount, allowed);
        uint256 held = t.balanceOf(msg.sender);
        if (held < amount) revert TokenBalanceTooLow(amount, held);
        uint256 before = t.balanceOf(address(this));
        SafeERC20.safeTransferFrom(t, msg.sender, address(this), amount);
        uint256 received = t.balanceOf(address(this)) - before;
        if (received != amount) revert TokenAmountMismatch(amount, received);
    }

    /// @dev Sends `amount` AVAX (`token` 0) or tokens to `to` with at most `gasCap` gas. Never
    ///      reverts: returns false if the transfer failed. AVAX: no return data is copied, so a
    ///      return bomb costs nothing. Token: `transfer(to, amount)`; at most 32 bytes of return
    ///      data are read, and a token that returns nothing counts as success (old USDT style).
    function _send(address token, address to, uint256 amount, uint256 gasCap)
        private
        returns (bool ok)
    {
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            switch token
            case 0 { ok := call(gasCap, to, amount, 0, 0, 0, 0) }
            default {
                let p := mload(0x40)
                mstore(p, shl(224, 0xa9059cbb)) // transfer(address,uint256)
                mstore(add(p, 0x04), to)
                mstore(add(p, 0x24), amount)
                mstore(0, 0)
                ok := call(gasCap, token, 0, p, 0x44, 0, 0x20)
                if ok {
                    switch returndatasize()
                    case 0 { ok := gt(extcodesize(token), 0) }
                    default { ok := and(gt(returndatasize(), 0x1f), eq(mload(0), 1)) }
                }
            }
        }
    }

    /// @notice True while the guardian pause is on.
    function paused(Store storage self) internal view returns (bool) {
        return block.timestamp < self.pausedUntil;
    }

    /// @dev Reverts unless at least `amount` cash is available.
    function requireCash(Store storage self, uint256 amount) internal view {
        uint256 c = cash(self);
        if (amount > c) revert InsufficientCash(amount, c);
    }
}
