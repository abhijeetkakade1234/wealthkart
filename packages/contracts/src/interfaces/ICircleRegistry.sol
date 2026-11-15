// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice The factory's registry hook, so new members see the circle in their portfolio.
interface ICircleRegistry {
    /// @notice Called by a circle the factory deployed when `member` joins it.
    function registerMember(address member) external;
}
