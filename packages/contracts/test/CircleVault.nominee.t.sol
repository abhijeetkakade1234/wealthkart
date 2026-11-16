// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {Membership} from "../src/modules/Membership.sol";
import {Exits} from "../src/modules/Exits.sol";
import {Ledger} from "../src/modules/Ledger.sol";
import {Governance} from "../src/modules/Governance.sol";
import {LoanBook} from "../src/modules/LoanBook.sol";
import {ILoanBookViews} from "../src/interfaces/ILoanBookViews.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";
import {CircleVaultUsdtBase} from "./CircleVault.usdt.t.sol";
import {RejectingWallet, ReentrantAttacker} from "./helpers/Actors.sol";

/// @dev Shared steps for nominee scenarios (ADR 0016, 0056): `lost` (members[11]) pays December,
///      names a backup wallet, then misses January to March and is voted dormant on 2027-03-11.
abstract contract NomineeSteps is CircleVaultBase {
    address internal lost;
    address internal heir;

    function _nomSetUp() internal {
        lost = members[11];
        heir = _actor("heir");
    }

    /// @dev Pays whatever each active, awake member owes right now, except `skip`.
    function _payAllExcept(address skip) internal virtual {
        for (uint256 i = 0; i < members.length; ++i) {
            address who = members[i];
            if (who == skip || !vault.isMember(who) || vault.memberOf(who).dormant) continue;
            (,,, bool due) = vault.amountDue(who);
            if (due) _pay(who);
        }
    }

    /// @dev December paid by all; `lost` names `nominee`; Jan..Mar missed; voted dormant.
    function _goDormant(address nominee) internal {
        _payAllExcept(address(0));
        if (nominee != address(0)) {
            vm.prank(lost);
            vault.setNominee(nominee);
        }
        _warpTo(2027, 1, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 2, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 3, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 3, 11, 12, 0, 0);
        vm.prank(honest);
        uint256 id = vault.proposeDormant(lost);
        _votes(id, 1, members.length, true);
        assertTrue(vault.memberOf(lost).dormant, "lost is dormant");
    }

    function _claim(address nominee) internal returns (uint256 id) {
        vm.prank(nominee);
        id = vault.requestNomineeClaim(lost);
    }

    function _status(uint256 id) internal view returns (Membership.Status) {
        return vault.getRequest(id).status;
    }

    /// @dev Claim, then every member who can votes yes.
    function _claimAndPass(address nominee) internal returns (uint256 id) {
        id = _claim(nominee);
        _votes(id, 0, members.length, true);
        assertEq(uint8(_status(id)), uint8(Membership.Status.Approved), "claim passed");
    }
}

