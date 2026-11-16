// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CircleVault} from "./CircleVault.sol";
import {ICircleRegistry} from "./interfaces/ICircleRegistry.sol";
import {CodeStore} from "./libraries/CodeStore.sol";
import {Reputation} from "./Reputation.sol";

/// @title CircleFactory
/// @notice Deploys immutable CircleVaults and keeps a registry of each member's circles.
/// @dev Each vault is a full, independent contract (no proxies, ADR 0020). The vault's creation
///      code lives in immutable data contracts written once at construction (ADR 0037), so the
///      factory stays small however big the vault grows. One wallet can belong to many circles
///      (ADR 0005).
///      The creator is registered at creation. Invited founders and admitted members are
///      registered by their circle (`registerMember`) only once they actually join (ADR 0028),
///      so nobody sees a circle they never agreed to be in (RT-02).
contract CircleFactory is ICircleRegistry {
    /// @notice keccak256 of the vault creation code every circle is deployed from. Anyone can
    ///         compare it with the audited build.
    bytes32 public immutable vaultCodeHash;
    /// @notice The soulbound track record every circle of this factory writes to (Phase 3).
    Reputation public immutable reputation;
    /// @dev Data contracts holding the vault creation code, in order.
    address[] internal _vaultCode;

    address[] internal _circles;
    mapping(address member => address[]) internal _circlesOf;
    /// @notice True for every vault this factory deployed.
    mapping(address circle => bool) public isCircle;

    event CircleCreated(address indexed circle, address indexed creator, uint256 invitedFounders);
    event MemberRegistered(address indexed circle, address indexed member);

    error NotACircle(address caller);
    error EmptyVaultCode();

    /// @param vaultCreationCode `type(CircleVault).creationCode`, linked to its libraries.
    constructor(bytes memory vaultCreationCode) {
        if (vaultCreationCode.length == 0) revert EmptyVaultCode();
        vaultCodeHash = keccak256(vaultCreationCode);
        _vaultCode = CodeStore.write(vaultCreationCode);
        reputation = new Reputation(address(this));
    }

    /// @notice Create a circle. You become its first member; `invitees` must each accept.
    /// @param cfg Circle settings (bounds enforced by the vault).
    /// @param invitees Other founders to invite (may be empty, max 199).
    function createCircle(CircleVault.Config calldata cfg, address[] calldata invitees)
        external
        returns (address circle)
    {
        // slither-disable-next-line encode-packed-collision (creation code + ABI args, never hashed)
        bytes memory code =
            abi.encodePacked(CodeStore.read(_vaultCode), abi.encode(cfg, msg.sender, invitees));
        // Data-contract code store (ADR 0037): assembly is the only way to CREATE from bytes.
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            circle := create(0, add(code, 0x20), mload(code))
            // Bubble the vault's own error (e.g. InvalidConfig) up to the caller.
            if iszero(circle) {
                let p := mload(0x40)
                returndatacopy(p, 0, returndatasize())
                revert(p, returndatasize())
            }
        }
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
