// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CircleVault} from "./CircleVault.sol";

/// @title CircleFactory
/// @notice Deploys immutable CircleVaults and keeps a registry of each member's circles.
/// @dev Deploys with `new` (no proxies, ADR 0020). One wallet can belong to many circles (ADR 0005).
///      The registry loop runs once per founder at creation and is bounded by MAX_FOUNDERS.
contract CircleFactory {
    address[] internal _circles;
    mapping(address member => address[]) internal _circlesOf;

    event CircleCreated(address indexed circle, address indexed creator, uint256 founders);

    function createCircle(CircleVault.Config calldata cfg, address[] calldata founders)
        external
        returns (address circle)
    {
        circle = address(new CircleVault(cfg, founders));
        _circles.push(circle);
        for (uint256 i = 0; i < founders.length; ++i) {
            _circlesOf[founders[i]].push(circle);
        }
        emit CircleCreated(circle, msg.sender, founders.length);
    }

    function circleCount() external view returns (uint256) {
        return _circles.length;
    }

    /// @notice Paginated list of all circles.
    function circles(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        return _slice(_circles, offset, limit);
    }

    /// @notice Paginated list of circles a wallet was registered in at creation.
    function circlesOf(address member, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        return _slice(_circlesOf[member], offset, limit);
    }

    function circlesOfCount(address member) external view returns (uint256) {
        return _circlesOf[member].length;
    }

    function _slice(address[] storage arr, uint256 offset, uint256 limit)
        internal
        view
        returns (address[] memory page)
    {
        uint256 len = arr.length;
        if (offset >= len) return new address[](0);
        uint256 end = offset + limit > len ? len : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = arr[i];
        }
    }
}
