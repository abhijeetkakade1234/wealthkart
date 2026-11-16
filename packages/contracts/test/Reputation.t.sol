// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Reputation, ICircleCheck} from "../src/Reputation.sol";

/// @dev A stand-in factory: marks which addresses count as circles.
contract FakeFactory is ICircleCheck {
    mapping(address => bool) public isCircle;

    function set(address c, bool v) external {
        isCircle[c] = v;
    }
}

/// @notice Reputation record (Phase 3, ADR 0042): S-REP-*.
contract ReputationTest is Test {
    FakeFactory internal factory;
    Reputation internal rep;
    address internal circleA = makeAddr("circleA");
    address internal circleB = makeAddr("circleB");
    address internal fake = makeAddr("fakeCircle");
    address internal alice = makeAddr("alice");

    function setUp() public {
        factory = new FakeFactory();
        rep = new Reputation(address(factory));
        factory.set(circleA, true);
        factory.set(circleB, true);
    }

    function test_S_REP_01_onlyRealCirclesCanWrite() public {
        vm.prank(fake);
        vm.expectRevert(abi.encodeWithSelector(Reputation.NotACircle.selector, fake));
        rep.recordPayment(alice, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Reputation.NotACircle.selector, alice));
        rep.recordLoanOutcome(alice, true);
    }

    function test_S_REP_02_countsAcrossCirclesAndMintsOnce() public {
        vm.warp(1_800_000_000);
        vm.expectEmit(address(rep));
        emit Reputation.Transfer(address(0), alice, uint256(uint160(alice)));
        vm.prank(circleA);
        rep.recordPayment(alice, true);
        vm.prank(circleA);
        rep.recordPayment(alice, false);
        vm.prank(circleB);
        rep.recordPayment(alice, true);
        vm.prank(circleB);
        rep.recordLoanOutcome(alice, true);
        vm.prank(circleA);
        rep.recordLoanOutcome(alice, false);

        Reputation.Record memory r = rep.recordOf(alice);
        assertEq(r.onTime, 2);
        assertEq(r.late, 1);
        assertEq(r.loansRepaid, 1);
        assertEq(r.defaults, 1);
        assertEq(r.circles, 2);
        assertEq(r.firstSeen, 1_800_000_000);
        assertEq(rep.onTimeBps(alice), 6666);
        assertEq(rep.balanceOf(alice), 1);
        assertEq(rep.ownerOf(uint256(uint160(alice))), alice);
    }

    function test_S_REP_03_soulbound() public {
        vm.prank(circleA);
        rep.recordPayment(alice, true);
        uint256 id = uint256(uint160(alice));
        assertTrue(rep.locked(id));
        vm.startPrank(alice);
        vm.expectRevert(Reputation.Soulbound.selector);
        rep.transferFrom(alice, makeAddr("bob"), id);
        vm.expectRevert(Reputation.Soulbound.selector);
        rep.safeTransferFrom(alice, makeAddr("bob"), id);
        vm.expectRevert(Reputation.Soulbound.selector);
        rep.approve(makeAddr("bob"), id);
        vm.expectRevert(Reputation.Soulbound.selector);
        rep.setApprovalForAll(makeAddr("bob"), true);
        vm.stopPrank();
        assertTrue(rep.supportsInterface(0xb45a3c0e));
        assertTrue(rep.supportsInterface(0x80ac58cd));
        assertFalse(rep.supportsInterface(0xffffffff));
    }

    function test_S_REP_04_noRecordMeansNoToken() public {
        assertEq(rep.balanceOf(alice), 0);
        assertEq(rep.onTimeBps(alice), 0);
        vm.expectRevert(abi.encodeWithSelector(Reputation.NoRecord.selector, alice));
        rep.ownerOf(uint256(uint160(alice)));
    }

    /// Counters only go up, whatever the order of writes.
    function testFuzz_S_REP_05_countersNeverDecrease(uint8 n, uint256 seed) public {
        uint256 prevTotal;
        for (uint256 i = 0; i < n % 40; ++i) {
            seed = uint256(keccak256(abi.encode(seed)));
            vm.prank(seed % 2 == 0 ? circleA : circleB);
            if (seed % 3 == 0) rep.recordLoanOutcome(alice, seed % 5 != 0);
            else rep.recordPayment(alice, seed % 7 != 0);
            Reputation.Record memory r = rep.recordOf(alice);
            uint256 total = uint256(r.onTime) + r.late + r.loansRepaid + r.defaults;
            assertEq(total, prevTotal + 1);
            prevTotal = total;
        }
    }
}
