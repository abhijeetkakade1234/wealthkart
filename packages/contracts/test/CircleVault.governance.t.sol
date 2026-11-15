// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {Membership} from "../src/modules/Membership.sol";
import {Governance} from "../src/modules/Governance.sol";
import {Exits} from "../src/modules/Exits.sol";
import {Rules} from "../src/modules/Rules.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";
import {RejectingWallet, ReentrantAttacker} from "./helpers/Actors.sol";

/// @dev Shared helpers for the governance scenarios.
abstract contract GovernanceBase is CircleVaultBase {
    uint256 internal constant JAN_1_2027 = 1_798_761_600; // 2027-01-01T00:00:00Z
    uint256 internal constant FEB_1_2027 = 1_801_440_000; // 2027-02-01T00:00:00Z
    uint256 internal constant SLOT_LOANS_OUT = SLOT_LOANS_OUTSTANDING;

    /// @dev An ordinary (not risky, ADR 0043) change: cheaper loans and a longer exit notice.
    function _newRules() internal pure returns (Rules.Params memory r) {
        r = Rules.defaults(uint128(AVAX / 2));
        r.interestBps = 50;
        r.tenor2Bps = 100;
        r.tenor3Bps = 150;
        r.exitNoticeDays = 45;
    }

    /// @dev Voters other than those who already voted say `support` until `n` more votes are in.
    function _govVotes(CircleVault v, address[] memory list, uint256 id, uint256 n, bool support)
        internal
    {
        for (uint256 i = 0; i < list.length && n > 0; ++i) {
            if (!v.canVoteProposal(id, list[i])) continue;
            vm.prank(list[i]);
            v.voteProposal(id, support);
            --n;
        }
        require(n == 0, "not enough voters");
    }

    /// @dev `honest` proposes `_newRules()` and 6 more members say yes (7 of 12 > 50%).
    function _passRuleChange() internal returns (uint256 id) {
        vm.prank(honest);
        id = vault.proposeRuleChange(_newRules());
        _govVotes(vault, members, id, 6, true);
    }

    function _status(CircleVault v, uint256 id) internal view returns (Governance.Status) {
        return v.proposal(id).status;
    }

    /// @dev `honest` proposes a dissolve and 7 more members say yes (8 of 12 = 66.7%).
    function _dissolve(CircleVault v, address[] memory list) internal {
        vm.prank(list[0]);
        uint256 id = v.proposeDissolve();
        uint256 need = (list.length * 66 + 99) / 100;
        if (need > 1) _govVotes(v, list, id, need - 1, true);
        require(v.dissolved(), "not dissolved");
    }

    function _payAll(CircleVault v, address[] memory list) internal {
        for (uint256 i = 0; i < list.length; ++i) {
            _payIn(v, list[i]);
        }
    }

    function _switches(CircleVault v) internal view returns (uint256) {
        return uint256(vm.load(address(v), bytes32(SLOT_SWITCHES)));
    }
}

