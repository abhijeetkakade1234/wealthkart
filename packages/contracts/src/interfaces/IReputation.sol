// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice What a circle writes to the reputation record (ADR 0042).
interface IReputation {
    function recordPayment(address wallet, bool onTime) external;
    function recordLoanOutcome(address wallet, bool repaid) external;
}

/// @notice The factory getter a vault reads once at construction to find the record.
interface IReputationSource {
    function reputation() external view returns (address);
}
