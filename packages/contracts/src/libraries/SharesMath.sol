// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title SharesMath
/// @notice Share / NAV conversions for circle vaults (ADR 0006).
/// @dev Mirrors `packages/rules/src/shares.ts`. Virtual shares/assets defend against the
///      first-depositor inflation attack (S-MATH-01). All rounding is down, which favours the
///      vault. `totalAssets` must come from internal accounting, never `address(this).balance`.
library SharesMath {
    uint256 internal constant VIRTUAL_SHARES = 1e6;
    uint256 internal constant VIRTUAL_ASSETS = 1;

    function sharesForDeposit(uint256 assets, uint256 totalAssets, uint256 totalShares)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(assets, totalShares + VIRTUAL_SHARES, totalAssets + VIRTUAL_ASSETS);
    }

    function assetsForShares(uint256 shares, uint256 totalAssets, uint256 totalShares)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(shares, totalAssets + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);
    }
}