/// @notice Nominee wallet scenarios, AVAX circle (S-NOM-*, ADR 0016, 0056).
contract CircleVaultNomineeTest is NomineeSteps {
    function setUp() public override {
        super.setUp();
        _nomSetUp();
    }

    function _assertBooks() internal view {
        uint256 owed;
        uint256 n = vault.memberListLength();
        address[] memory list = vault.membersPage(0, n);
        for (uint256 i = 0; i < n; ++i) {
            owed += vault.withdrawable(list[i]);
        }
        owed += vault.withdrawable(heir);
        assertGe(address(vault).balance, vault.totalAssets() - vault.loansOutstanding() + owed);
    }

    // ---------------------------------------------------------------- S-NOM-01

    function test_S_NOM_01_setChangeAndClearTheNominee() public {
        assertEq(vault.nomineeOf(lost), address(0));

        vm.expectEmit(true, true, false, false, address(vault));
        emit Exits.NomineeSet(lost, heir);
        vm.prank(lost);
        vault.setNominee(heir);
        assertEq(vault.nomineeOf(lost), heir);

        // Another member is fine too, and can be changed at any time.
        vm.prank(lost);
        vault.setNominee(members[2]);
        assertEq(vault.nomineeOf(lost), members[2]);

        vm.expectEmit(true, true, false, false, address(vault));
        emit Exits.NomineeSet(lost, address(0));
        vm.prank(lost);
        vault.setNominee(address(0));
        assertEq(vault.nomineeOf(lost), address(0));
    }

    function test_S_NOM_01_selfVaultAndOutsidersAreRefused() public {
        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Exits.InvalidNominee.selector, lost));
        vault.setNominee(lost);

        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Exits.InvalidNominee.selector, address(vault)));
        vault.setNominee(address(vault));

        // Only members name a nominee.
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotAMember.selector, outsider));
        vault.setNominee(heir);
    }

    function test_S_NOM_01_dormantMemberCanStillChangeTheNominee() public {
        _goDormant(heir);
        vm.prank(lost);
        vault.setNominee(members[3]);
        assertEq(vault.nomineeOf(lost), members[3]);
        assertTrue(vault.memberOf(lost).dormant, "no claim was open, so still dormant");
    }

    // ---------------------------------------------------------------- S-NOM-02

    function test_S_NOM_02_claimRefusedUnlessDormantAndFromTheNominee() public {
        _payAllExcept(address(0));
        vm.prank(lost);
        vault.setNominee(heir);

        // The member is alive and paying: no claim.
        vm.prank(heir);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotDormant.selector, lost));
        vault.requestNomineeClaim(lost);

        // Someone who isn't the nominee can never ask.
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(Exits.NotNominee.selector, lost));
        vault.requestNomineeClaim(lost);

        // A member with no nominee: nobody can ask, not even with address(0) tricks.
        vm.prank(address(0));
        vm.expectRevert(abi.encodeWithSelector(Exits.NotNominee.selector, members[4]));
        vault.requestNomineeClaim(members[4]);
    }

    function test_S_NOM_02_dormantButNoNomineeMeansNoClaim() public {
        _goDormant(address(0));
        vm.prank(heir);
        vm.expectRevert(abi.encodeWithSelector(Exits.NotNominee.selector, lost));
        vault.requestNomineeClaim(lost);
    }

    // ---------------------------------------------------------------- S-NOM-03

    function test_S_NOM_03_fakeClaimWhileAliveMemberCancelsDuringTheVote() public {
        _goDormant(heir);
        uint256 id = _claim(heir);
        (uint256 open,) = vault.nomineeClaimOf(lost);
        assertEq(open, id);
        Membership.Request memory r = vault.getRequest(id);
        assertEq(uint8(r.kind), uint8(Membership.Kind.Claim));
        assertEq(r.account, lost);
        assertEq(r.invitedBy, heir);
        assertEq(r.eligible, 11); // lost is dormant; the heir is an outsider

        // One open claim per member.
        vm.prank(heir);
        vm.expectRevert(abi.encodeWithSelector(Exits.NomineeClaimPending.selector, lost));
        vault.requestNomineeClaim(lost);

        // The member is alive after all.
        vm.expectEmit(true, true, false, false, address(vault));
        emit Exits.NomineeClaimCancelled(lost, heir);
        vm.prank(lost);
        vault.cancelNomineeClaim();

        assertEq(uint8(_status(id)), uint8(Membership.Status.Cancelled));
        (open,) = vault.nomineeClaimOf(lost);
        assertEq(open, 0);
        assertFalse(vault.memberOf(lost).dormant, "cancelling brings the member back");
        assertEq(vault.openRequestsBy(heir), 0);
        // Dues restart like wake(): the 11th is past the due day, so April.
        assertEq(vault.memberOf(lost).nextPeriod, DEC_2026 + 4);

        // A new claim needs another dormant vote first.
        vm.prank(heir);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotDormant.selector, lost));
        vault.requestNomineeClaim(lost);

        // Nothing left to cancel.
        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Exits.NoNomineeClaim.selector, lost));
        vault.cancelNomineeClaim();
    }

    function test_S_NOM_03_memberCancelsDuringTheNoticeAndNothingIsPaid() public {
        _goDormant(heir);
        _claimAndPass(heir);
        (, address payTo) = vault.nomineeClaimOf(lost);
        assertEq(payTo, heir);
        assertEq(vault.exitQueueLength(), 1);
        assertTrue(vault.memberOf(lost).exiting);

        vm.warp(block.timestamp + 10 days);
        // The member can't collect or quietly cancel the exit: the claim is ended on purpose.
        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Exits.NomineeClaimPending.selector, lost));
        vault.cancelExit();
        vm.prank(lost);
        vm.expectRevert(abi.encodeWithSelector(Exits.NomineeClaimPending.selector, lost));
        vault.claimExit();

        uint256 shares = vault.memberOf(lost).shares;
        vm.prank(lost);
        vault.cancelNomineeClaim();
        assertEq(vault.exitQueueLength(), 0);
        assertEq(vault.exitOf(lost).requestedAt, 0);
        (, payTo) = vault.nomineeClaimOf(lost);
        assertEq(payTo, address(0));
        Membership.Member memory m = vault.memberOf(lost);
        assertFalse(m.exiting);
        assertFalse(m.dormant);
        assertEq(m.shares, shares);
        assertEq(vault.voterCount(), 12, "back in the quorum base");

        vm.warp(block.timestamp + 30 days);
        uint256 before = heir.balance;
        vault.processExits(10);
        assertEq(heir.balance, before, "the heir gets nothing");
        assertTrue(vault.isMember(lost));
    }

    function test_S_NOM_03_payingDuringAClaimEndsItAndWakesTheMember() public {
        _goDormant(heir);
        _claimAndPass(heir);
        (, uint256 amount,,) = vault.amountDue(lost);
        vm.expectEmit(true, true, false, false, address(vault));
        emit Exits.NomineeClaimCancelled(lost, heir);
        vm.prank(lost);
        vault.contribute{value: amount}();
        assertFalse(vault.memberOf(lost).dormant);
        assertFalse(vault.memberOf(lost).exiting);
        assertEq(vault.exitQueueLength(), 0);
        assertEq(vault.memberOf(lost).nextPeriod, DEC_2026 + 4); // March paid
        _assertBooks();
    }

    function test_S_NOM_03_wakeDuringAnOpenVoteEndsTheClaim() public {
        _goDormant(heir);
        uint256 id = _claim(heir);
        vm.prank(lost);
        vault.wake();
        assertEq(uint8(_status(id)), uint8(Membership.Status.Cancelled));
        assertFalse(vault.canVote(id, honest));
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Membership.RequestNotOpen.selector, id));
        vault.vote(id, true);
    }

    function test_S_NOM_03_askingToExitReplacesTheClaimWithTheMembersOwnExit() public {
        _goDormant(heir);
        _claimAndPass(heir);
        vm.warp(block.timestamp + 5 days);
        vm.prank(lost);
        vault.requestExit();
        (uint256 open, address payTo) = vault.nomineeClaimOf(lost);
        assertEq(open, 0);
        assertEq(payTo, address(0));
        assertEq(vault.exitQueueLength(), 1);
        // A fresh notice from today, paid to the member.
        assertEq(vault.exitOf(lost).maturesAt, block.timestamp + 30 days);

        vm.warp(block.timestamp + 30 days);
        uint256 value = vault.exitValue(lost);
        uint256 before = lost.balance;
        uint256 heirBefore = heir.balance;
        vault.processExits(10);
        assertEq(lost.balance, before + value);
        assertEq(heir.balance, heirBefore);
    }

    // ---------------------------------------------------------------- S-NOM-04

    function test_S_NOM_04_nomineeWhoIsAMemberCannotVoteOnTheClaim() public {
        address friend = members[2];
        _goDormant(friend);
        uint256 id = _claim(friend);
        assertEq(vault.getRequest(id).eligible, 10, "neither lost nor the nominee counts");
        assertFalse(vault.canVote(id, friend));
        assertFalse(vault.canVote(id, lost));
        vm.prank(friend);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotEligibleToVote.selector, id, friend));
        vault.vote(id, true);

        _votes(id, 0, members.length, true);
        Membership.Request memory r = vault.getRequest(id);
        assertEq(uint8(r.status), uint8(Membership.Status.Approved));
        assertLe(r.yes + r.no, r.eligible);
        (, address payTo) = vault.nomineeClaimOf(lost);
        assertEq(payTo, friend);
        // The nominee is still a normal voter elsewhere.
        assertTrue(vault.memberOf(friend).voter);
        assertFalse(vault.memberOf(friend).exiting);
    }

    // ---------------------------------------------------------------- S-NOM-05

    function test_S_NOM_05_changingTheNomineeDuringTheVoteEndsTheClaim() public {
        _goDormant(heir);
        uint256 id = _claim(heir);
        vm.prank(lost);
        vault.setNominee(members[4]);
        assertEq(uint8(_status(id)), uint8(Membership.Status.Cancelled));
        assertEq(vault.nomineeOf(lost), members[4]);
        assertFalse(vault.memberOf(lost).dormant, "the change proves the wallet is held");

        // The old nominee can no longer ask; the new one must wait for a new dormant vote.
        vm.prank(heir);
        vm.expectRevert(abi.encodeWithSelector(Exits.NotNominee.selector, lost));
        vault.requestNomineeClaim(lost);
        vm.prank(members[4]);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotDormant.selector, lost));
        vault.requestNomineeClaim(lost);
    }

    function test_S_NOM_05_changingTheNomineeAfterThePassNeverRedirectsThePayout() public {
        _goDormant(heir);
        _claimAndPass(heir);
        vm.prank(lost);
        vault.setNominee(attacker);
        assertEq(vault.exitQueueLength(), 0, "the approved exit is gone, not redirected");
        (, address payTo) = vault.nomineeClaimOf(lost);
        assertEq(payTo, address(0));

        vm.warp(block.timestamp + 31 days);
        uint256 a = attacker.balance;
        uint256 h = heir.balance;
        vault.processExits(10);
        assertEq(attacker.balance, a);
        assertEq(heir.balance, h);
        assertTrue(vault.isMember(lost));
    }

    // ---------------------------------------------------------------- S-NOM-06

    function test_S_NOM_06_openLoanBlocksTheClaim() public {
        _payAllExcept(address(0));
        vm.prank(lost);
        vault.setNominee(heir);
        vm.prank(lost);
        uint256 lid = vault.requestLoan(AVAX / 2, false, address(0));
        for (uint256 i = 0; i < 11; ++i) {
            if (!vault.canVoteLoan(lid, members[i])) continue;
            vm.prank(members[i]);
            vault.voteLoan(lid, true);
        }
        assertGt(ILoanBookViews(address(vault)).loanOf(lost).principal, 0, "loan paid out");

        _warpTo(2027, 1, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 2, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 3, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 3, 11, 12, 0, 0);
        vm.prank(honest);
        uint256 id = vault.proposeDormant(lost);
        _votes(id, 1, members.length, true);
        Membership.Member memory m = vault.memberOf(lost);
        assertTrue(m.dormant);

        vm.prank(heir);
        if (m.frozen) vm.expectRevert(abi.encodeWithSelector(Exits.MemberFrozen.selector, lost));
        else vm.expectRevert(abi.encodeWithSelector(Exits.HasLoanTies.selector, lost, 1));
        vault.requestNomineeClaim(lost);
    }

    function test_S_NOM_06_activeGuaranteeBlocksTheClaim() public {
        _payAllExcept(address(0));
        vm.prank(lost);
        vault.setNominee(heir);
        address borrower = members[5];
        vm.prank(borrower);
        uint256 lid = vault.requestLoan(AVAX / 2, false, lost);
        vm.prank(lost);
        vault.acceptGuarantee(borrower);
        for (uint256 i = 0; i < 11; ++i) {
            if (!vault.canVoteLoan(lid, members[i])) continue;
            vm.prank(members[i]);
            vault.voteLoan(lid, true);
        }
        LoanBook.Loan memory loan = ILoanBookViews(address(vault)).loanOf(borrower);
        assertEq(loan.guarantor, lost);

        _warpTo(2027, 1, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 2, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 3, 5, 12, 0, 0);
        _payAllExcept(lost);
        _warpTo(2027, 3, 11, 12, 0, 0);
        vm.prank(honest);
        uint256 id = vault.proposeDormant(lost);
        _votes(id, 1, members.length, true);
        assertTrue(vault.memberOf(lost).dormant);

        vm.prank(heir);
        vm.expectRevert(abi.encodeWithSelector(Exits.HasLoanTies.selector, lost, 1));
        vault.requestNomineeClaim(lost);
    }

    // ---------------------------------------------------------------- S-NOM-07

    function test_S_NOM_07_voteFailsAndNothingMoves() public {
        _goDormant(heir);
        uint256 id = _claim(heir);
        _votes(id, 0, members.length, false);
        assertEq(uint8(_status(id)), uint8(Membership.Status.Rejected));
        (uint256 open, address payTo) = vault.nomineeClaimOf(lost);
        assertEq(open, 0);
        assertEq(payTo, address(0));
        assertEq(vault.exitQueueLength(), 0);
        assertTrue(vault.memberOf(lost).dormant);
        assertFalse(vault.memberOf(lost).exiting);
        assertEq(vault.openRequestsBy(heir), 0);

        // The nominee may ask again; the circle decides again.
        uint256 id2 = _claim(heir);
        assertGt(id2, id);
    }

    function test_S_NOM_07_noQuorumExpiresAndAnyoneSettles() public {
        _goDormant(heir);
        uint256 id = _claim(heir);
        _votes(id, 0, 2, true); // 2 of 11: below the 50% quorum
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalize(id);
        assertEq(uint8(_status(id)), uint8(Membership.Status.Expired));
        (uint256 open,) = vault.nomineeClaimOf(lost);
        assertEq(open, 0);
        assertEq(vault.exitQueueLength(), 0);
    }

    function test_S_NOM_07_claimNeeds66PercentOfVotesCast() public {
        _goDormant(heir);
        uint256 id = _claim(heir);
        // 5 yes, 3 no of 11 eligible: quorum met, 62.5% yes. A dormant vote would pass; a
        // claim needs 66%.
        _votes(id, 0, 5, true);
        _votes(id, 5, 8, false);
        assertEq(uint8(_status(id)), uint8(Membership.Status.Open));
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalize(id);
        assertEq(uint8(_status(id)), uint8(Membership.Status.Rejected));
    }

    // ---------------------------------------------------------------- S-NOM-08

    function test_S_NOM_08_passNoticePayoutToTheNominee() public {
        _goDormant(heir);
        uint256 shares = vault.memberOf(lost).shares;
        assertGt(shares, 0);
        uint256 members0 = vault.memberCount();

        uint256 id = _claim(heir);
        uint256 approvedAt = block.timestamp;
        vm.recordLogs();
        _votes(id, 0, members.length, true);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool seen;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] != Exits.NomineeClaimApproved.selector) continue;
            seen = true;
            assertEq(address(uint160(uint256(logs[i].topics[1]))), lost);
            assertEq(address(uint160(uint256(logs[i].topics[2]))), heir);
            (uint256 at, uint256 fee) = abi.decode(logs[i].data, (uint256, uint256));
            assertEq(at, approvedAt + 30 days);
            assertEq(fee, 0);
        }
        assertTrue(seen, "NomineeClaimApproved emitted");

        Exits.Entry memory e = vault.exitOf(lost);
        assertEq(e.maturesAt, approvedAt + 30 days, "the circle's exit notice");
        (bool needed,) = vault.checkUpkeep("");
        assertFalse(needed);

        vm.warp(e.maturesAt - 1);
        assertEq(vault.processExits(10), 0, "not before the notice ends");

        vm.warp(e.maturesAt);
        (needed,) = vault.checkUpkeep("");
        assertTrue(needed);
        uint256 value = vault.exitValue(lost);
        uint256 assets = vault.totalAssets();
        uint256 before = heir.balance;
        vm.expectEmit(true, true, false, true, address(vault));
        emit Exits.NomineePaid(lost, heir, value);
        vm.prank(attacker); // anyone (or Chainlink) runs the queue
        assertEq(vault.processExits(10), 1);

        assertEq(heir.balance, before + value, "paid to the nominee");
        assertEq(vault.totalAssets(), assets - value);
        assertFalse(vault.isMember(lost));
        assertEq(vault.memberCount(), members0 - 1);
        assertEq(vault.dormantCount(), 0);
        assertEq(vault.nomineeOf(lost), address(0), "nominee cleared with the member");
        (, address payTo) = vault.nomineeClaimOf(lost);
        assertEq(payTo, address(0));
        _assertBooks();
    }

    function test_S_NOM_08_exitFeeAppliesAsForAnyExit() public {
        _goDormant(heir);
        // Exit fee 2% in force when the claim passes (set as Governance would).
        uint256 slot = SLOT_RULES + 1;
        uint256 word = uint256(vm.load(address(vault), bytes32(slot)));
        word = (word & ~(uint256(0xffff) << 184)) | (uint256(200) << 184);
        vm.store(address(vault), bytes32(slot), bytes32(word));
        assertEq(vault.rules().exitFeeBps, 200);

        _claimAndPass(heir);
        assertEq(vault.exitOf(lost).feeBps, 200);
        vm.warp(block.timestamp + 30 days);
        uint256 stake = vault.stakeOf(lost);
        uint256 before = heir.balance;
        vault.processExits(10);
        uint256 fee = (stake * 200 + 9999) / 10_000;
        assertEq(heir.balance - before, stake - fee);
        _assertBooks();
    }

    function test_S_NOM_08_nomineeWalletThatRefusesAvaxNeverBlocksTheQueue() public {
        RejectingWallet w = _smartWallet(address(this));
        _goDormant(address(w));
        bytes memory ret =
            w.exec(address(vault), 0, abi.encodeCall(CircleVault.requestNomineeClaim, (lost)));
        uint256 id = abi.decode(ret, (uint256));
        _votes(id, 0, members.length, true);
        address leaver = members[3];
        vm.prank(leaver);
        vault.requestExit();

        vm.warp(block.timestamp + 30 days);
        uint256 value = vault.exitValue(lost);
        uint256 lb = leaver.balance;
        vm.expectEmit(true, false, false, true, address(vault));
        emit Ledger.PayoutQueued(address(w), value);
        assertEq(vault.processExits(10), 2);
        assertEq(vault.withdrawable(address(w)), value, "kept for the nominee to withdraw");
        assertEq(vault.withdrawable(lost), 0, "never credited to the member");
        assertGt(leaver.balance, lb, "the exit behind it was paid");
        uint256 owed = vault.withdrawable(address(w));
        assertGe(address(vault).balance, vault.totalAssets() - vault.loansOutstanding() + owed);
    }

    function test_S_NOM_08_claimNoticeIsAtLeast30DaysAndNeverRageQuitCapped() public {
        _goDormant(heir);
        // Exit notice voted down to 0 days, and a rule change waiting (rage-quit open for 1 day).
        uint256 slot = SLOT_RULES + 1;
        uint256 word = uint256(vm.load(address(vault), bytes32(slot)));
        word &= ~(uint256(0xffff) << 168);
        vm.store(address(vault), bytes32(slot), bytes32(word));
        assertEq(vault.rules().exitNoticeDays, 0);
        uint64 rq = uint64(block.timestamp + 1 days);
        uint256 sw = uint256(vm.load(address(vault), bytes32(SLOT_SWITCHES)));
        sw = (sw & ~(uint256(type(uint64).max) << 64)) | (uint256(rq) << 64);
        vm.store(address(vault), bytes32(SLOT_SWITCHES), bytes32(sw));
        assertEq(vault.rageQuitUntil(), rq);

        // A member's own exit would be paid at once; a claim always waits 30 days.
        vm.prank(members[3]);
        vault.requestExit();
        assertEq(vault.exitOf(members[3]).maturesAt, block.timestamp);
        _claimAndPass(heir);
        assertEq(vault.exitOf(lost).maturesAt, block.timestamp + 30 days);
    }

    /// forge-config: default.isolate = true
    /// forge-config: ci.isolate = true
    function test_S_NOM_10_claimBatchGasSweepNeverHitsPayoutFloor() public {
        // Five dormant members (the creator first, long names, nominees set) are claimed.
        address[5] memory gone = [members[0], members[8], members[9], members[10], members[11]];
        _payAllExcept(address(0));
        for (uint256 i = 0; i < gone.length; ++i) {
            vm.startPrank(gone[i]);
            vault.setDisplayName(string.concat("claimed_member_long_nm", vm.toString(i), "x"));
            vault.setNominee(_actor(string.concat("heir", vm.toString(i))));
            vm.stopPrank();
        }
        for (uint256 m = 1; m <= 3; ++m) {
            _warpTo(2027, m, 5, 12, 0, 0);
            for (uint256 i = 1; i < 8; ++i) {
                _pay(members[i]);
            }
        }
        _warpTo(2027, 3, 11, 12, 0, 0);
        for (uint256 i = 0; i < gone.length; ++i) {
            vm.prank(members[1]);
            uint256 d = vault.proposeDormant(gone[i]);
            _votes(d, 2, 8, true);
            assertTrue(vault.memberOf(gone[i]).dormant);
        }
        for (uint256 i = 0; i < gone.length; ++i) {
            vm.prank(vault.nomineeOf(gone[i]));
            uint256 id = vault.requestNomineeClaim(gone[i]);
            _votes(id, 1, 8, true);
            (, address payTo) = vault.nomineeClaimOf(gone[i]);
            assertTrue(payTo != address(0), "claim queued");
        }
        vm.warp(block.timestamp + 30 days);
        _sweepProcessExits(vault, 150_000, 1_200_000, 2000, gone.length);
        _assertBooks();
    }

    /// @dev RV-NOM-01: the claim writes that touch the exit queue (`cancelNomineeClaim`, `wake`,
    ///      `setNominee`) are locked like `cancelExit`, so a nominee contract can't run them from
    ///      its payout callback while `processExits` walks the queue.
    function test_S_NOM_08_nomineeContractCannotReenterClaimWritesFromItsPayout() public {
        ReentrantAttacker a = _attackerContract();
        a.exec(address(vault), 0, abi.encodeCall(CircleVault.requestToJoin, ("Attacker", honest)));
        _votes(1, 0, members.length, true);
        assertTrue(vault.isMember(address(a)));
        _goDormant(address(a));
        a.exec(address(vault), 0, abi.encodeCall(CircleVault.requestNomineeClaim, (lost)));
        (uint256 claimId,) = vault.nomineeClaimOf(lost);
        _votes(claimId, 0, members.length, true);
        // On receiving the payout it tries to change its own nominee (a queue-touching write).
        a.arm(address(vault), abi.encodeCall(CircleVault.setNominee, (heir)), 0);
        vm.warp(block.timestamp + 30 days);
        uint256 owed = vault.exitValue(lost);
        uint256 before = address(a).balance;
        assertEq(vault.processExits(10), 1);
        assertTrue(a.reentered());
        assertFalse(a.reentrySucceeded());
        assertEq(vault.nomineeOf(address(a)), address(0));
        assertEq(address(a).balance - before + vault.withdrawable(address(a)), owed);
        _assertBooks();
    }

    // ---------------------------------------------------------------- S-NOM-11

    function test_S_NOM_11_claimWaitsItsTurnInTheExitQueue() public {
        _goDormant(heir);
        address leaver = members[3];
        vm.prank(leaver);
        vault.requestExit();
        _claimAndPass(heir);
        address[] memory q = vault.exitQueuePage(0, 10);
        assertEq(q.length, 2);
        assertEq(q[0], leaver);
        assertEq(q[1], lost);

        vm.warp(block.timestamp + 30 days);
        uint256 leaverValue = vault.exitValue(leaver);
        uint256 lb = leaver.balance;
        assertEq(vault.processExits(1), 1);
        assertEq(leaver.balance, lb + leaverValue, "first come, first served");
        assertTrue(vault.isMember(lost));

        uint256 hb = heir.balance;
        uint256 v = vault.exitValue(lost);
        assertEq(vault.processExits(1), 1);
        assertEq(heir.balance, hb + v);
        assertEq(vault.exitQueueLength(), 0);
        _assertBooks();
    }

    function test_S_NOM_11_claimWaitsForCashLikeAnyExitAndBlocksNewLoans() public {
        _goDormant(heir);
        _claimAndPass(heir);
        // Lend out all cash (as LoanBook would), so the claim can't be paid at maturity.
        uint256 cash = vault.cash();
        vm.store(address(vault), bytes32(SLOT_LOANS_OUTSTANDING), bytes32(cash));
        vm.deal(address(vault), address(vault).balance - cash);
        vm.warp(block.timestamp + 30 days);
        assertEq(vault.processExits(10), 0);
        assertTrue(vault.exitOf(lost).waiting);
        assertEq(vault.exitsWaiting(), 1);

        // Cash comes back; the claim is paid and the counter is exact.
        vm.store(address(vault), bytes32(SLOT_LOANS_OUTSTANDING), bytes32(0));
        vm.deal(address(vault), address(vault).balance + cash);
        uint256 hb = heir.balance;
        assertEq(vault.processExits(10), 1);
        assertGt(heir.balance, hb);
        assertEq(vault.exitsWaiting(), 0);
    }

    // ---------------------------------------------------------------- S-NOM-12

    function _dissolve() internal {
        vm.prank(honest);
        uint256 pid = vault.proposeDissolve();
        for (uint256 i = 1; i < members.length && !vault.dissolved(); ++i) {
            if (!vault.canVoteProposal(pid, members[i])) continue;
            vm.prank(members[i]);
            vault.voteProposal(pid, true);
        }
        assertTrue(vault.dissolved());
    }

    function test_S_NOM_12_dissolveAfterThePassStillPaysTheNomineeWithNoFee() public {
        _goDormant(heir);
        _claimAndPass(heir);
        _dissolve();
        vm.warp(block.timestamp + 30 days);
        uint256 stake = vault.stakeOf(lost);
        uint256 hb = heir.balance;
        vault.processExits(10);
        assertEq(heir.balance, hb + stake, "queued exits are paid in full once dissolved");
        _assertBooks();
    }

    function test_S_NOM_12_dissolveWhileTheVoteRunsTheClaimCanStillPass() public {
        _goDormant(heir);
        uint256 id = _claim(heir);
        _dissolve();
        // No new claims once dissolved.
        vm.prank(heir);
        vm.expectRevert(Governance.CircleDissolved.selector);
        vault.requestNomineeClaim(lost);

        _votes(id, 0, members.length, true);
        assertEq(uint8(_status(id)), uint8(Membership.Status.Approved));
        vm.warp(block.timestamp + 30 days);
        uint256 hb = heir.balance;
        uint256 stake = vault.stakeOf(lost);
        vault.processExits(10);
        assertEq(heir.balance, hb + stake);
    }

    function test_S_NOM_12_noClaimCanStartAfterADissolve() public {
        _goDormant(heir);
        _dissolve();
        vm.prank(heir);
        vm.expectRevert(Governance.CircleDissolved.selector);
        vault.requestNomineeClaim(lost);
    }

    function test_S_NOM_12_memberWhoClaimsTheirDissolutionShareEndsTheClaim() public {
        _goDormant(heir);
        _claimAndPass(heir);
        _dissolve();
        uint256 lb = lost.balance;
        vm.prank(lost);
        vault.claimDissolution();
        assertGt(lost.balance, lb);
        (, address payTo) = vault.nomineeClaimOf(lost);
        assertEq(payTo, address(0));
        assertEq(vault.exitQueueLength(), 0);
    }

    // ---------------------------------------------------------------- S-NOM-13

    function test_S_NOM_13_requestCountsTowardTheNomineesOpenCap() public {
        _goDormant(heir);
        _claim(heir);
        assertEq(vault.openRequestsBy(heir), 1);
        assertEq(vault.openRequestCount(), 1);
    }

    function test_S_NOM_13_rejoinedMemberStartsWithNoNominee() public {
        _goDormant(heir);
        _claimAndPass(heir);
        vm.warp(block.timestamp + 30 days);
        vault.processExits(10);
        assertEq(vault.nomineeOf(lost), address(0));
        _admit(lost, "Back Again");
        assertEq(vault.nomineeOf(lost), address(0));
    }

    // ---------------------------------------------------------------- fuzz

    /// @dev Any mix of yes and no votes: a closed claim never leaves an open id behind, and an
    ///      exit is queued (paid to the nominee) exactly when it passed.
    function testFuzz_S_NOM_14_closedClaimStateMatchesTheOutcome(uint8 yes, uint8 no) public {
        _goDormant(heir);
        uint256 id = _claim(heir);
        yes = uint8(bound(yes, 0, 11));
        no = uint8(bound(no, 0, 11 - yes));
        _votes(id, 0, yes, true);
        _votes(id, yes, uint256(yes) + no, false);
        if (_status(id) == Membership.Status.Open) {
            vm.warp(block.timestamp + 48 hours + 1);
            vault.finalize(id);
        }
        Membership.Request memory r = vault.getRequest(id);
        assertLe(r.yes + r.no, r.eligible);
        (uint256 open, address payTo) = vault.nomineeClaimOf(lost);
        assertEq(open, 0);
        bool passed = r.status == Membership.Status.Approved;
        assertEq(payTo, passed ? heir : address(0));
        assertEq(vault.exitQueueLength(), passed ? 1 : 0);
        assertEq(vault.memberOf(lost).exiting, passed);
        assertTrue(vault.memberOf(lost).dormant);
    }
}

