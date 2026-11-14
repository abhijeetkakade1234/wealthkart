// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PeriodMath} from "./PeriodMath.sol";

/// @title FeeMath
/// @notice Late fees on missed installments (G1 rules 6-8, ADR 0009) with payment holidays (ADR 0017).
/// @dev Mirrors `packages/rules/src/fees.ts`. Evaluated lazily at time `at`.
library FeeMath {
    /// @param period The installment's period.
    /// @param holiday Whether a payment holiday was declared for that period.
    /// @param at The time the fee is evaluated (payment time or now).
    function lateFees(
        uint256 period,
        bool holiday,
        uint256 at,
        uint8 dueDay,
        uint8 secondFeeDay,
        uint256 fee1,
        uint256 fee2
    ) internal pure returns (uint256 fees) {
        // A holiday moves both deadlines to the next period's dates.
        uint256 p = holiday ? period + 1 : period;
        if (at > PeriodMath.dueMoment(p, dueDay)) fees += fee1;
        if (at > PeriodMath.dueMoment(p, secondFeeDay)) fees += fee2;
    }
}
