// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Membership} from "../src/modules/Membership.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {PeriodMath} from "../src/libraries/PeriodMath.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";

/// @notice Dormant-member scenarios (ADR 0010, ADR 0032, red-team RT-11). 12 members, 50% quorum,
///         dormant vote allowed after 3 missed installments, passes with more than half the
///         votes cast. `lost` (members[11]) lost their wallet in December 2026.
contract CircleVaultDormantTest is CircleVaultBase {
    address internal lost;

    function setUp() public override {
        super.setUp();
        lost = members[11];
    }

    /// @dev Everyone except `skip` pays whatever is due right now.
    function _payAllExcept(address skip) internal {
        for (uint256 i = 0; i < members.length; ++i) {
            address who = members[i];
            if (who == skip || vault.memberOf(who).dormant) continue;
            (,,, bool payable_) = vault.amountDue(who);
            if (payable_) _pay(who);
        }
    }

    /// @dev Dec, Jan and Feb pass; `lost` pays none of them. Ends on 2027-02-11 12:00 UTC.
    function _loseThreeMonths() internal {
        _payAllExcept(lost);
        _warpTo(2027, 1, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 2, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 2, 11, 12, 0, 0);
    }

    function _proposeAndPass(address target) internal returns (uint256 id) {
        vm.prank(honest);
        id = vault.proposeDormant(target);
        _votes(id, 1, members.length, true);
        assertEq(uint8(vault.getRequest(id).status), uint8(Membership.Status.Approved));
    }

    // ---------------------------------------------------------------- S-MEM-07

    function test_S_MEM_07_lostWalletIsVotedDormantDuesStopSharesStay() public {
        // lost paid December before losing the wallet, so they hold shares.
        _payAllExcept(address(0));
        uint256 sharesBefore = vault.memberOf(lost).shares;
        assertGt(sharesBefore, 0);
        _warpTo(2027, 1, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 2, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 3, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 3, 11, 12, 0, 0);
        assertEq(vault.periodsOverdue(lost), 3); // Jan, Feb, Mar

        uint256 id = _proposeAndPass(lost);
        Membership.Request memory r = vault.getRequest(id);
        assertEq(uint8(r.kind), uint8(Membership.Kind.Dormant));
        assertEq(r.account, lost);
        assertEq(r.invitedBy, honest); // the proposer
        assertEq(r.eligible, 11); // everyone but lost

        assertTrue(vault.memberOf(lost).dormant);
        assertEq(vault.dormantCount(), 1);
        assertEq(vault.memberCount(), 12); // still a member; the cap counts them
        assertEq(vault.periodsOverdue(lost), 0); // dues stop
        assertEq(vault.memberOf(lost).shares, sharesBefore); // nobody can touch the shares

        // Months later: still nothing owed, still the same shares.
        _warpTo(2027, 9, 1, 0, 0, 0);
        assertEq(vault.periodsOverdue(lost), 0);
        assertEq(vault.memberOf(lost).shares, sharesBefore);
    }

    function test_S_MEM_07_dormantMemberCannotVoteHolidayOrRename() public {
        _loseThreeMonths();
        _proposeAndPass(lost);

        vm.prank(outsider);
        uint256 join = vault.requestToJoin("Newcomer", honest);
        assertFalse(vault.canVote(join, lost));
        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotEligibleToVote.selector, join, lost));
        vault.vote(join, true);

        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Membership.MemberIsDormant.selector, lost));
        vault.declareHoliday();
        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Membership.MemberIsDormant.selector, lost));
        vault.setDisplayName("Ghost");
    }

    // ---------------------------------------------------------------- S-TRUST-03

    function test_S_TRUST_03_dormantMembersLeaveTheQuorumCount() public {
        _loseThreeMonths();
        _proposeAndPass(lost);

        vm.prank(outsider);
        uint256 id = vault.requestToJoin("Newcomer", honest);
        assertEq(vault.getRequest(id).eligible, 11); // 12 members, 1 dormant
    }

    // ---------------------------------------------------------------- S-RT-18 (RT-11)

    function test_S_RT_18_cannotProposeBeforeNMissedPeriods() public {
        _payAllExcept(lost);
        _warpTo(2027, 1, 11, 12, 0, 0);
        _payAllExcept(lost);
        assertEq(vault.periodsOverdue(lost), 2);

        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotOverdueEnough.selector, 2, 3));
        vault.proposeDormant(lost);

        // A travelling member who is merely late is never at risk.
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotOverdueEnough.selector, 0, 3));
        vault.proposeDormant(members[2]);
    }

    function test_S_RT_18_holidayGraceDoesNotCountAsMissed() public {
        _payAllExcept(lost);
        _warpTo(2027, 1, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 2, 5, 12, 0, 0);
        _payAllExcept(lost);
        // A member who is up to date declares a holiday for March, then travels.
        address traveller = members[3];
        _warpTo(2027, 3, 5, 12, 0, 0);
        vm.prank(traveller);
        vault.declareHoliday();
        _warpTo(2027, 3, 11, 12, 0, 0);
        assertEq(vault.periodsOverdue(traveller), 0); // inside holiday grace until 10 April
        _warpTo(2027, 4, 11, 12, 0, 0);
        assertEq(vault.periodsOverdue(traveller), 2); // March (grace over) and April
    }

    function test_S_RT_18_dormantMemberWhoPaysIsWokenAndPaysOnlyThisMonth() public {
        _loseThreeMonths();
        _proposeAndPass(lost);

        _warpTo(2027, 6, 5, 12, 0, 0); // before June's due moment: no fees
        (uint256 period, uint256 amount, uint256 fees, bool payable_) = vault.amountDue(lost);
        assertTrue(payable_);
        assertEq(period, PeriodMath.periodOf(block.timestamp));
        assertEq(fees, 0);
        assertEq(amount, AVAX / 2);

        uint32 seqBefore = vault.memberOf(lost).seq;
        vm.prank(lost);
        vault.contribute{value: amount}();

        Membership.Member memory m = vault.memberOf(lost);
        assertFalse(m.dormant);
        assertEq(vault.dormantCount(), 0);
        assertEq(m.nextPeriod, period + 1);
        assertGt(m.seq, seqBefore); // votes only on requests from now on
        assertGt(m.shares, 0);
    }

    function test_S_RT_18_targetCannotVoteAndProposerYesIsCounted() public {
        _loseThreeMonths();
        vm.prank(honest);
        uint256 id = vault.proposeDormant(lost);

        Membership.Request memory r = vault.getRequest(id);
        assertEq(r.yes, 1);
        assertTrue(vault.hasVoted(id, honest));
        assertTrue(r.inviterConfirmed);
        assertFalse(vault.canVote(id, lost));
        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotEligibleToVote.selector, id, lost));
        vault.vote(id, false);

        vm.prank(members[2]);
        vm.expectRevert(abi.encodeWithSelector(Membership.RequestAlreadyOpen.selector, id));
        vault.proposeDormant(lost);
    }

    function test_S_RT_18_cannotProposeYourselfOrWhileBehind() public {
        _loseThreeMonths();
        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotEligibleToVote.selector, 0, lost));
        vault.proposeDormant(lost);

        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotAMember.selector, outsider));
        vault.proposeDormant(outsider);

        // Nobody pays March or April: by 11 May everyone else is more than one month behind.
        _warpTo(2027, 5, 11, 12, 0, 0);
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotEligibleToVote.selector, 0, honest));
        vault.proposeDormant(lost);
    }

    function test_S_RT_18_memberWhoCatchesUpDuringTheVoteIsNotMarked() public {
        _loseThreeMonths();
        vm.prank(honest);
        uint256 id = vault.proposeDormant(lost);

        // lost finds the wallet and pays two of the three months.
        _pay(lost);
        _pay(lost);
        assertEq(vault.periodsOverdue(lost), 1);

        _votes(id, 1, 11, true);
        assertEq(uint8(vault.getRequest(id).status), uint8(Membership.Status.Cancelled));
        assertFalse(vault.memberOf(lost).dormant);
        assertEq(vault.openDormantOf(lost), 0);
    }

    function test_S_RT_18_majorityNoRejects() public {
        _loseThreeMonths();
        vm.prank(honest);
        uint256 id = vault.proposeDormant(lost);
        _votes(id, 1, 7, false); // 6 no of 11 possible: yes can no longer pass
        assertEq(uint8(vault.getRequest(id).status), uint8(Membership.Status.Rejected));
        assertFalse(vault.memberOf(lost).dormant);
    }

    // ---------------------------------------------------------------- S-MEM-08

    function test_S_MEM_08_dormantMemberWakesAndDuesRestart() public {
        _loseThreeMonths();
        _proposeAndPass(lost);

        // A join request opened while lost is dormant.
        vm.prank(outsider);
        uint256 before = vault.requestToJoin("Newcomer", honest);

        _warpTo(2027, 5, 20, 12, 0, 0); // after May's due moment
        vm.prank(lost);
        vault.wake();
        Membership.Member memory m = vault.memberOf(lost);
        assertFalse(m.dormant);
        assertEq(m.nextPeriod, PeriodMath.periodOf(block.timestamp) + 1); // starts in June
        assertEq(vault.periodsOverdue(lost), 0);

        // Can't vote on what was opened while dormant (keeps the quorum count honest)...
        assertFalse(vault.canVote(before, lost));
        // ...but votes on anything new.
        address other = makeAddr("other");
        vm.prank(other);
        uint256 later = vault.requestToJoin("Other", honest);
        assertTrue(vault.canVote(later, lost));

        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotDormant.selector, lost));
        vault.wake();
    }

    function test_S_MEM_08_invalidDormantAfterReverts() public {
        CircleVault.Config memory c = _cfg();
        c.dormantAfter = 0;
        address[] memory none = new address[](0);
        vm.expectRevert(
            abi.encodeWithSelector(CircleVault.InvalidConfig.selector, "dormantAfter must be 1..12")
        );
        factory.createCircle(c, none);
        c.dormantAfter = 13;
        vm.expectRevert(
            abi.encodeWithSelector(CircleVault.InvalidConfig.selector, "dormantAfter must be 1..12")
        );
        factory.createCircle(c, none);
    }
}
