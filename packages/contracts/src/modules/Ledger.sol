// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Ledger
/// @notice A circle's money (ADR 0037): total assets, shares, AVAX lent out, and payouts that a
///         recipient's wallet refused and that wait to be withdrawn.
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
    }

    /// @dev Gas a payout transfer may use: enough for a smart wallet, too little to burn the
    ///      caller's transaction (RT-20). No return data is copied, so a return bomb costs nothing.
    uint256 internal constant PAYOUT_GAS = 50_000;
    /// @dev Gas that must be left before a payout is sent: the full `PAYOUT_GAS` after the 63/64
    ///      rule plus room to queue a refused payout. A caller can't starve the transfer to push a
    ///      payout into `withdrawable` (EXIT-09).
    uint256 internal constant PAYOUT_GAS_FLOOR = 90_000;

    event PayoutQueued(address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    error NothingToWithdraw();
    error WithdrawFailed();
    error InsufficientCash(uint256 needed, uint256 available);
    /// @notice The transaction ran low on gas before a payout; send it again with more gas.
    error PayoutGasTooLow();

    /// @notice AVAX the circle holds right now and may use (assets minus loans out).
    function cash(Store storage self) internal view returns (uint256) {
        return self.totalAssets - self.loansOutstanding;
    }

    /// @dev Effects are done by the caller first; this is the last step. The one send path for
    ///      every payout (loans, exits, dissolution): push with a gas cap and no return data; if
    ///      the wallet refuses, keep it claimable instead of reverting, so one bad wallet never
    ///      blocks a vote, an exit queue or a loan (RT-20).
    function payOut(Store storage self, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (gasleft() < PAYOUT_GAS_FLOOR) revert PayoutGasTooLow();
        bool ok;
        // `to` is a member or borrower chosen by the rules. Assembly so no return data is copied.
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            ok := call(PAYOUT_GAS, to, amount, 0, 0, 0, 0)
        }
        if (!ok) {
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
        // slither-disable-next-line low-level-calls (pull payment to the caller)
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
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
