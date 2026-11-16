// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice What a circle writes to the reputation record (ADR 0042).
interface IReputation {
    function recordPayment(address wallet, bool onTime) external;
    function recordLoanOutcome(address wallet, bool repaid) external;
}

/// @notice The factory getters a vault reads once at construction: the reputation record, and
///         (USDT circles only) the factory's one USDT token (ADR 0046).
interface IReputationSource {
    function reputation() external view returns (address);
    function usdt() external view returns (address);
}
