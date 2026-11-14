// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CircleVault} from "../src/CircleVault.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";

/// @notice Contribution scenarios from docs/testing.md (S-PAY-*, S-LIFE-04*, S-MEM-*, I-8).
contract CircleVaultContributionsTest is CircleVaultBase {
    // ---------------------------------------------------------------- happy path

    function test_S_PAY_01_onTimePaymentMintsSharesWithNoFee() public {
        address a = members[0];
        (uint256 period, uint256 amount, uint256 fees, bool due) = vault.amountDue(a);
        assertEq(period, DEC_2026);
        assertEq(amount, AVAX / 2);
        assertEq(fees, 0);
        assertTrue(due);

        _pay(a);
        assertEq(vault.totalAssets(), AVAX / 2);
        assertGt(vault.memberOf(a).shares, 0);
        assertEq(vault.memberOf(a).nextPeriod, DEC_2026 + 1);
        assertApproxEqAbs(vault.stakeOf(a), AVAX / 2, 1);
    }

    function test_S_PAY_01_equalPaymentsGiveEqualShares() public {
        _pay(members[0]);
        _pay(members[1]);
        assertEq(vault.memberOf(members[0]).shares, vault.memberOf(members[1]).shares);
    }

    // ---------------------------------------------------------------- deadlines (UTC)

    function test_S_PAY_02_lastSecondOfDueDayHasNoFee() public {
        vm.warp(DEC_10_2026_END);
        (,, uint256 fees,) = vault.amountDue(members[0]);
        assertEq(fees, 0);
    }

    function test_S_PAY_03_firstSecondAfterDueDayCostsFee1() public {
        vm.warp(DEC_10_2026_END + 1);
        (, uint256 amount, uint256 fees,) = vault.amountDue(members[0]);
        assertEq(fees, AVAX / 100);
        assertEq(amount, AVAX / 2 + AVAX / 100);
        _pay(members[0]);
        assertEq(vault.totalAssets(), AVAX / 2 + AVAX / 100);
    }

    function test_S_PAY_04_afterDay20CostsBothFees() public {
        vm.warp(DEC_20_2026_END + 1);
        (,, uint256 fees,) = vault.amountDue(members[0]);
        assertEq(fees, 2 * (AVAX / 100));
    }

    function test_feesRaiseNavForEveryone() public {
        _pay(members[0]); // on time
        vm.warp(DEC_10_2026_END + 1);
        uint256 before = vault.stakeOf(members[0]);
        _pay(members[1]); // late, pays fee 1 into the vault
        assertGt(vault.stakeOf(members[0]), before);
    }

    // ---------------------------------------------------------------- rejections

    function test_S_PAY_05_doublePaymentForSamePeriodIsRejected() public {
        _pay(members[0]);
        vm.prank(members[0]);
        vm.expectRevert(
            abi.encodeWithSelector(
                CircleVault.AdvancePaymentNotAllowed.selector, DEC_2026 + 1, DEC_2026
            )
        );
        vault.contribute{value: AVAX / 2}();
        assertEq(vault.totalAssets(), AVAX / 2); // nothing extra taken
    }

    function test_S_PAY_06_advancePaymentIsRejected() public {
        _pay(members[0]);
        (,,, bool due) = vault.amountDue(members[0]);
        assertFalse(due);
    }

    function test_S_PAY_07_wrongAmountIsRejected() public {
        vm.startPrank(members[0]);
        vm.expectRevert(
            abi.encodeWithSelector(CircleVault.WrongAmount.selector, AVAX / 2, AVAX / 2 - 1)
        );
        vault.contribute{value: AVAX / 2 - 1}();
        vm.expectRevert(
            abi.encodeWithSelector(CircleVault.WrongAmount.selector, AVAX / 2, AVAX / 2 + 1)
        );
        vault.contribute{value: AVAX / 2 + 1}();
        vm.stopPrank();
        assertEq(vault.totalAssets(), 0);
    }

    function test_nonMemberCannotPay() public {
        address stranger = makeAddr("stranger");
        vm.deal(stranger, AVAX);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CircleVault.NotAMember.selector, stranger));
        vault.contribute{value: AVAX / 2}();
    }

    function test_S_PAY_08_missedMonthsArePaidOldestFirstWithFees() public {
        // Member skips Dec, Jan, Feb; pays on 2027-03-05.
        vm.warp(1_804_204_800); // 2027-03-05T00:00:00Z
        address a = members[0];
        uint256 expectedPeriod = DEC_2026;
        for (uint256 i = 0; i < 3; ++i) {
            (uint256 period,, uint256 fees,) = vault.amountDue(a);
            assertEq(period, expectedPeriod + i);
            assertEq(fees, 2 * (AVAX / 100)); // past months owe both fees
            _pay(a);
        }
        // March is current and still before its due day: no fee
        (uint256 p,, uint256 f, bool due) = vault.amountDue(a);
        assertEq(p, DEC_2026 + 3);
        assertEq(f, 0);
        assertTrue(due);
    }

    function test_S_PAY_10_plainTransferToVaultIsRejected() public {
        vm.prank(members[0]);
        (bool ok,) = address(vault).call{value: AVAX}("");
        assertFalse(ok);
        assertEq(address(vault).balance, 0);
    }

    function test_I8_forceSentAvaxDoesNotChangeNav() public {
        _pay(members[0]);
        uint256 navBefore = vault.navPerShareE18();
        vm.deal(address(vault), address(vault).balance + 50 * AVAX); // simulates selfdestruct/coinbase
        assertEq(vault.navPerShareE18(), navBefore);
        assertEq(vault.totalAssets(), AVAX / 2);
    }

    function test_S_PAY_11_memberOfTwoCirclesPaysEachIndependently() public {
        address[] memory two = new address[](2);
        two[0] = members[0];
        two[1] = members[1];
        CircleVault other = CircleVault(payable(factory.createCircle(_cfg(), two)));
        _pay(members[0]);
        assertEq(other.totalAssets(), 0);
        (uint256 period,,,) = other.amountDue(members[0]);
        assertEq(period, DEC_2026);
        assertEq(factory.circlesOfCount(members[0]), 2);
    }

    // ---------------------------------------------------------------- payment holidays

    function test_S_LIFE_04_holidayMonthPaidBeforeNextDueDateHasNoFee() public {
        vm.prank(members[0]);
        vault.declareHoliday();
        vm.warp(1_799_452_800); // 2027-01-09T00:00:00Z
        (uint256 period,, uint256 fees,) = vault.amountDue(members[0]);
        assertEq(period, DEC_2026);
        assertEq(fees, 0);
    }

    function test_S_LIFE_04a_holidayAfterDueMomentIsRejected() public {
        vm.warp(DEC_10_2026_END + 1);
        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(CircleVault.HolidayTooLate.selector, DEC_2026));
        vault.declareHoliday();
    }

    function test_S_LIFE_04b_fourthHolidayInAYearIsRejected() public {
        // Use Jan, Feb, Mar 2027, then try Apr. Each month: declare, then pay the holiday month.
        address a = members[0];
        _pay(a); // Dec 2026
        uint256[4] memory starts =
            [uint256(1_798_761_600), 1_801_440_000, 1_803_859_200, 1_806_537_600]; // Jan..Apr 1
        for (uint256 i = 0; i < 3; ++i) {
            vm.warp(starts[i]);
            vm.prank(a);
            vault.declareHoliday();
            _pay(a);
        }
        vm.warp(starts[3]);
        vm.prank(a);
        vm.expectRevert(abi.encodeWithSelector(CircleVault.HolidayLimitReached.selector, 2027));
        vault.declareHoliday();
    }

    function test_S_LIFE_04c_unpaidHolidayMonthStartsFeesAfterNextDueDate() public {
        vm.prank(members[0]);
        vault.declareHoliday();
        vm.warp(1_799_625_600); // 2027-01-11T00:00:00Z: after Jan due day, before Jan 20
        (,, uint256 fees,) = vault.amountDue(members[0]);
        assertEq(fees, AVAX / 100);
    }

    function test_holidayCannotBeDeclaredTwiceOrAfterPaying() public {
        vm.startPrank(members[0]);
        vault.declareHoliday();
        vm.expectRevert(
            abi.encodeWithSelector(CircleVault.HolidayAlreadyDeclared.selector, DEC_2026)
        );
        vault.declareHoliday();
        vm.stopPrank();

        _pay(members[1]);
        vm.prank(members[1]);
        vm.expectRevert(abi.encodeWithSelector(CircleVault.PeriodAlreadyPaid.selector, DEC_2026));
        vault.declareHoliday();
    }

    // ---------------------------------------------------------------- config bounds (S-LIFE-10)

    function test_S_LIFE_10_invalidConfigIsRejected() public {
        CircleVault.Config memory c = _cfg();
        address[] memory one = new address[](1);
        one[0] = members[0];

        c.dueDay = 29;
        vm.expectRevert(
            abi.encodeWithSelector(CircleVault.InvalidConfig.selector, "dueDay must be 1..28")
        );
        factory.createCircle(c, one);

        c = _cfg();
        c.installment = 0;
        vm.expectRevert(
            abi.encodeWithSelector(CircleVault.InvalidConfig.selector, "installment must be > 0")
        );
        factory.createCircle(c, one);

        c = _cfg();
        c.secondFeeDay = 10; // not after dueDay
        vm.expectRevert();
        factory.createCircle(c, one);

        c = _cfg();
        c.holidaysPerYear = 13;
        vm.expectRevert();
        factory.createCircle(c, one);
    }

    function test_duplicateOrZeroFoundersAreRejected() public {
        address[] memory dup = new address[](2);
        dup[0] = members[0];
        dup[1] = members[0];
        vm.expectRevert(abi.encodeWithSelector(CircleVault.DuplicateMember.selector, members[0]));
        factory.createCircle(_cfg(), dup);

        address[] memory zero = new address[](1);
        vm.expectRevert(CircleVault.ZeroAddressMember.selector);
        factory.createCircle(_cfg(), zero);
    }

    // ---------------------------------------------------------------- funds-stuck guard

    /// This version has no exits; deploying on Avalanche mainnet would lock funds forever.
    function test_cannotDeployOnAvalancheMainnet() public {
        vm.chainId(43_114);
        vm.expectRevert(CircleVault.MainnetNotSupported.selector);
        factory.createCircle(_cfg(), members);
    }

    // ---------------------------------------------------------------- scale (ADR 0015)

    function test_S_MEM_09_contributionGasIsFlatWith200Members() public {
        address[] memory big = _makeMembers(200);
        CircleVault v = CircleVault(payable(factory.createCircle(_cfg(), big)));

        vm.prank(big[0]);
        uint256 g0 = gasleft();
        v.contribute{value: AVAX / 2}();
        uint256 first = g0 - gasleft();

        for (uint256 i = 1; i < 199; ++i) {
            vm.prank(big[i]);
            v.contribute{value: AVAX / 2}();
        }

        vm.prank(big[199]);
        uint256 g1 = gasleft();
        v.contribute{value: AVAX / 2}();
        uint256 last = g1 - gasleft();

        // The 200th payment costs no more than the first (it's cheaper: warm storage slots).
        assertLe(last, first);
        assertLt(last, 100_000);
    }
}
