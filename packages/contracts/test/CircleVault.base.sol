// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

/// @dev Shared setup: a 12-member circle created on 2026-12-01 00:00 UTC, installment 0.5 AVAX,
///      due on the 10th, fees 0.01 AVAX each, 3 holidays a year (G1-like defaults).
abstract contract CircleVaultBase is Test {
    uint256 internal constant AVAX = 1e18;
    uint256 internal constant DEC_1_2026 = 1_796_083_200; // 2026-12-01T00:00:00Z
    uint256 internal constant DEC_10_2026_END = 1_796_947_199; // 2026-12-10T23:59:59Z
    uint256 internal constant DEC_20_2026_END = 1_797_811_199; // 2026-12-20T23:59:59Z
    uint256 internal constant DEC_2026 = 24_323;

    CircleFactory internal factory;
    CircleVault internal vault;
    address[] internal members;

    function _cfg() internal pure returns (CircleVault.Config memory c) {
        c = CircleVault.Config({
            installment: uint128(AVAX / 2),
            fee1: uint128(AVAX / 100),
            fee2: uint128(AVAX / 100),
            dueDay: 10,
            secondFeeDay: 20,
            holidaysPerYear: 3
        });
    }

    function _makeMembers(uint256 n) internal returns (address[] memory list) {
        list = new address[](n);
        for (uint256 i = 0; i < n; ++i) {
            list[i] = makeAddr(string.concat("member", vm.toString(i)));
            vm.deal(list[i], 1000 * AVAX);
        }
    }

    function setUp() public virtual {
        vm.warp(DEC_1_2026);
        factory = new CircleFactory();
        members = _makeMembers(12);
        vault = CircleVault(payable(factory.createCircle(_cfg(), members)));
    }

    function _pay(address who) internal returns (uint256 sent) {
        (,,, bool payable_) = vault.amountDue(who);
        require(payable_, "nothing due");
        (, sent,,) = vault.amountDue(who);
        vm.prank(who);
        vault.contribute{value: sent}();
    }
}
