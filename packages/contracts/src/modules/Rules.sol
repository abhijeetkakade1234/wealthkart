// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Rules
/// @notice The circle settings that a member vote can change later (ADR 0022, 0019, 0037): loans,
///         exits and governance. Logic is fixed in code; only these numbers vary, each inside
///         bounds checked here, at creation and on every change.
/// @dev External library (linked). Stored in the vault so Governance can update them after the
///      rule-change delay. Percentages are basis points (1% = 100).
library Rules {
    struct Params {
        // ---- loans (PLAN.md §3, rules 11-18)
        /// @dev Interest per month, bps: 0..500 (0-5%).
        uint16 interestBps;
        /// @dev Tenor length in months (rule 15): 1..24.
        uint8 tenorMonths;
        /// @dev Monthly rate for tenors 2 and 3 (step-ups), bps: each >= interestBps, <= 1000.
        uint16 tenor2Bps;
        uint16 tenor3Bps;
        /// @dev Cash kept back from lending (rule 12), bps of total assets: 0..8000.
        uint16 reserveBps;
        /// @dev Max loan per member (rule 13), bps of total assets: 100..10000.
        uint16 maxLoanBps;
        /// @dev Loan cap vs (own stake + guarantor stake) (ADR 0018): 1..10.
        uint8 kMultiplier;
        /// @dev Charge one month's interest even if repaid early (rule 17).
        bool minInterestMonth;
        /// @dev Medical loans (rule 18): cap in wei (0 = no medical loans) and free months 0..12.
        uint128 medicalCap;
        uint8 medicalFreeMonths;
        /// @dev Rule 11.
        bool guarantorRequired;
        /// @dev Late fee per month of unpaid interest, wei; at most half the installment.
        uint128 interestFee;
        /// @dev Missed interest months before default: 1..6.
        uint8 defaultAfter;
        /// @dev Members needed before loans are allowed: >= 3.
        uint8 minMembersForLoans;
        // ---- voting
        /// @dev Pass mark for loans, rule changes and waivers, % of votes cast (strictly more
        ///      than half at 50): 50..100.
        uint8 passPct;
        /// @dev Pass mark to dissolve (ADR 0021): 50..100.
        uint8 dissolvePassPct;
        /// @dev Days between a rule change passing and taking effect (ADR 0019): 3..30.
        uint8 ruleChangeDelayDays;
        // ---- exits
        /// @dev Notice before an exit is paid, days: 0..90.
        uint16 exitNoticeDays;
        /// @dev Exit fee kept by the circle, bps: 0..1000.
        uint16 exitFeeBps;
    }

    error InvalidRule(string reason);

    /// @notice G1-like defaults (PLAN.md §3). `installment` sizes the fee default.
    function defaults(uint128 installment) internal pure returns (Params memory p) {
        p = Params({
            interestBps: 100,
            tenorMonths: 6,
            tenor2Bps: 150,
            tenor3Bps: 200,
            reserveBps: 2000,
            maxLoanBps: 4000,
            kMultiplier: 2,
            minInterestMonth: true,
            medicalCap: 0,
            medicalFreeMonths: 3,
            guarantorRequired: false,
            interestFee: installment / 50,
            defaultAfter: 2,
            minMembersForLoans: 3,
            passPct: 50,
            dissolvePassPct: 66,
            ruleChangeDelayDays: 7,
            exitNoticeDays: 30,
            exitFeeBps: 0
        });
    }

    /// @notice Reverts with a plain reason unless every setting is inside its bounds.
    function validate(Params calldata p, uint128 installment) external pure {
        if (p.interestBps > 500) revert InvalidRule("interest must be 0-5% a month");
        if (p.tenorMonths < 1 || p.tenorMonths > 24) {
            revert InvalidRule("tenor must be 1-24 months");
        }
        if (p.tenor2Bps < p.interestBps || p.tenor3Bps < p.tenor2Bps || p.tenor3Bps > 1000) {
            revert InvalidRule("tenor rates must step up and stay at or below 10%");
        }
        if (p.reserveBps > 8000) revert InvalidRule("reserve must be 0-80%");
        if (p.maxLoanBps < 100 || p.maxLoanBps > 10_000) {
            revert InvalidRule("max loan must be 1-100% of the fund");
        }
        if (p.kMultiplier < 1 || p.kMultiplier > 10) revert InvalidRule("k must be 1-10");
        if (p.medicalFreeMonths > 12) revert InvalidRule("medical free months must be 0-12");
        if (uint256(p.interestFee) * 2 > installment) {
            revert InvalidRule("interest late fee must be at most half the installment");
        }
        if (p.defaultAfter < 1 || p.defaultAfter > 6) {
            revert InvalidRule("default after 1-6 months");
        }
        if (p.minMembersForLoans < 3) revert InvalidRule("loans need at least 3 members");
        if (p.passPct < 50 || p.passPct > 100) revert InvalidRule("pass mark must be 50-100%");
        if (p.dissolvePassPct < 50 || p.dissolvePassPct > 100) {
            revert InvalidRule("dissolve pass mark must be 50-100%");
        }
        if (p.ruleChangeDelayDays < 3 || p.ruleChangeDelayDays > 30) {
            revert InvalidRule("rule-change delay must be 3-30 days");
        }
        if (p.exitNoticeDays > 90) revert InvalidRule("exit notice must be 0-90 days");
        if (p.exitFeeBps > 1000) revert InvalidRule("exit fee must be 0-10%");
    }

    /// @notice True if `yes` of `total` meets the pass mark: strictly more than half at 50%,
    ///         otherwise at least `pct`.
    function passes(uint256 yes, uint256 total, uint8 pct) internal pure returns (bool) {
        if (total == 0) return false;
        return pct == 50 ? yes * 100 > 50 * total : yes * 100 >= uint256(pct) * total;
    }
}