/// @notice Governance scenarios from docs/testing.md (S-GOV-*, S-LIFE-02, S-RT-08, S-RT-32).
contract CircleVaultGovernanceTest is GovernanceBase {
    // ---------------------------------------------------------------- rule changes

    function test_S_GOV_01_ruleChangePassesThenAppliesFromNextPeriod() public {
        Rules.Params memory r = _newRules();
        vm.prank(honest);
        uint256 id = vault.proposeRuleChange(r);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Open));
        assertEq(vault.proposalRules(id).interestBps, 50);

        // 12 voters, pass mark > 50%: the 7th yes decides it early.
        _govVotes(vault, members, id, 5, true);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Open));
        _govVotes(vault, members, id, 1, true);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Approved));

        // Passed on Dec 1 + 7 days = Dec 8 -> next period start, Jan 1.
        (Rules.Params memory pending, uint64 at) = vault.pendingRuleChange();
        assertEq(at, JAN_1_2027);
        assertEq(pending.interestBps, 50);
        assertEq(vault.rageQuitUntil(), JAN_1_2027);
        assertEq(vault.rules().interestBps, 100, "old rules until the change applies");

        vm.warp(JAN_1_2027);
        assertEq(vault.rules().interestBps, 50, "in force from effectiveAt, before any poke");
        vault.applyRuleChange();
        assertEq(vault.rules().interestBps, 50);
        assertEq(vault.rules().exitNoticeDays, 45);
        (, at) = vault.pendingRuleChange();
        assertEq(at, 0);
    }

    function test_S_GOV_02_passedChangeCannotApplyEarly() public {
        uint256 id = _passRuleChange();
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Approved));
        vm.warp(JAN_1_2027 - 1);
        vm.expectRevert(abi.encodeWithSelector(Governance.RuleChangeNotDue.selector, JAN_1_2027));
        vault.applyRuleChange();
    }

    function test_S_GOV_02_applyWithNothingPendingReverts() public {
        vm.expectRevert(Governance.NoPendingRuleChange.selector);
        vault.applyRuleChange();
    }

    function test_S_RT_32_lateMonthPassWaitsForTheFollowingPeriod() public {
        // Dec 28 + 7 days = Jan 4: Jan has started, so the change waits for Feb 1.
        _warpTo(2026, 12, 28, 12, 0, 0);
        _passRuleChange();
        (, uint64 at) = vault.pendingRuleChange();
        assertEq(at, FEB_1_2027);
        assertEq(vault.rageQuitUntil(), FEB_1_2027);
    }

    function test_S_RT_32_delayEndingExactlyAtPeriodStartAppliesThen() public {
        _warpTo(2026, 12, 25, 0, 0, 0);
        _passRuleChange();
        (, uint64 at) = vault.pendingRuleChange();
        assertEq(at, JAN_1_2027);
    }

    function test_S_GOV_05_invalidRulesAreRejectedAtProposal() public {
        Rules.Params memory r = _newRules();
        r.interestBps = 600;
        vm.prank(honest);
        vm.expectRevert(
            abi.encodeWithSelector(Rules.InvalidRule.selector, "interest must be 0-5% a month")
        );
        vault.proposeRuleChange(r);

        r = _newRules();
        r.ruleChangeDelayDays = 1;
        vm.prank(honest);
        vm.expectRevert(
            abi.encodeWithSelector(
                Rules.InvalidRule.selector, "rule-change delay must be 3-30 days"
            )
        );
        vault.proposeRuleChange(r);
    }

    function test_S_GOV_06_oneRuleChangeAtATime() public {
        vm.prank(honest);
        vault.proposeRuleChange(_newRules());
        vm.prank(members[2]);
        vm.expectRevert(Governance.RuleChangeInProgress.selector);
        vault.proposeRuleChange(_newRules());
    }

    function test_S_GOV_06_pendingChangeBlocksUntilDueThenIsAppliedFirst() public {
        _passRuleChange();
        vm.prank(members[2]);
        vm.expectRevert(Governance.RuleChangeInProgress.selector);
        vault.proposeRuleChange(_newRules());

        // Once due, a new proposal puts the waiting change into force first.
        vm.warp(JAN_1_2027);
        Rules.Params memory next = _newRules();
        next.interestBps = 25;
        next.tenor2Bps = 100;
        next.tenor3Bps = 150;
        vm.prank(members[2]);
        uint256 id = vault.proposeRuleChange(next);
        assertEq(vault.rules().interestBps, 50, "first change applied");
        assertEq(vault.proposalRules(id).interestBps, 25);
    }

    function test_S_GOV_06_rejectedChangeFreesTheSlot() public {
        vm.prank(honest);
        uint256 id = vault.proposeRuleChange(_newRules());
        _govVotes(vault, members, id, 6, false); // 6 no of 12: can't reach > 50% any more
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Rejected));
        vm.prank(members[2]);
        vault.proposeRuleChange(_newRules());
    }

    // ---------------------------------------------------------------- voting

    function test_S_GOV_07_onlyCurrentVotersPropose() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Governance.NotAllowedToPropose.selector, outsider));
        vault.proposeDissolve();

        // Two periods behind: no longer a current voter (RT-07).
        vm.warp(FEB_1_2027);
        vm.prank(late);
        vm.expectRevert(abi.encodeWithSelector(Governance.NotAllowedToPropose.selector, late));
        vault.proposeGuardianOff();
    }

    function test_S_GOV_08_quorumNotMetExpires() public {
        vm.prank(honest);
        uint256 id = vault.proposeGuardianOff();
        _govVotes(vault, members, id, 2, true); // 3 of 12 < 50% quorum
        vm.expectRevert(abi.encodeWithSelector(Governance.ProposalNotDecided.selector, id));
        vault.finalizeProposal(id);

        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalizeProposal(id);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Expired));
        assertFalse(vault.guardianDisabled());
    }

    function test_S_GOV_08_quorumMetButSplitIsRejectedAtTheEnd() public {
        vm.prank(honest);
        uint256 id = vault.proposeRuleChange(_newRules());
        _govVotes(vault, members, id, 2, true);
        _govVotes(vault, members, id, 3, false); // 3 yes, 3 no: quorum met, not > 50%
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalizeProposal(id);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Rejected));
    }

    function test_S_GOV_08_quorumMetMajorityPassesAtTheEnd() public {
        vm.prank(honest);
        uint256 id = vault.proposeRuleChange(_newRules());
        _govVotes(vault, members, id, 3, true);
        _govVotes(vault, members, id, 2, false); // 4 yes, 2 no
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalizeProposal(id);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Approved));
        (, uint64 at) = vault.pendingRuleChange();
        assertGt(at, 0);
    }

    /// @dev GOV-01 (ADR 0043): guardian-off needs yes from the pass mark of all eligible members.
    function test_S_GOV_08_guardianOffNeedsMembersNotJustVotesCast() public {
        vm.prank(honest);
        uint256 id = vault.proposeGuardianOff();
        assertTrue(vault.proposal(id).memberBar);
        _govVotes(vault, members, id, 3, true);
        _govVotes(vault, members, id, 2, false); // 4 yes, 2 no: 4 of 12 is not > 50%
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalizeProposal(id);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Expired));
        assertFalse(vault.guardianDisabled());
    }

    function test_S_GOV_09_voteGuards() public {
        vm.prank(honest);
        uint256 id = vault.proposeGuardianOff();

        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Governance.AlreadyVotedOnProposal.selector, id));
        vault.voteProposal(id, true);

        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(Governance.CannotVoteOnProposal.selector, id, outsider)
        );
        vault.voteProposal(id, true);

        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(members[3]);
        vm.expectRevert(abi.encodeWithSelector(Governance.ProposalVotingClosed.selector, id));
        vault.voteProposal(id, true);

        vm.expectRevert(abi.encodeWithSelector(Governance.ProposalNotOpen.selector, 99));
        vault.voteProposal(99, true);
    }

    function test_S_GOV_10_proposerCancels() public {
        vm.prank(honest);
        uint256 id = vault.proposeDissolve();
        vm.prank(members[2]);
        vm.expectRevert(abi.encodeWithSelector(Governance.NotProposer.selector, id));
        vault.cancelProposal(id);

        vm.prank(honest);
        vault.cancelProposal(id);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Cancelled));
        (uint256[] memory open,) = vault.openProposalsPage(0, 10);
        assertEq(open.length, 0);
        vm.expectRevert(abi.encodeWithSelector(Governance.ProposalNotOpen.selector, id));
        vault.finalizeProposal(id);
    }

    function test_S_GOV_03_proposalSpamIsRateLimited() public {
        vm.startPrank(honest);
        vault.proposeDissolve();
        // GOV-08: one new proposal per member per day.
        vm.expectRevert(
            abi.encodeWithSelector(Governance.ProposalTooSoon.selector, block.timestamp + 1 days)
        );
        vault.proposeGuardianOff();
        vm.warp(block.timestamp + 1 days);
        vault.proposeGuardianOff();
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(abi.encodeWithSelector(Governance.TooManyOpenProposalsBy.selector, honest));
        vault.proposeDissolve();
        vm.stopPrank();

        for (uint256 i = 1; i < 5; ++i) {
            vm.prank(members[i]);
            vault.proposeDissolve();
        }
        vm.warp(block.timestamp + 1 days);
        for (uint256 i = 1; i < 5; ++i) {
            vm.prank(members[i]);
            vault.proposeGuardianOff();
        }
        (uint256[] memory ids, Governance.Proposal[] memory page) = vault.openProposalsPage(0, 50);
        assertEq(ids.length, 10);
        assertEq(page.length, 10);
        (ids,) = vault.openProposalsPage(8, 5);
        assertEq(ids.length, 2);
        (ids,) = vault.openProposalsPage(10, 5);
        assertEq(ids.length, 0);

        vm.prank(members[6]);
        vm.expectRevert(Governance.TooManyOpenProposals.selector);
        vault.proposeDissolve();
        assertEq(vault.proposalCount(), 10);
    }

    // ---------------------------------------------------------------- fee waivers

    function test_S_GOV_04_feeWaiverRemovesLateFees() public {
        _pay(honest);
        _warpTo(2026, 12, 25, 12, 0, 0); // past day 20: both fees owed
        (,, uint256 fees,) = vault.amountDue(late);
        assertEq(fees, AVAX / 50);

        vm.prank(honest);
        uint256 id = vault.proposeFeeWaiver(late, DEC_2026, Governance.Reason.Medical);
        // 11 eligible (late can't vote): the 6th yes is > 50%.
        _govVotes(vault, members, id, 4, true);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Open));
        vm.expectEmit(address(vault));
        emit Governance.FeeWaived(late, DEC_2026, Governance.Reason.Medical);
        _govVotes(vault, members, id, 1, true);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Approved));

        (, uint256 amount, uint256 feesAfter,) = vault.amountDue(late);
        assertEq(feesAfter, 0);
        assertEq(amount, AVAX / 2);
        _pay(late);
        // Paid at the same NAV as the on-time member, with no fee: equal shares and stakes.
        assertEq(vault.totalAssets(), AVAX);
        assertEq(vault.memberOf(late).shares, vault.memberOf(honest).shares);
    }

    function test_S_GOV_04_subjectCannotVoteOnOwnWaiver() public {
        _warpTo(2026, 12, 15, 0, 0, 0);
        vm.prank(late);
        uint256 id = vault.proposeFeeWaiver(late, DEC_2026, Governance.Reason.BankIssue);
        Governance.Proposal memory p = vault.proposal(id);
        assertEq(p.yes, 0, "the subject's own request carries no vote");
        assertEq(p.eligible, 11);
        assertEq(p.subject, late);
        assertFalse(vault.canVoteProposal(id, late));
        vm.prank(late);
        vm.expectRevert(abi.encodeWithSelector(Governance.CannotVoteOnProposal.selector, id, late));
        vault.voteProposal(id, true);
        assertTrue(vault.canVoteProposal(id, honest));
    }

    function test_S_GOV_04_invalidWaiversRevert() public {
        // Future period.
        vm.prank(honest);
        vm.expectRevert(
            abi.encodeWithSelector(Governance.InvalidWaiver.selector, late, DEC_2026 + 1)
        );
        vault.proposeFeeWaiver(late, DEC_2026 + 1, Governance.Reason.Other);
        // Already paid.
        _pay(late);
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Governance.InvalidWaiver.selector, late, DEC_2026));
        vault.proposeFeeWaiver(late, DEC_2026, Governance.Reason.Other);
        // Not a member.
        vm.prank(honest);
        vm.expectRevert(
            abi.encodeWithSelector(Governance.InvalidWaiver.selector, outsider, DEC_2026)
        );
        vault.proposeFeeWaiver(outsider, DEC_2026, Governance.Reason.Other);
        // Proposer who is neither the member nor a voter.
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Governance.NotAllowedToPropose.selector, outsider));
        vault.proposeFeeWaiver(members[3], DEC_2026, Governance.Reason.Other);
    }

    function test_S_GOV_04_waivedPeriodCannotBeWaivedTwice() public {
        vm.prank(honest);
        uint256 id = vault.proposeFeeWaiver(late, DEC_2026, Governance.Reason.Bereavement);
        _govVotes(vault, members, id, 5, true);
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Governance.InvalidWaiver.selector, late, DEC_2026));
        vault.proposeFeeWaiver(late, DEC_2026, Governance.Reason.Bereavement);
    }

    // ---------------------------------------------------------------- guardian

    function test_S_GOV_11_guardianOffClearsThePause() public {
        uint256 pausedUntil = block.timestamp + 10 days;
        vm.store(address(vault), bytes32(SLOT_SWITCHES), bytes32(pausedUntil));
        vm.prank(honest);
        uint256 id = vault.proposeGuardianOff();
        _govVotes(vault, members, id, 6, true);
        assertTrue(vault.guardianDisabled());
        assertEq(uint64(_switches(vault)), 0, "pause cleared");

        vm.prank(members[2]);
        vm.expectRevert(Governance.GuardianAlreadyOff.selector);
        vault.proposeGuardianOff();
    }

    // ---------------------------------------------------------------- dissolution

    function test_S_LIFE_02_dissolveNeeds66Percent() public {
        vm.prank(honest);
        uint256 id = vault.proposeDissolve();
        assertEq(vault.proposal(id).passPct, 66);
        _govVotes(vault, members, id, 6, true); // 7 of 12 = 58%: not yet
        assertFalse(vault.dissolved());
        _govVotes(vault, members, id, 1, true); // 8 of 12 = 66.7%
        assertTrue(vault.dissolved());
    }

    function test_S_LIFE_02_contributeAndProposalsStopAfterDissolve() public {
        _dissolve(vault, members);
        vm.prank(honest);
        vm.expectRevert(Governance.CircleDissolved.selector);
        vault.contribute{value: AVAX / 2}();
        vm.prank(honest);
        vm.expectRevert(Governance.CircleDissolved.selector);
        vault.proposeGuardianOff();
    }

    /// @dev GOV-06 (ADR 0043): claims pay each member's share of the cash while loans are out;
    ///      the rest is claimed again once the loans come back.
    function test_S_LIFE_02_claimsPayCashNowAndTheRestLater() public {
        _payAll(vault, members);
        vm.expectRevert(Exits.NotDissolved.selector);
        vm.prank(honest);
        vault.claimDissolution();

        _dissolve(vault, members);
        // 1 AVAX is lent out (what LoanBook would do).
        vm.store(address(vault), bytes32(SLOT_LOANS_OUT), bytes32(uint256(1 ether)));
        vm.deal(address(vault), address(vault).balance - 1 ether);
        uint256 shares = vault.memberOf(honest).shares;
        uint256 cashNow = vault.cash();
        uint256 navBefore = vault.navPerShareE18();
        uint256 totalBefore = vault.totalShares();
        uint256 before = honest.balance;
        vm.prank(honest);
        vault.claimDissolution();
        uint256 first = honest.balance - before;
        assertEq(first, shares * cashNow / totalBefore, "share of cash");
        assertTrue(vault.isMember(honest), "stays while loans are out");
        assertGt(vault.memberOf(honest).shares, 0);
        assertGe(vault.navPerShareE18(), navBefore, "claim never lowers NAV");

        // The loan is repaid; the second claim pays the rest and the member leaves.
        vm.store(address(vault), bytes32(SLOT_LOANS_OUT), bytes32(0));
        vm.deal(address(vault), address(vault).balance + 1 ether);
        uint256 stakeLeft = vault.stakeOf(honest);
        before = honest.balance;
        vm.prank(honest);
        vault.claimDissolution();
        assertApproxEqAbs(honest.balance - before, stakeLeft, 2);
        assertFalse(vault.isMember(honest));
    }

    function test_S_LIFE_02_proRataClaimsSumToTotalAssets() public {
        _payAll(vault, members);
        // Next month, pay late (fees go into the vault and raise NAV for everyone).
        _warpTo(2027, 1, 25, 0, 0, 0);
        for (uint256 i = 0; i < 5; ++i) {
            _pay(members[i]);
        }
        _dissolve(vault, members);

        uint256 total = vault.totalAssets();
        uint256 paid;
        uint256 previousStake = type(uint256).max;
        for (uint256 i = 0; i < members.length; ++i) {
            address a = members[i];
            uint256 stake = vault.stakeOf(a);
            uint256 before = a.balance;
            vm.prank(a);
            vault.claimDissolution();
            uint256 got = a.balance - before;
            assertApproxEqAbs(got, stake, members.length, "paid at NAV");
            paid += got;
            if (i == 5) assertLt(got, previousStake, "fewer shares, smaller payout");
            previousStake = got;
            assertFalse(vault.isMember(a));
            vm.prank(a);
            vm.expectRevert(abi.encodeWithSelector(Membership.NotAMember.selector, a));
            vault.claimDissolution();
        }
        assertEq(paid, total, "every wei paid out");
        assertEq(vault.totalAssets(), 0);
        assertEq(vault.totalShares(), 0);
        assertEq(vault.memberCount(), 0);
        assertEq(address(vault).balance, 0);
    }

    function test_S_LIFE_02_refusingWalletKeepsItsShareWithdrawable() public {
        RejectingWallet w = _smartWallet(members[0]);
        address[] memory list = new address[](3);
        list[0] = members[0];
        list[1] = members[1];
        list[2] = address(w);
        CircleVault v = _createCircle(_cfg(), list);
        _payAll(v, list);
        _dissolve(v, list);

        uint256 stake = v.stakeOf(address(w));
        vm.prank(address(w));
        v.claimDissolution();
        assertEq(v.withdrawable(address(w)), stake);
        assertFalse(v.isMember(address(w)));

        vm.prank(list[0]);
        v.claimDissolution();
        vm.prank(list[1]);
        v.claimDissolution();
        // Only the refused payout is left, and it isn't part of the circle's assets.
        assertEq(v.totalAssets(), 0);
        assertEq(address(v).balance, stake);
    }

    function test_S_LIFE_02_reentrantClaimIsBlocked() public {
        ReentrantAttacker a = _attackerContract();
        address[] memory list = new address[](3);
        list[0] = members[0];
        list[1] = members[1];
        list[2] = address(a);
        CircleVault v = _createCircle(_cfg(), list);
        _payAll(v, list);
        _dissolve(v, list);
        a.arm(address(v), abi.encodeCall(CircleVault.claimDissolution, ()), 0);

        uint256 stake = v.stakeOf(address(a));
        uint256 before = address(a).balance;
        vm.prank(address(a));
        v.claimDissolution();
        assertTrue(a.reentered());
        assertFalse(a.reentrySucceeded());
        assertEq(address(a).balance - before, stake);
    }
}

