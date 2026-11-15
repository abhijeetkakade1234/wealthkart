// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Membership} from "../src/modules/Membership.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";

/// @notice Red-team leftovers for membership (ADR 0033): voting rights after N payments (RT-03),
///         per-member open-request cap (RT-03, RT-05), safe circle names (RT-26).
///         12 founders; members admitted by vote need 2 paid installments to vote.
contract CircleVaultRedTeamTest is CircleVaultBase {
    // ---------------------------------------------------------------- S-RT-05 (RT-03)

    function test_S_RT_05_newMemberVotesOnlyAfterNPaymentsAndOnlyOnLaterRequests() public {
        address sybil = makeAddr("sybil");
        vm.deal(sybil, FUNDS);
        _admit(sybil, "Comet_Brother");
        assertFalse(vault.memberOf(sybil).voter);
        assertEq(vault.voterCount(), 12); // the newcomer isn't in any quorum yet

        // A request opened now: the newcomer can't vote on it, today or later.
        vm.prank(outsider);
        uint256 before = vault.requestToJoin("Outsider", address(0));
        assertEq(vault.getRequest(before).eligible, 12);
        assertFalse(vault.canVote(before, sybil));

        _pay(sybil); // December
        assertFalse(vault.memberOf(sybil).voter);
        _warpTo(2027, 1, 5, 12, 0, 0);
        vm.expectEmit(address(vault));
        emit Membership.VotingRightsGranted(sybil);
        _pay(sybil); // January: second installment
        assertTrue(vault.memberOf(sybil).voter);
        assertEq(vault.voterCount(), 13);
        assertFalse(vault.canVote(before, sybil)); // snapshot: still not on the old request

        address later = makeAddr("later");
        vm.prank(later);
        uint256 next = vault.requestToJoin("Later", address(0));
        assertEq(vault.getRequest(next).eligible, 13);
        assertTrue(vault.canVote(next, sybil));
    }

    function test_S_RT_05_foundersVoteFromTheStart() public view {
        for (uint256 i = 0; i < members.length; ++i) {
            assertTrue(vault.memberOf(members[i]).voter);
        }
        assertEq(vault.voterCount(), 12);
    }

    function test_S_RT_05_zeroSettingGivesVotesOnAdmission() public {
        CircleVault.Config memory c = _cfg();
        c.minPaidToVote = 0;
        address[] memory f = new address[](3);
        f[0] = honest;
        f[1] = late;
        f[2] = members[2];
        CircleVault v = _createCircle(c, f);
        vm.prank(outsider);
        uint256 id = v.requestToJoin("Newcomer", address(0));
        for (uint256 i = 0; i < 2; ++i) {
            vm.prank(f[i]); // 2 of 3 yes is 66.7%: settles on the second vote
            v.vote(id, true);
        }
        assertTrue(v.memberOf(outsider).voter);
        assertEq(v.voterCount(), 4);
    }

    function test_S_RT_05_votingRightsSurviveDormancyAndComeBackOnWake() public {
        address m = makeAddr("newbie");
        vm.deal(m, FUNDS);
        _admit(m, "Newbie");
        _pay(m);
        _warpTo(2027, 1, 5, 12, 0, 0);
        _pay(m);
        assertTrue(vault.memberOf(m).voter);
        assertEq(vault.voterCount(), 13);
        // Feb, Mar, Apr missed; the rest keep paying.
        for (uint256 month = 2; month <= 4; ++month) {
            _warpTo(2027, month, 5, 12, 0, 0);
            for (uint256 i = 0; i < members.length; ++i) {
                (,,, bool due) = vault.amountDue(members[i]);
                while (due) {
                    _pay(members[i]);
                    (,,, due) = vault.amountDue(members[i]);
                }
            }
        }
        _warpTo(2027, 4, 11, 12, 0, 0);
        vm.prank(honest);
        uint256 id = vault.proposeDormant(m);
        assertEq(vault.getRequest(id).eligible, 12); // 13 voters minus the member
        _votes(id, 1, members.length, true);
        assertTrue(vault.memberOf(m).dormant);
        assertEq(vault.voterCount(), 12);

        vm.prank(m);
        vault.wake();
        assertTrue(vault.memberOf(m).voter);
        assertEq(vault.voterCount(), 13);
    }

    // ---------------------------------------------------------------- S-RT-06 / S-RT-08

    function test_S_RT_06_oneMemberCanHaveAtMostThreeOpenInvites() public {
        for (uint256 i = 0; i < 3; ++i) {
            vm.prank(makeAddr(string.concat("alt", vm.toString(i))));
            vault.requestToJoin(string.concat("Alt", vm.toString(i)), honest);
        }
        assertEq(vault.openRequestsBy(honest), 3);
        address fourth = makeAddr("alt3");
        vm.prank(fourth);
        vm.expectRevert(abi.encodeWithSelector(Membership.TooManyOpenRequestsBy.selector, honest));
        vault.requestToJoin("Alt3", honest);

        // Naming someone else, or nobody, still works.
        vm.prank(fourth);
        vault.requestToJoin("Alt3", late);
        assertEq(vault.openRequestsBy(late), 1);

        // Closing one frees a slot.
        vm.prank(makeAddr("alt0"));
        vault.cancelJoinRequest();
        assertEq(vault.openRequestsBy(honest), 2);
    }

    function test_S_RT_06_admittedViaCountsConfirmedInvitesOnly() public {
        _admit(makeAddr("friendA"), "FriendA"); // honest named and voted yes
        assertEq(vault.admittedVia(honest), 1);

        // Names `late` as inviter, but `late` never votes yes: not counted.
        address b = makeAddr("friendB");
        vm.prank(b);
        uint256 id = vault.requestToJoin("FriendB", late);
        for (uint256 i = 2; i < 12; ++i) {
            if (!vault.canVote(id, members[i])) continue;
            vm.prank(members[i]);
            vault.vote(id, true);
        }
        assertTrue(vault.isMember(b));
        assertEq(vault.admittedVia(late), 0);
    }

    // ---------------------------------------------------------------- S-RT-34 (RT-26)

    function test_S_RT_34_circleNamesCannotCarryLinks() public {
        address[] memory one = new address[](1);
        one[0] = honest;
        CircleVault.Config memory c = _cfg();
        string[6] memory bad = [
            "Claim refund: wealthkart-help.app",
            "www.core-support",
            "https://evil",
            "Core Support.io",
            "  spaced",
            "ab"
        ];
        for (uint256 i = 0; i < bad.length; ++i) {
            c.name = bad[i];
            vm.expectRevert(abi.encodeWithSelector(CircleVault.InvalidConfig.selector, NAME_RULE));
            factory.createCircle(c, one);
        }
        string[3] memory good = ["College Gang", "Abhi's Circle", "Friends & Family-2"];
        for (uint256 i = 0; i < good.length; ++i) {
            c.name = good[i];
            factory.createCircle(c, one);
        }
    }

    function test_S_RT_34_minPaidToVoteBound() public {
        address[] memory one = new address[](1);
        one[0] = honest;
        CircleVault.Config memory c = _cfg();
        c.minPaidToVote = 7;
        vm.expectRevert(
            abi.encodeWithSelector(CircleVault.InvalidConfig.selector, "minPaidToVote must be 0..6")
        );
        factory.createCircle(c, one);
    }
}
