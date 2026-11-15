// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";

/// @dev Drives random join requests, votes, finalizes, cancels, renames and time jumps.
///      A small name pool forces collisions.
contract MembershipHandler is Test {
    CircleVault public vault;
    address[] public founders;
    address[] public candidates;
    uint256 public admittedEver;
    string[6] internal pool = ["Owl", "owl", "Comet_K", "Mango.eth", "Bunty", "NightOwl"];

    constructor(CircleVault v, address[] memory f) {
        vault = v;
        founders = f;
        for (uint256 i = 0; i < 8; ++i) {
            candidates.push(makeAddr(string.concat("candidate", vm.toString(i))));
        }
    }

    function request(uint256 who, uint256 nameIdx) external {
        vm.prank(candidates[who % candidates.length]);
        try vault.requestToJoin(pool[nameIdx % pool.length], founders[0]) {} catch {}
    }

    function vote(uint256 voterSeed, uint256 idSeed, bool support) external {
        (bool found, uint256 id) = _openId(idSeed);
        if (!found) return;
        vm.prank(_anyMember(voterSeed));
        try vault.voteOnJoin(id, support) {} catch {}
    }

    /// @dev A burst: every eligible member votes the same way on one open request.
    function voteAll(uint256 idSeed, bool support) external {
        (bool found, uint256 id) = _openId(idSeed);
        if (!found) return;
        for (uint256 i = 0; i < founders.length + candidates.length; ++i) {
            address voter = _anyMember(i);
            if (!vault.canVote(id, voter)) continue;
            vm.prank(voter);
            vault.voteOnJoin(id, support);
        }
        if (support) admittedEver += vault.isMember(vault.getRequest(id).applicant) ? 1 : 0;
    }

    function finalize(uint256 idSeed) external {
        uint256 n = vault.requestCount();
        if (n == 0) return;
        try vault.finalizeJoin(idSeed % n + 1) {} catch {}
    }

    function cancel(uint256 who) external {
        vm.prank(candidates[who % candidates.length]);
        try vault.cancelJoinRequest() {} catch {}
    }

    function rename(uint256 voterSeed, uint256 nameIdx) external {
        vm.prank(_anyMember(voterSeed));
        try vault.setDisplayName(pool[nameIdx % pool.length]) {} catch {}
    }

    function warp(uint256 secondsAhead) external {
        vm.warp(block.timestamp + bound(secondsAhead, 1 minutes, 40 days));
    }

    function candidateCount() external view returns (uint256) {
        return candidates.length;
    }

    function _openId(uint256 seed) internal view returns (bool, uint256) {
        uint256 open = vault.openRequestCount();
        if (open == 0) return (false, 0);
        (uint256[] memory ids,) = vault.openRequestsPage(seed % open, 1);
        return (true, ids[0]);
    }

    function _anyMember(uint256 seed) internal view returns (address) {
        uint256 total = founders.length + candidates.length;
        uint256 i = seed % total;
        return i < founders.length ? founders[i] : candidates[i - founders.length];
    }
}

contract CircleVaultMembershipInvariantTest is CircleVaultBase {
    MembershipHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new MembershipHandler(vault, members);
        targetContract(address(handler));
    }

    /// I-9: members = 12 founders + admitted candidates; the list never holds duplicates.
    function invariant_I9_memberCountIsFoundersPlusAdmitted() public view {
        uint256 admitted;
        for (uint256 i = 0; i < handler.candidateCount(); ++i) {
            if (vault.isMember(handler.candidates(i))) admitted++;
        }
        assertEq(vault.memberCount(), members.length + admitted);
        assertEq(vault.memberListLength(), vault.memberCount());
    }

    /// I-10: a name in use maps back to exactly the member who uses it.
    function invariant_I10_nameMapsToExactlyOneMember() public view {
        uint256 len = vault.memberListLength();
        address[] memory all = vault.membersPage(0, len);
        for (uint256 i = 0; i < all.length; ++i) {
            string memory n = vault.nameOf(all[i]);
            if (bytes(n).length == 0) continue;
            assertEq(vault.memberByName(n), all[i]);
            for (uint256 j = i + 1; j < all.length; ++j) {
                string memory other = vault.nameOf(all[j]);
                if (bytes(other).length == 0) continue;
                assertTrue(_lowerHash(n) != _lowerHash(other));
            }
        }
    }

    /// I-11: the open-request index stays bounded and consistent.
    function invariant_I11_openRequestsBoundedAndConsistent() public view {
        uint256 open = vault.openRequestCount();
        assertLe(open, vault.MAX_OPEN_REQUESTS());
        (uint256[] memory ids, CircleVault.JoinRequest[] memory page) =
            vault.openRequestsPage(0, open);
        for (uint256 i = 0; i < ids.length; ++i) {
            assertEq(uint8(page[i].status), uint8(CircleVault.JoinStatus.Open));
            assertEq(vault.openRequestOf(page[i].applicant), ids[i]);
        }
    }

    function _lowerHash(string memory s) internal pure returns (bytes32) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; ++i) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) b[i] = bytes1(uint8(b[i]) + 32);
        }
        return keccak256(b);
    }
}