/// @notice Nominee payouts in a USDT circle (S-NOM-09, ADR 0046, 0056).
contract CircleVaultNomineeUsdtTest is CircleVaultUsdtBase, NomineeSteps {
    function _cfg()
        internal
        pure
        override(CircleVaultBase, CircleVaultUsdtBase)
        returns (CircleVault.Config memory)
    {
        return CircleVaultUsdtBase._cfg();
    }

    function setUp() public override(CircleVaultBase, CircleVaultUsdtBase) {
        CircleVaultUsdtBase.setUp();
        _nomSetUp();
    }

    function _payAllExcept(address skip) internal override {
        for (uint256 i = 0; i < members.length; ++i) {
            address who = members[i];
            if (who == skip || !vault.isMember(who) || vault.memberOf(who).dormant) continue;
            (,,, bool due) = vault.amountDue(who);
            if (due) _payT(vault, who);
        }
    }

    function _assertSolventWithHeir() internal view {
        assertGe(
            usdt.balanceOf(address(vault)),
            vault.totalAssets() - vault.loansOutstanding() + _sumWithdrawable()
                + vault.withdrawable(heir),
            "vault holds less USDT than it owes"
        );
    }

    function test_S_NOM_09_nomineeIsPaidInUsdt() public {
        _goDormant(heir);
        _claimAndPass(heir);
        vm.warp(block.timestamp + 30 days);
        uint256 value = vault.exitValue(lost);
        assertEq(value, 50 * USD, "December's installment, no fee by default");
        uint256 lostAvax = lost.balance;
        vault.processExits(10);
        assertEq(usdt.balanceOf(heir), value);
        assertEq(lost.balance, lostAvax);
        assertFalse(vault.isMember(lost));
        _assertSolventWithHeir();
    }

    function test_S_NOM_09_blacklistedNomineeWaitsInWithdrawable() public {
        _goDormant(heir);
        _claimAndPass(heir);
        address leaver = members[3];
        vm.prank(leaver);
        vault.requestExit();
        usdt.setBlacklisted(heir, true); // Tether freezes the nominee

        vm.warp(block.timestamp + 30 days);
        uint256 value = vault.exitValue(lost);
        uint256 lb = usdt.balanceOf(leaver);
        assertEq(vault.processExits(10), 2);
        assertEq(vault.withdrawable(heir), value);
        assertEq(usdt.balanceOf(heir), 0);
        assertGt(usdt.balanceOf(leaver), lb, "the exit behind is not blocked");
        _assertSolventWithHeir();

        // Still frozen: withdraw fails and the money stays put.
        vm.prank(heir);
        vm.expectRevert();
        vault.withdraw();

        usdt.setBlacklisted(heir, false);
        vm.prank(heir);
        vault.withdraw();
        assertEq(usdt.balanceOf(heir), value);
        assertEq(vault.withdrawable(heir), 0);
        _assertSolventWithHeir();
    }
}
