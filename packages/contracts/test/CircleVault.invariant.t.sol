// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";

/// @dev Drives random contributions, holidays, time jumps and force-sends.
contract ContributionHandler is Test {
    CircleVault public vault;
    address[] public members;
    uint256 public ghostDeposits;
    uint256 public ghostForced;

    constructor(CircleVault v, address[] memory m) {
        vault = v;
        members = m;
    }

    function contribute(uint256 who) external {
        address a = members[who % members.length];
        (, uint256 amount,, bool due) = vault.amountDue(a);
        if (!due) return;
        vm.prank(a);
        vault.contribute{value: amount}();
        ghostDeposits += amount;
    }

    function holiday(uint256 who) external {
        address a = members[who % members.length];
        vm.prank(a);
        try vault.declareHoliday() {} catch {}
    }

    function warp(uint256 secondsAhead) external {
        vm.warp(block.timestamp + bound(secondsAhead, 1 hours, 45 days));
    }

    function forceSend(uint256 amount) external {
        amount = bound(amount, 1, 10 ether);
        vm.deal(address(vault), address(vault).balance + amount);
        ghostForced += amount;
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }
}

contract CircleVaultInvariantTest is CircleVaultBase {
    ContributionHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new ContributionHandler(vault, members);
        targetContract(address(handler));
    }

    /// I-1 (contribution slice): tracked assets equal everything members paid in.
    function invariant_I1_totalAssetsEqualsDeposits() public view {
        assertEq(vault.totalAssets(), handler.ghostDeposits());
    }

    /// I-8: force-sent AVAX sits outside accounting; balance = tracked + forced.
    function invariant_I8_balanceIsTrackedPlusForced() public view {
        assertEq(address(vault).balance, vault.totalAssets() + handler.ghostForced());
    }

    /// I-2: member shares sum to total shares.
    function invariant_I2_sharesSumToTotal() public view {
        uint256 sum;
        for (uint256 i = 0; i < members.length; ++i) {
            sum += vault.memberOf(members[i]).shares;
        }
        assertEq(sum, vault.totalShares());
    }

    /// I-3: no member's stake exceeds what the whole vault holds.
    function invariant_I3_noStakeExceedsVault() public view {
        for (uint256 i = 0; i < members.length; ++i) {
            assertLe(vault.stakeOf(members[i]), vault.totalAssets());
        }
    }

    /// I-7: a member never pays ahead of the current period.
    function invariant_I7_noAdvancePayments() public view {
        uint256 current = vault.currentPeriod();
        for (uint256 i = 0; i < members.length; ++i) {
            assertLe(vault.memberOf(members[i]).nextPeriod, current + 1);
        }
    }
}
