// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Membership} from "../src/modules/Membership.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";

/// @notice Membership scenarios (S-MEM-*, S-RT-*): founder invites, join requests and votes,
///         display names. 12 members, 50% quorum, 66% yes of votes cast to admit.
contract CircleVaultMembershipTest is CircleVaultBase {
    // ---------------------------------------------------------------- founders (RT-02)

    function test_S_RT_03_invitedFoundersAreNotMembersUntilTheyAccept() public {
        address[] memory f = new address[](4);
        f[0] = honest;
        f[1] = makeAddr("friendA");
        f[2] = makeAddr("friendB");
        f[3] = makeAddr("friendC");
        CircleVault v = _createCircleNoAccept(_cfg(), f);

        assertEq(v.creator(), honest);
        assertEq(v.memberCount(), 1);
        assertFalse(v.isMember(f[1]));
        assertEq(factory.circlesOfCount(f[1]), 0); // no ghost circles in portfolios
        assertGt(v.founderInviteExpiry(f[1]), 0);

        vm.prank(f[1]);
        v.acceptInvite();
        assertTrue(v.isMember(f[1]));
        assertEq(v.memberCount(), 2);
        assertEq(factory.circlesOfCount(f[1]), 1);
        assertEq(v.founderInviteExpiry(f[1]), 0);

        vm.prank(f[2]);
        v.declineInvite();
        vm.prank(f[2]);
        vm.expectRevert(Membership.NoFounderInvite.selector);
        v.acceptInvite();
        assertEq(v.memberCount(), 2);
    }

    function test_S_MEM_02_S_RT_04_founderInviteExpiresAfter14Days() public {
        address[] memory f = new address[](2);
        f[0] = honest;
        f[1] = makeAddr("slowFriend");
        CircleVault v = _createCircleNoAccept(_cfg(), f);
        uint256 expiry = v.founderInviteExpiry(f[1]);

        vm.warp(expiry + 1);
        vm.prank(f[1]);
        vm.expectRevert(abi.encodeWithSelector(Membership.FounderInviteExpired.selector, expiry));
        v.acceptInvite();
        assertEq(factory.circlesOfCount(f[1]), 0);

        // Still welcome through the normal route: the expired invite is cleared.
        vm.prank(f[1]);
        v.requestToJoin("SlowFriend", honest);
        assertEq(v.founderInviteExpiry(f[1]), 0);
    }

    function test_liveFounderInviteMustBeAcceptedNotRequested() public {
        address[] memory f = new address[](2);
        f[0] = honest;
        f[1] = makeAddr("friend");
        CircleVault v = _createCircleNoAccept(_cfg(), f);
        vm.prank(f[1]);
        vm.expectRevert(abi.encodeWithSelector(Membership.AlreadyMember.selector, f[1]));
        v.requestToJoin("Friend", address(0));
    }

    // ---------------------------------------------------------------- join and vote

    function test_S_MEM_01_joinRequestPassesAndNewcomerIsAMember() public {
        uint256 id = _request(outsider, "Comet_K");
        Membership.Request memory r = vault.getRequest(id);
        assertEq(r.account, outsider);
        assertEq(r.invitedBy, honest);
        assertEq(r.eligible, 12);
        assertEq(uint8(r.status), uint8(Membership.Status.Open));
        assertEq(vault.openRequestOf(outsider), id);

        _votes(id, 0, 12, true); // settles on the 8th yes (8/12 = 66.7%)
        assertTrue(vault.isMember(outsider));
        assertEq(vault.memberCount(), 13);
        assertEq(vault.nameOf(outsider), "Comet_K");
        assertEq(vault.memberByName("comet_k"), outsider); // case-insensitive
        assertEq(factory.circlesOfCount(outsider), 1);
        assertEq(vault.openRequestCount(), 0);
        assertEq(vault.getRequest(id).yes, 8);
        assertEq(uint8(vault.getRequest(id).status), uint8(Membership.Status.Approved));
    }

    function test_S_MEM_01_rejectedOnceYesCanNoLongerReach66Percent() public {
        uint256 id = _request(outsider, "Comet_K");
        _votes(id, 0, 4, false);
        assertEq(uint8(vault.getRequest(id).status), uint8(Membership.Status.Open));
        _votes(id, 4, 5, false); // 5 no: at most 7/12 = 58% yes
        assertEq(uint8(vault.getRequest(id).status), uint8(Membership.Status.Rejected));
        assertFalse(vault.isMember(outsider));
        assertTrue(vault.isNameAvailable("Comet_K", attacker));
        assertEq(vault.openRequestOf(outsider), 0);
    }

    function test_S_RT_06_sixtyPercentYesFailsAndSeventyPasses() public {
        uint256 id = _request(outsider, "Comet_K");
        _votes(id, 0, 6, true);
        _votes(id, 6, 10, false); // 6 yes, 4 no: quorum met, 60% yes
        vm.expectRevert(abi.encodeWithSelector(Membership.NotDecidedYet.selector, id));
        vault.finalize(id);
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalize(id);
        assertEq(uint8(vault.getRequest(id).status), uint8(Membership.Status.Rejected));

        uint256 id2 = _request(attacker, "Mango.eth");
        _votes(id2, 0, 7, true);
        _votes(id2, 7, 10, false); // 7 yes, 3 no: 70%
        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(outsider); // anyone can finalize
        vault.finalize(id2);
        assertTrue(vault.isMember(attacker));
    }

    function test_S_MEM_13_windowEndsWithoutQuorumExpires() public {
        uint256 id = _request(outsider, "Comet_K");
        _votes(id, 0, 5, true); // 5 of 12 < 50% quorum
        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(members[6]);
        vm.expectRevert(abi.encodeWithSelector(Membership.VotingClosed.selector, id));
        vault.vote(id, true);
        vault.finalize(id);
        assertEq(uint8(vault.getRequest(id).status), uint8(Membership.Status.Expired));
        assertFalse(vault.isMember(outsider));
    }

    function test_S_MEM_12_onlyEarlierMembersCanVoteOnceEach() public {
        uint256 id = _request(outsider, "Comet_K");

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotEligibleToVote.selector, id, attacker));
        vault.vote(id, true);

        vm.prank(outsider); // the applicant
        vm.expectRevert(abi.encodeWithSelector(Membership.NotEligibleToVote.selector, id, outsider));
        vault.vote(id, true);

        vm.prank(honest);
        vault.vote(id, true);
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Membership.AlreadyVoted.selector, id));
        vault.vote(id, false);

        // Someone admitted while this request is open can't vote on it (snapshot).
        address newcomer = makeAddr("newcomer");
        _admit(newcomer, "Newcomer");
        assertFalse(vault.canVote(id, newcomer));
        vm.prank(newcomer);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotEligibleToVote.selector, id, newcomer));
        vault.vote(id, true);
    }

    function test_S_RT_11_memberTwoPeriodsBehindCannotVoteUntilPaidUp() public {
        // honest pays Dec and Jan; late pays nothing.
        _pay(honest);
        _warpTo(2027, 1, 5, 0, 0, 0);
        _pay(honest);
        _warpTo(2027, 2, 2, 0, 0, 0);

        uint256 id = _request(outsider, "Comet_K");
        assertTrue(vault.canVote(id, honest));
        assertFalse(vault.canVote(id, late)); // owes Dec and Jan
        vm.prank(late);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotEligibleToVote.selector, id, late));
        vault.vote(id, true);

        _pay(late); // Dec; Jan still owed = 1 behind, allowed
        assertTrue(vault.canVote(id, late));
        vm.prank(late);
        vault.vote(id, true);
    }

    function test_S_MEM_17_invitedByMustBeAMember() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Membership.InvitedByNotAMember.selector, attacker));
        vault.requestToJoin("Comet_K", attacker);

        vm.prank(outsider);
        uint256 id = vault.requestToJoin("Comet_K", address(0)); // nobody vouching is allowed
        assertEq(vault.getRequest(id).invitedBy, address(0));
    }

    /// Red-team A-01: naming a member as inviter is only a claim until they vote yes.
    function test_S_MEM_17_inviterClaimIsConfirmedOnlyByTheInvitersYesVote() public {
        uint256 id = _request(outsider, "Comet_K"); // claims honest invited them
        assertFalse(vault.getRequest(id).inviterConfirmed);
        vm.prank(late);
        vault.vote(id, true);
        assertFalse(vault.getRequest(id).inviterConfirmed);
        vm.prank(honest);
        vault.vote(id, true);
        assertTrue(vault.getRequest(id).inviterConfirmed);
    }

    function test_memberCannotRequestToJoin() public {
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Membership.AlreadyMember.selector, honest));
        vault.requestToJoin("Honest", address(0));
    }

    // ---------------------------------------------------------------- spam and limits (RT-05)

    function test_S_RT_08_oneOpenRequestPerAddressAndAGlobalCap() public {
        uint256 id = _request(outsider, "Comet_K");
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Membership.RequestAlreadyOpen.selector, id));
        vault.requestToJoin("Comet_K2", honest);

        // Fill the remaining 19 slots (no inviter named, so the per-member cap doesn't apply).
        for (uint256 i = 0; i < 19; ++i) {
            vm.prank(makeAddr(string.concat("spam", vm.toString(i))));
            vault.requestToJoin(string.concat("spam", vm.toString(i)), address(0));
        }
        assertEq(vault.openRequestCount(), 20);
        vm.prank(attacker);
        vm.expectRevert(Membership.TooManyOpenRequests.selector);
        vault.requestToJoin("Mango.eth", honest);

        // Expired requests leave the open list once anyone finalizes them.
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalize(id);
        assertEq(vault.openRequestCount(), 19);
        (uint256[] memory ids, Membership.Request[] memory page) = vault.openRequestsPage(0, 5);
        assertEq(ids.length, 5);
        assertEq(page.length, 5);
        (uint256[] memory none,) = vault.openRequestsPage(19, 5);
        assertEq(none.length, 0);
    }

    function test_S_MEM_14_applicantCanCancel() public {
        uint256 id = _request(outsider, "Comet_K");
        vm.prank(outsider);
        vault.cancelJoinRequest();
        assertEq(uint8(vault.getRequest(id).status), uint8(Membership.Status.Cancelled));
        assertEq(vault.openRequestCount(), 0);
        vm.prank(outsider);
        vm.expectRevert(Membership.NoOpenRequest.selector);
        vault.cancelJoinRequest();
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Membership.RequestNotOpen.selector, id));
        vault.vote(id, true);
        // and can ask again later
        _request(outsider, "Comet_K");
    }

    function test_S_RT_16_secondApprovalWhenFullClosesAsFull() public {
        CircleVault.Config memory c = _cfg();
        c.maxMembers = 13;
        vault = _createCircle(c, members);
        uint256 a = _request(outsider, "Comet_K");
        uint256 b = _request(attacker, "Mango.eth");
        _votes(a, 0, 12, true);
        assertEq(vault.memberCount(), 13);
        _votes(b, 0, 12, true);
        assertEq(uint8(vault.getRequest(b).status), uint8(Membership.Status.Full));
        assertFalse(vault.isMember(attacker));

        vm.prank(makeAddr("late arrival"));
        vm.expectRevert(abi.encodeWithSelector(Membership.CircleFull.selector, 13));
        vault.requestToJoin("LateArrival", honest);
    }

    // ---------------------------------------------------------------- first period (RT-09)

    function test_S_RT_15_admittedAfterDueDayOwesFromNextMonthWithoutFees() public {
        _warpTo(2026, 12, 15, 12, 0, 0);
        _admit(outsider, "Comet_K");
        (uint256 period,, uint256 fees, bool due) = vault.amountDue(outsider);
        assertEq(period, DEC_2026 + 1);
        assertEq(fees, 0);
        assertFalse(due);
    }

    function test_admittedBeforeDueDayOwesThisMonth() public {
        _warpTo(2026, 12, 5, 0, 0, 0);
        _admit(outsider, "Comet_K");
        (uint256 period,, uint256 fees, bool due) = vault.amountDue(outsider);
        assertEq(period, DEC_2026);
        assertEq(fees, 0);
        assertTrue(due);
    }

    function test_S_MEM_03_lateJoinerBuysInAtNavWithoutDilutingOthers() public {
        // Three months of payments, some late, so NAV per share is above 1.
        for (uint256 m = 0; m < 3; ++m) {
            _warpTo(2026 + (11 + m) / 12, (11 + m) % 12 + 1, 15, 0, 0, 0);
            for (uint256 i = 0; i < 12; ++i) {
                _pay(members[i]);
            }
        }
        _warpTo(2027, 3, 2, 0, 0, 0);
        _admit(outsider, "Comet_K");
        uint256 before = vault.stakeOf(honest);
        _pay(outsider);
        assertApproxEqAbs(vault.stakeOf(honest), before, 2);
        assertApproxEqAbs(vault.stakeOf(outsider), AVAX / 2, 2);
    }

    // ---------------------------------------------------------------- display names (RT-06)

    function test_S_MEM_04_namesAreUniqueIgnoringCase() public {
        vm.prank(honest);
        vault.setDisplayName("NightOwl");
        vm.prank(late);
        vm.expectRevert(Membership.NameTaken.selector);
        vault.setDisplayName("nightowl");
        assertEq(vault.memberByName("NIGHTOWL"), honest);
    }

    function test_S_MEM_05_secondChangeWithin30DaysIsRejected() public {
        vm.startPrank(honest);
        vault.setDisplayName("NightOwl");
        uint256 allowedAt = block.timestamp + 30 days;
        vm.expectRevert(abi.encodeWithSelector(Membership.NameChangeTooSoon.selector, allowedAt));
        vault.setDisplayName("DayOwl");
        vm.warp(allowedAt);
        vault.setDisplayName("DayOwl");
        vm.stopPrank();
        assertEq(vault.nameOf(honest), "DayOwl");
    }

    function test_S_RT_10_droppedNameStaysReservedForItsOwnerFor30Days() public {
        vm.prank(honest);
        vault.setDisplayName("Comet_K");
        vm.warp(block.timestamp + 30 days);
        vm.prank(honest);
        vault.setDisplayName("Comet"); // drops Comet_K at t
        assertEq(vault.memberByName("Comet_K"), address(0));

        vm.prank(late);
        vm.expectRevert(Membership.NameTaken.selector);
        vault.setDisplayName("comet_k");
        assertFalse(vault.isNameAvailable("Comet_K", late));
        assertTrue(vault.isNameAvailable("Comet_K", honest));

        vm.warp(block.timestamp + 30 days);
        vm.prank(late);
        vault.setDisplayName("comet_k");
        assertEq(vault.memberByName("Comet_K"), late);
    }

    function test_S_RT_10_nameTakenDuringVoteAdmitsWithoutAName() public {
        uint256 id = _request(outsider, "Comet_K");
        vm.prank(honest);
        vault.setDisplayName("COMET_K");
        _votes(id, 0, 7, true);
        vm.expectEmit(address(vault));
        emit Membership.DisplayNameUnavailable(outsider, "Comet_K");
        vm.prank(members[7]);
        vault.vote(id, true); // 8th yes settles it
        assertTrue(vault.isMember(outsider)); // the passed vote isn't reverted
        assertEq(vault.nameOf(outsider), "");
        assertEq(vault.memberByName("Comet_K"), honest);
        vm.prank(outsider);
        vault.setDisplayName("CometTwo"); // no cooldown on the first name
    }

    function test_S_RT_09_lookAlikeAndInvisibleCharactersAreRejected() public {
        string[9] memory bad = [
            "ab", // too short
            "abcdefghijklmnopqrstuvwxy", // 25 bytes
            " Owl", // leading space
            "Owl ", // trailing space
            "Night  Owl", // double space
            string(hex"52d0b068756c"), // "Rahul" with a Cyrillic a
            string(hex"4f77e2808b6c"), // zero-width space
            string(hex"e280ae4f776c"), // right-to-left override
            string(hex"4f776cf09fa689") // emoji
        ];
        for (uint256 i = 0; i < bad.length; ++i) {
            assertFalse(vault.isNameAvailable(bad[i], honest));
            vm.prank(honest);
            vm.expectRevert(Membership.InvalidDisplayName.selector);
            vault.setDisplayName(bad[i]);
        }
        assertTrue(vault.isNameAvailable("Night Owl_2.0-x", honest));
    }

    // ---------------------------------------------------------------- registry and config

    function test_S_RT_01_onlyFactoryCirclesAreVerifiedAndCanRegister() public {
        assertTrue(factory.isCircle(address(vault)));
        assertFalse(factory.isCircle(attacker));
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(CircleFactory.NotACircle.selector, attacker));
        factory.registerMember(attacker);
    }

    function test_S_RT_33_lateFeeAboveHalfTheInstallmentIsRejected() public {
        CircleVault.Config memory c = _cfg();
        c.fee1 = uint128(AVAX / 4) + 1;
        address[] memory none = new address[](0);
        vm.expectRevert(
            abi.encodeWithSelector(
                CircleVault.InvalidConfig.selector,
                "each late fee must be at most half the installment"
            )
        );
        factory.createCircle(c, none);
        c = _cfg();
        c.fee2 = uint128(AVAX / 4) + 1;
        vm.expectRevert();
        factory.createCircle(c, none);
        c.fee2 = uint128(AVAX / 4); // exactly half is fine
        factory.createCircle(c, none);
    }

    function test_S_MEM_11_contractWalletMemberCanVote() public {
        address wallet = address(_smartWallet(honest));
        uint256 id = _request(wallet, "SafeWallet");
        _votes(id, 0, 12, true);
        assertTrue(vault.isMember(wallet));
        // Admitted by vote: it votes once it has paid two installments (ADR 0033).
        _execPay(wallet);
        _warpTo(2027, 1, 5, 12, 0, 0);
        _execPay(wallet);
        assertTrue(vault.memberOf(wallet).voter);
        uint256 id2 = _request(outsider, "Comet_K");
        vm.prank(honest);
        (bool ok,) = wallet.call(
            abi.encodeWithSignature(
                "exec(address,uint256,bytes)",
                address(vault),
                0,
                abi.encodeCall(CircleVault.vote, (id2, true))
            )
        );
        assertTrue(ok); // a voter before request 2, so it can vote through its wallet
        assertEq(vault.getRequest(id2).yes, 1);
    }

    /// @dev Pays the oldest installment from a RejectingWallet through its `exec`.
    function _execPay(address wallet) internal {
        (, uint256 amount,,) = vault.amountDue(wallet);
        vm.prank(honest);
        (bool ok,) = wallet.call(
            abi.encodeWithSignature(
                "exec(address,uint256,bytes)",
                address(vault),
                amount,
                abi.encodeCall(CircleVault.contribute, ())
            )
        );
        require(ok, "wallet payment failed");
    }
}
