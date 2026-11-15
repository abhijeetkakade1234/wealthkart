// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CircleVault} from "./CircleVault.sol";
import {ICircleRegistry} from "./interfaces/ICircleRegistry.sol";

/// @title CircleFactory
/// @notice Deploys immutable CircleVaults and keeps a registry of each member's circles.
/// @dev Deploys with `new` (no proxies, ADR 0020). One wallet can belong to many circles (ADR 0005).
///      The creator is registered at creation. Invited founders and admitted members are
///      registered by their circle (`registerMember`) only once they actually join (ADR 0028),
///      so nobody sees a circle they never agreed to be in (RT-02).
contract CircleFactory is ICircleRegistry {
    address[] internal _circles;
    mapping(address member => address[]) internal _circlesOf;
    /// @notice True for every vault this factory deployed.
    mapping(address circle => bool) public isCircle;

    event CircleCreated(address indexed circle, address indexed creator, uint256 invitedFounders);
    event MemberRegistered(address indexed circle, address indexed member);

    error NotACircle(address caller);

    /// @notice Create a circle. You become its first member; `invitees` must each accept.
    /// @param cfg Circle settings (bounds enforced by the vault).
    /// @param invitees Other founders to invite (may be empty, max 199).
    function createCircle(CircleVault.Config calldata cfg, address[] calldata invitees)
        external
        returns (address circle)
    {
        circle = address(new CircleVault(cfg, msg.sender, invitees));
        isCircle[circle] = true;
        _circles.push(circle);
        _circlesOf[msg.sender].push(circle);
        emit CircleCreated(circle, msg.sender, invitees.length);
        emit MemberRegistered(circle, msg.sender);
    }

    /// @notice Called by a circle this factory deployed when it admits a new member.
    function registerMember(address member) external override {
        if (!isCircle[msg.sender]) revert NotACircle(msg.sender);
        _circlesOf[member].push(msg.sender);
        emit MemberRegistered(msg.sender, member);
    }

    function circleCount() external view returns (uint256) {
        return _circles.length;
    }

    /// @notice Paginated list of all circles.
    function circles(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        return _slice(_circles, offset, limit);
    }

    /// @notice Paginated list of circles a wallet belongs to (founded or admitted).
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
