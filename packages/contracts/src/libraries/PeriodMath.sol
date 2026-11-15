// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title PeriodMath
/// @notice Calendar-month periods and due moments, all in UTC (ADR 0014).
/// @dev Mirrors `packages/rules/src/periods.ts`. A period index is `year * 12 + (month - 1)`.
///      Date conversion uses Howard Hinnant's days-from-civil algorithm (proleptic Gregorian).
// forge-lint: disable-start(divide-before-multiply)
library PeriodMath {
    uint256 internal constant SECONDS_PER_DAY = 86_400;
    uint8 internal constant MIN_DUE_DAY = 1;
    uint8 internal constant MAX_DUE_DAY = 28;

    error InvalidDueDay(uint8 dueDay);

    /// @notice Period index for a unix timestamp (seconds).
    function periodOf(uint256 timestamp) internal pure returns (uint256) {
        (uint256 year, uint256 month,) = civilFromDays(timestamp / SECONDS_PER_DAY);
        return year * 12 + (month - 1);
    }

    /// @notice Unix seconds of 00:00:00 UTC on `day` of the period's month.
    function startOfDay(uint256 period, uint256 day) internal pure returns (uint256) {
        uint256 year = period / 12;
        uint256 month = (period % 12) + 1;
        return daysFromCivil(year, month, day) * SECONDS_PER_DAY;
    }

    /// @notice Last second a payment counts as on time: 23:59:59 UTC on `dueDay`.
    function dueMoment(uint256 period, uint8 dueDay) internal pure returns (uint256) {
        if (dueDay < MIN_DUE_DAY || dueDay > MAX_DUE_DAY) revert InvalidDueDay(dueDay);
        return startOfDay(period, dueDay) + SECONDS_PER_DAY - 1;
    }

    /// @dev Days since 1970-01-01 for a civil date. Valid for years >= 1970.
    ///      Integer division before multiplication is intentional (calendar arithmetic);
    ///      correctness is covered by the civil round-trip fuzz test.
    // slither-disable-start divide-before-multiply
    function daysFromCivil(uint256 y, uint256 m, uint256 d) internal pure returns (uint256) {
        // unchecked is safe: callers pass y >= 1970 (periods come from block timestamps), m in 1..12,
        // d in 1..31, so `y - 1` cannot underflow and every product stays far below 2^256.
        unchecked {
            if (m <= 2) y -= 1;
            uint256 era = y / 400;
            uint256 yoe = y - era * 400;
            uint256 mp = m > 2 ? m - 3 : m + 9;
            uint256 doy = (153 * mp + 2) / 5 + d - 1;
            uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
            return era * 146_097 + doe - 719_468;
        }
    }

    /// @dev Civil date for days since 1970-01-01.
    function civilFromDays(uint256 z) internal pure returns (uint256 y, uint256 m, uint256 d) {
        // unchecked is safe: z is days since 1970 (< 2^40 for any realistic timestamp); all
        // subtractions are of quantities proven <= their minuend by the algorithm's construction.
        unchecked {
            z += 719_468;
            uint256 era = z / 146_097;
            uint256 doe = z - era * 146_097;
            uint256 yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
            y = yoe + era * 400;
            uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
            uint256 mp = (5 * doy + 2) / 153;
            d = doy - (153 * mp + 2) / 5 + 1;
            m = mp < 10 ? mp + 3 : mp - 9;
            if (m <= 2) y += 1;
        }
    }
    // slither-disable-end divide-before-multiply
}
// forge-lint: disable-end(divide-before-multiply)