/// @notice Snapshot voting: a member who gains a vote after a proposal opened can't vote on it.
contract CircleVaultGovernanceSnapshotTest is GovernanceBase {
    function _cfg() internal pure override returns (CircleVault.Config memory c) {
        c = super._cfg();
        c.minPaidToVote = 0; // admitted members vote at once, with a fresh stamp
    }

    function test_S_GOV_12_votersJoiningAfterTheProposalCannotVote() public {
        vm.prank(honest);
        uint256 id = vault.proposeGuardianOff();
        address newcomer = _actor("newcomer");
        _admit(newcomer, "Newcomer");
        assertEq(vault.voterCount(), 13);
        assertFalse(vault.canVoteProposal(id, newcomer));
        vm.prank(newcomer);
        vm.expectRevert(
            abi.encodeWithSelector(Governance.CannotVoteOnProposal.selector, id, newcomer)
        );
        vault.voteProposal(id, true);
        assertEq(vault.proposal(id).eligible, 12, "quorum base fixed at proposal time");
    }
}

/// @dev Random contributions, dissolve votes, claims (one member refuses AVAX) and time jumps.
contract GovernanceHandler is Test {
    CircleVault public vault;
    address[] public members;
    uint256 public ghostClaims;

    constructor(CircleVault v, address[] memory m) {
        vault = v;
        members = m;
    }

    function contribute(uint256 who) external {
        address a = members[who % members.length];
        if (vault.dissolved() || !vault.isMember(a)) return;
        (, uint256 amount,, bool due) = vault.amountDue(a);
        if (!due) return;
        vm.prank(a);
        vault.contribute{value: amount}();
    }

    function proposeDissolve(uint256 who) external {
        vm.prank(members[who % members.length]);
        try vault.proposeDissolve() {} catch {}
    }

    function vote(uint256 who, uint256 id, bool support) external {
        uint256 n = vault.proposalCount();
        if (n == 0) return;
        id = bound(id, 1, n);
        vm.prank(members[who % members.length]);
        try vault.voteProposal(id, support) {} catch {}
    }

    function claim(uint256 who) external {
        vm.prank(members[who % members.length]);
        try vault.claimDissolution() {
            ghostClaims += 1;
        } catch {}
    }

    function warp(uint256 secondsAhead) external {
        vm.warp(block.timestamp + bound(secondsAhead, 1 hours, 20 days));
    }

    function totalWithdrawable() external view returns (uint256 sum) {
        for (uint256 i = 0; i < members.length; ++i) {
            sum += vault.withdrawable(members[i]);
        }
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }
}

contract CircleVaultGovernanceInvariantTest is GovernanceBase {
    GovernanceHandler internal handler;
    CircleVault internal v;
    address[] internal list;

    function setUp() public override {
        super.setUp();
        RejectingWallet w = _smartWallet(members[0]);
        for (uint256 i = 0; i < 4; ++i) {
            list.push(members[i]);
        }
        list.push(address(w));
        v = _createCircle(_cfg(), list);
        handler = new GovernanceHandler(v, list);
        targetContract(address(handler));
    }

    /// I-12: the vault holds exactly its cash plus refused payouts waiting to be withdrawn.
    function invariant_I12_balanceIsCashPlusWithdrawable() public view {
        assertEq(
            address(v).balance, v.totalAssets() - v.loansOutstanding() + handler.totalWithdrawable()
        );
    }

    /// I-2 under governance: member shares still sum to total shares after claims.
    function invariant_I2_sharesSumToTotalAfterClaims() public view {
        uint256 sum;
        for (uint256 i = 0; i < list.length; ++i) {
            sum += v.memberOf(list[i]).shares;
        }
        assertEq(sum, v.totalShares());
    }
}
