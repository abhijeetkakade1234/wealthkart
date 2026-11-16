// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {CircleVaultUsdtBase} from "./CircleVault.usdt.t.sol";
import {TestUSDT} from "./helpers/MockUSDT.sol";

/// @dev Drives a USDT circle (ADR 0046) through random installments, loans, interest, repayments,
///      exits, withdrawals, donations and Tether-style freezes, interleaved with time jumps.
///      Members approve the vault once with a large allowance to keep the runs short (the app
///      approves exact amounts; the exact flow is covered by the scenario tests).
contract UsdtHandler is Test {
    CircleVault public vault;
    TestUSDT public usdt;
    address[] public members;
    /// @dev Ghost: USDT sent straight to the vault, outside its books.
    uint256 public donated;
    /// @dev Ghost: payouts that reached a member's wallet, so runs are known to pay out.
    uint256 public paidOut;

    constructor(CircleVault v, TestUSDT t, address[] memory m) {
        vault = v;
        usdt = t;
        members = m;
        for (uint256 i = 0; i < m.length; ++i) {
            vm.prank(m[i]);
            t.approve(address(v), type(uint256).max);
        }
    }

    function _who(uint256 seed) internal view returns (address) {
        return members[seed % members.length];
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    function payAll() public {
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.isMember(members[i])) continue;
            (,,, bool due) = vault.amountDue(members[i]);
            if (!due) continue;
            vm.prank(members[i]);
            try vault.contribute() {} catch {}
        }
    }

    function contribute(uint256 who) external {
        address a = _who(who);
        if (!vault.isMember(a)) return;
        (,,, bool due) = vault.amountDue(a);
        if (!due) return;
        vm.prank(a);
        try vault.contribute() {} catch {}
    }

    function warp(uint256 secondsAhead) external {
        vm.warp(block.timestamp + bound(secondsAhead, 1 hours, 40 days));
    }

    function borrowNow(uint256 who, uint256 amount) external {
        payAll();
        amount = bound(amount, 1, 60e6);
        for (uint256 k = 0; k < members.length; ++k) {
            vm.prank(_who(who + k));
            try vault.requestLoan(amount, false, address(0)) returns (uint256 id) {
                for (uint256 i = 0; i < members.length; ++i) {
                    if (!vault.canVoteLoan(id, members[i])) continue;
                    vm.prank(members[i]);
                    try vault.voteLoan(id, true) {} catch {}
                }
                return;
            } catch {}
        }
    }

    function payInterest(uint256 who) external {
        vm.prank(_who(who));
        try vault.payInterest() {} catch {}
    }

    function repay(uint256 who, uint256 amount, bool full) external {
        address b = _who(who);
        if (full) {
            try vault.payoffDue(b) returns (uint256 p) {
                amount = p;
            } catch {
                return;
            }
        } else {
            amount = bound(amount, 1, 60e6);
        }
        vm.prank(b);
        try vault.repay(amount) {} catch {}
    }

    function requestExit(uint256 who) external {
        vm.prank(_who(who));
        try vault.requestExit() {} catch {}
    }

    function processExits() external {
        uint256 before = _walletTotal();
        try vault.processExits(5) {} catch {}
        paidOut += _walletTotal() - before > 0 ? 1 : 0;
    }

    function withdraw(uint256 who) external {
        vm.prank(_who(who));
        try vault.withdraw() {} catch {}
    }

    function freeze(uint256 who, bool on) external {
        usdt.setBlacklisted(_who(who), on);
    }

    function donate(uint256 amount) external {
        amount = bound(amount, 1, 1000e6);
        usdt.mint(address(vault), amount);
        donated += amount;
    }

    function _walletTotal() internal view returns (uint256 sum) {
        for (uint256 i = 0; i < members.length; ++i) {
            sum += usdt.balanceOf(members[i]);
        }
    }
}

/// @notice USDT variants of the money invariants (I-1, I-2, I-8, ADR 0046).
contract CircleVaultUsdtInvariantTest is CircleVaultUsdtBase {
    UsdtHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new UsdtHandler(vault, usdt, members);
        targetContract(address(handler));
    }

    /// I-8 (USDT): token balance = cash + refused payouts + donations; so the vault always holds
    /// at least `totalAssets - loansOutstanding + totalWithdrawable`.
    function invariant_I8_usdtBalanceCoversCashAndRefusedPayouts() public view {
        uint256 owed = vault.totalAssets() - vault.loansOutstanding() + _sumWithdrawable();
        assertGe(usdt.balanceOf(address(vault)), owed);
        assertEq(usdt.balanceOf(address(vault)), owed + handler.donated());
    }

    /// I-2: member shares sum to total shares (removed members hold none).
    function invariant_I2_usdtSharesSumToTotal() public view {
        uint256 sum;
        for (uint256 i = 0; i < members.length; ++i) {
            sum += vault.memberOf(members[i]).shares;
        }
        assertEq(sum, vault.totalShares());
    }

    /// Loans never exceed the assets they come from.
    function invariant_usdtLoansWithinAssets() public view {
        assertLe(vault.loansOutstanding(), vault.totalAssets());
    }
}
