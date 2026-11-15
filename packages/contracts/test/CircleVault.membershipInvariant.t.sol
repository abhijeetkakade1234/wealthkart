// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Membership} from "../src/modules/Membership.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";

/// @dev Drives random join requests, dormant proposals, payments, wakes, votes, finalizes,
///      cancels, renames and time jumps.
///      A small name pool forces collisions.
contract MembershipHandler is Test {
    CircleVault public vault;
    address[] public founders;
    address[] public candidates;
    uint256 public admittedEver;
    /// @dev Coverage counters, so a run that never reaches the dormant paths is visible.
    uint256 public dormantProposals;
    uint256 public wakes;
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
        try vault.vote(id, support) {} catch {}
    }

    /// @dev A burst: every eligible member votes the same way on one open request.
    function voteAll(uint256 idSeed, bool support) external {
        (bool found, uint256 id) = _openId(idSeed);
        if (!found) return;
        _voteAllOn(id, support);
        if (support && vault.getRequest(id).kind == Membership.Kind.Join) {
            admittedEver += vault.isMember(vault.getRequest(id).account) ? 1 : 0;
        }
    }

    function _voteAllOn(uint256 id, bool support) internal {
        for (uint256 i = 0; i < founders.length + candidates.length; ++i) {
            address voter = _anyMember(i);
            if (!vault.canVote(id, voter)) continue;
            vm.prank(voter);
            vault.vote(id, support);
        }
    }

    function finalize(uint256 idSeed) external {
        uint256 n = vault.requestCount();
        if (n == 0) return;
        try vault.finalize(idSeed % n + 1) {} catch {}
    }

    function cancel(uint256 who) external {
        vm.prank(candidates[who % candidates.length]);
        try vault.cancelJoinRequest() {} catch {}
    }

    function rename(uint256 voterSeed, uint256 nameIdx) external {
        vm.prank(_anyMember(voterSeed));
        try vault.setDisplayName(pool[nameIdx % pool.length]) {} catch {}
    }

    /// @dev Brings one member fully up to date (bounded), so some proposers stay eligible.
    function pay(uint256 seed) public {
        address who = _anyMember(seed);
        if (!vault.isMember(who)) return;
        for (uint256 i = 0; i < 24; ++i) {
            (, uint256 amount,, bool payable_) = vault.amountDue(who);
            if (!payable_) return;
            vm.deal(who, amount);
            vm.prank(who);
            vault.contribute{value: amount}();
        }
    }

    /// @dev The proposer is a diligent member: they catch up first, as the vote rules require.
    function proposeDormant(uint256 proposerSeed, uint256 targetSeed) external {
        pay(proposerSeed);
        vm.prank(_anyMember(proposerSeed));
        try vault.proposeDormant(_anyMember(targetSeed)) returns (uint256 id) {
            dormantProposals++;
            // Half the time the circle agrees at once, so wakes and dormant quorums get exercised.
            if (targetSeed % 2 == 0) {
                address target = _anyMember(targetSeed);
                for (uint256 i = 0; i < founders.length + candidates.length; ++i) {
                    if (_anyMember(i) != target) pay(i);
                }
                _voteAllOn(id, true);
            }
        } catch {}
    }

    function wake(uint256 seed) external {
        vm.prank(_anyMember(seed));
        try vault.wake() {
            wakes++;
        } catch {}
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
        (uint256[] memory ids, Membership.Request[] memory page) = vault.openRequestsPage(0, open);
        for (uint256 i = 0; i < ids.length; ++i) {
            assertEq(uint8(page[i].status), uint8(Membership.Status.Open));
            if (page[i].kind == Membership.Kind.Join) {
                assertEq(vault.openRequestOf(page[i].account), ids[i]);
            } else {
                assertEq(vault.openDormantOf(page[i].account), ids[i]);
            }
        }
    }

    /// I-12: the dormant count matches the members flagged dormant, and never exceeds members.
    function invariant_I12_dormantCountMatchesFlags() public view {
        uint256 len = vault.memberListLength();
        address[] memory all = vault.membersPage(0, len);
        uint256 dormant;
        for (uint256 i = 0; i < all.length; ++i) {
            if (vault.memberOf(all[i]).dormant) dormant++;
        }
        assertEq(vault.dormantCount(), dormant);
        assertLe(vault.dormantCount(), vault.memberCount());
    }

    /// I-13: no request ever has more votes than voters it could have had (quorum honesty,
    ///       including members who woke during a vote).
    function invariant_I13_votesNeverExceedEligible() public view {
        uint256 n = vault.requestCount();
        for (uint256 id = 1; id <= n; ++id) {
            Membership.Request memory r = vault.getRequest(id);
            assertLe(uint256(r.yes) + r.no, r.eligible);
        }
    }

    function afterInvariant() public view {
        // Not an assertion (a short run may miss them); printed with -vv for coverage checks.
        console.log("dormant proposals", handler.dormantProposals(), "wakes", handler.wakes());
    }

    function _lowerHash(string memory s) internal pure returns (bytes32) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; ++i) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) b[i] = bytes1(uint8(b[i]) + 32);
        }
        return keccak256(b);
    }
}
