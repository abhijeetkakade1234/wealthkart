// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PeriodMath} from "../../src/libraries/PeriodMath.sol";

contract PeriodMathHarness {
    function dueMoment(uint256 period, uint8 dueDay) external pure returns (uint256) {
        return PeriodMath.dueMoment(period, dueDay);
    }
}

contract PeriodMathTest is Test {
    PeriodMathHarness internal h = new PeriodMathHarness();

    // 2026-12 => 2026 * 12 + 11
    uint256 internal constant DEC_2026 = 24_323;

    function test_periodOf_utcBoundaries() public pure {
        assertEq(PeriodMath.periodOf(1_796_083_200), DEC_2026); // 2026-12-01T00:00:00Z
        assertEq(PeriodMath.periodOf(1_796_083_199), DEC_2026 - 1); // 2026-11-30T23:59:59Z
    }

    /// S-PAY-02 / S-PAY-03: due moment is 23:59:59 UTC on the due day.
    function test_dueMoment_isLastSecondOfDueDay() public view {
        assertEq(h.dueMoment(DEC_2026, 10), 1_796_947_199); // 2026-12-10T23:59:59Z
    }

    /// S-MATH-03: due day 28 in a leap-year February.
    function test_dueMoment_feb28LeapYear() public view {
        uint256 feb2028 = 2028 * 12 + 1;
        assertEq(h.dueMoment(feb2028, 28), 1_835_395_199); // 2028-02-28T23:59:59Z
    }

    /// S-LIFE-10: due day outside 1..28 is rejected.
    function test_dueMoment_rejectsOutOfRange() public {
        vm.expectRevert(abi.encodeWithSelector(PeriodMath.InvalidDueDay.selector, uint8(29)));
        h.dueMoment(DEC_2026, 29);
        vm.expectRevert(abi.encodeWithSelector(PeriodMath.InvalidDueDay.selector, uint8(0)));
        h.dueMoment(DEC_2026, 0);
    }

    /// Round trip: civil <-> days for every day across 60 years.
    function testFuzz_civilRoundTrip(uint32 dayNumber) public pure {
        uint256 z = uint256(dayNumber) % (365 * 60);
        (uint256 y, uint256 m, uint256 d) = PeriodMath.civilFromDays(z);
        assertEq(PeriodMath.daysFromCivil(y, m, d), z);
        assertGe(m, 1);
        assertLe(m, 12);
        assertGe(d, 1);
        assertLe(d, 31);
    }
}
