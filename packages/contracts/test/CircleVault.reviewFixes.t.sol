// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {Membership} from "../src/modules/Membership.sol";
import {Governance} from "../src/modules/Governance.sol";
import {Exits} from "../src/modules/Exits.sol";
import {LoanBook} from "../src/modules/LoanBook.sol";
import {Ledger} from "../src/modules/Ledger.sol";
import {Rules} from "../src/modules/Rules.sol";
import {GovernanceBase} from "./CircleVault.governance.t.sol";
import {LoanBase} from "./CircleVault.loans.t.sol";

/// @notice Regression tests for the November 2026 security reviews (ADR 0043):
///         docs/redteam/2026-11-governance-review.md (GOV-*), 2026-11-exits-review.md (EXIT-*)
///         and 2026-11-loans-review.md (LOAN-*). Scenario IDs S-RV-* in docs/testing.md. Each
///         test asserts the safe behaviour; the review's proof showed the opposite before.

/// @dev Exit helpers shared by the governance and exit fix tests.
abstract contract ReviewBase is GovernanceBase {
    uint256 internal constant NOTICE = 30 days;

    function _requestExit(address who) internal {
        vm.prank(who);
        vault.requestExit();
    }

    function _payEveryone() internal {
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.isMember(members[i])) continue;
            (,,, bool due) = vault.amountDue(members[i]);
            if (due) _pay(members[i]);
        }
    }

    /// @dev What LoanBook would do: `amount` leaves the vault as a loan.
    function _lendOut(CircleVault v, uint256 amount) internal {
        vm.store(address(v), bytes32(SLOT_LOANS_OUTSTANDING), bytes32(amount));
        vm.deal(address(v), address(v).balance - amount);
    }

    function _repayAll(CircleVault v) internal {
        uint256 out = v.loansOutstanding();
        vm.store(address(v), bytes32(SLOT_LOANS_OUTSTANDING), bytes32(0));
        vm.deal(address(v), address(v).balance + out);
    }

    function _setRageQuitUntil(uint64 t) internal {
        uint256 word = uint256(vm.load(address(vault), bytes32(SLOT_SWITCHES)));
        word = (word & ~(uint256(type(uint64).max) << 64)) | (uint256(t) << 64);
        vm.store(address(vault), bytes32(SLOT_SWITCHES), bytes32(word));
    }
}

/// @notice GOV-* fixes and the storage layout check.
contract CircleVaultReviewGovTest is ReviewBase {
    function test_S_RV_LAYOUT_storageSlotsUsedByTestsDidNotMove() public {
        _payEveryone();
        assertEq(uint256(vm.load(address(vault), bytes32(SLOT_LEDGER))), vault.totalAssets());
        bytes32 m = keccak256(abi.encode(honest, SLOT_MEMBERS));
        assertEq(uint8(uint256(vm.load(address(vault), m))), 1, "active flag");
        _requestExit(honest);
        // Membership.Member: exiting is byte 23 of the first slot.
        assertEq(uint8(uint256(vm.load(address(vault), m)) >> (8 * 23)), 1, "exiting flag");
        // Exits.Store: `first` is the second slot (after the entries mapping).
        assertEq(
            address(uint160(uint256(vm.load(address(vault), bytes32(SLOT_EXITS + 1))))), honest
        );
        uint256 rules2 = uint256(vm.load(address(vault), bytes32(SLOT_RULES + 1)));
        assertEq(uint16(rules2 >> (8 * 21)), vault.rules().exitNoticeDays, "rules layout");
    }

    // GOV-01: a dissolve needs the pass mark of all eligible members, not of votes cast.
    function test_S_RV_GOV_01_halfTheCircleCannotDissolve() public {
        vm.prank(honest);
        uint256 id = vault.proposeDissolve();
        assertTrue(vault.proposal(id).memberBar);
        _govVotes(vault, members, id, 5, true); // 6 of 12: quorum met, 100% of votes cast
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalizeProposal(id);
        assertFalse(vault.dissolved(), "6 of 12 members dissolved the circle");
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Expired));
    }

    function test_S_RV_GOV_01_proposerAloneCannotDissolveAtLowQuorum() public {
        CircleVault.Config memory c = _cfg();
        c.quorumPct = 20;
        c.minPaidToVote = 0;
        address[] memory list = new address[](5);
        for (uint256 i = 0; i < 5; ++i) {
            list[i] = members[i];
        }
        CircleVault v = _createCircle(c, list);
        vm.prank(list[0]);
        uint256 id = v.proposeDissolve();
        vm.warp(block.timestamp + 48 hours + 1);
        v.finalizeProposal(id);
        assertFalse(v.dissolved(), "one member of five dissolved the circle");
    }

    // GOV-02 + EXIT-07: once dissolved, no new exits and a queued exit is paid with no fee.
    function test_S_RV_GOV_02_pendingExitAtDissolveIsPaidWithoutFee() public {
        CircleVault.Config memory c = _cfg();
        c.rules.exitFeeBps = 1000; // 10%, the maximum
        address[] memory list = new address[](3);
        for (uint256 i = 0; i < 3; ++i) {
            list[i] = members[i];
        }
        CircleVault v = _createCircle(c, list);
        _payAll(v, list);
        uint256 stake = v.stakeOf(list[2]);

        vm.prank(list[2]);
        v.requestExit(); // 30-day notice
        _dissolve(v, list); // members 0 and 1: 2 of the 2 eligible voters
        assertEq(v.exitValue(list[2]), stake, "no fee shown once dissolved");

        vm.prank(list[1]);
        vm.expectRevert(Governance.CircleDissolved.selector);
        v.requestExit();

        vm.warp(block.timestamp + 30 days);
        uint256 before = list[2].balance;
        vm.prank(outsider);
        v.processExits(10);
        assertEq(list[2].balance - before, stake, "exiter paid the fee after the dissolve");
    }

    function test_S_RV_GOV_02_dissolutionClaimClearsAWaitingExit() public {
        _payEveryone();
        _requestExit(members[5]);
        vm.warp(block.timestamp + NOTICE);
        _lendOut(vault, vault.cash());
        vault.processExits(10);
        assertEq(vault.exitsWaiting(), 1);
        _repayAll(vault);
        _dissolve(vault, members);
        vm.prank(members[5]);
        vault.claimDissolution();
        assertEq(vault.exitsWaiting(), 0, "exitsWaiting stays exact");
        assertEq(vault.exitQueueLength(), 0);
        assertFalse(vault.isMember(members[5]));
    }

    // GOV-03: a risky change needs the dissolve pass mark of all eligible members.
    function test_S_RV_GOV_03_riskyRuleChangeNeedsTheDissolveBar() public {
        Rules.Params memory r = vault.rules();
        r.dissolvePassPct = 50; // lowering the dissolve bar is risky
        vm.prank(honest);
        uint256 id = vault.proposeRuleChange(r);
        Governance.Proposal memory p = vault.proposal(id);
        assertTrue(p.memberBar);
        assertEq(p.passPct, 66);
        _govVotes(vault, members, id, 6, true); // 7 of 12 = 58%: a majority, not 66%
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Open));
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalizeProposal(id);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Expired));
        (, uint64 at) = vault.pendingRuleChange();
        assertEq(at, 0);
    }

    function test_S_RV_GOV_03_eachRiskyFieldIsDetected() public {
        Rules.Params[11] memory risky;
        for (uint256 i = 0; i < 11; ++i) {
            risky[i] = vault.rules(); // a fresh copy each time (memory structs alias)
        }
        risky[0].passPct = 60;
        risky[1].dissolvePassPct = 70;
        risky[2].ruleChangeDelayDays = 10;
        risky[3].exitNoticeDays = 10;
        risky[4].exitFeeBps = 100;
        risky[5].interestBps = 120;
        risky[6].tenor2Bps = 160;
        risky[7].tenor3Bps = 210;
        risky[8].reserveBps = 1000;
        risky[9].maxLoanBps = 5000;
        risky[10].kMultiplier = 3;
        for (uint256 i = 0; i < 11; ++i) {
            vm.prank(members[i]);
            uint256 id = vault.proposeRuleChange(risky[i]);
            assertTrue(vault.proposal(id).memberBar, "risky field not detected");
            vm.prank(members[i]);
            vault.cancelProposal(id);
        }
        // Safer moves keep the ordinary bar.
        Rules.Params memory safe = vault.rules();
        safe.exitNoticeDays = 60;
        safe.reserveBps = 3000;
        safe.kMultiplier = 1;
        vm.prank(members[11]);
        uint256 sid = vault.proposeRuleChange(safe);
        assertFalse(vault.proposal(sid).memberBar);
        assertEq(vault.proposal(sid).passPct, 50);
    }

    // GOV-04 / RT-24: a passed change is in force from effectiveAt, and any write applies it.
    function test_S_RV_GOV_04_rulesSwitchOverAutomatically() public {
        _passRuleChange(); // effective Jan 1 2027
        vm.warp(JAN_1_2027 + 14 days);
        assertEq(vault.rules().interestBps, 50, "old rules still shown mid-January");
        (, uint64 at) = vault.pendingRuleChange();
        assertEq(at, JAN_1_2027);
        _pay(honest); // any write that reads the rules applies the change
        (, at) = vault.pendingRuleChange();
        assertEq(at, 0, "change applied by contribute");
        assertEq(vault.rules().interestBps, 50);
    }

    // GOV-05: no forwarded entry point leaves the (transient) lock set in the same tx.
    function test_S_RV_GOV_05_forwardedCallsNeverLeaveTheLockSet() public {
        vm.prank(members[1]);
        uint256 rc = vault.proposeRuleChange(_newRules());
        vm.prank(members[2]);
        uint256 w = vault.proposeFeeWaiver(members[11], DEC_2026, Governance.Reason.Other);
        vm.prank(members[3]);
        uint256 g = vault.proposeGuardianOff();
        vm.prank(members[4]);
        uint256 d = vault.proposeDissolve();
        vm.prank(members[5]);
        vault.voteProposal(g, false);
        vm.prank(members[4]);
        vault.cancelProposal(d);
        _govVotes(vault, members, rc, 6, true); // the deciding vote closes it
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalizeProposal(w);
        vm.warp(JAN_1_2027);
        vault.applyRuleChange();
        // Same transaction context: a nonReentrant entry point still works.
        _payEveryone();
        vm.prank(honest);
        vault.requestExit();
        assertTrue(vault.memberOf(honest).exiting);
    }

    // GOV-07: no cancel after the window closed.
    function test_S_RV_GOV_07_proposerCannotCancelAfterTheDeadline() public {
        vm.prank(honest);
        uint256 id = vault.proposeRuleChange(_newRules());
        _govVotes(vault, members, id, 5, true); // 6 yes, 0 no: passes only at the end
        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Governance.ProposalVotingClosed.selector, id));
        vault.cancelProposal(id);
        vault.finalizeProposal(id);
        assertEq(uint8(_status(vault, id)), uint8(Governance.Status.Approved));
    }

    // GOV-09: only current voters propose waivers; never for a dormant member.
    function test_S_RV_GOV_09_dormantOrBehindMembersCannotOpenWaivers() public {
        for (uint256 m = 0; m < 4; ++m) {
            for (uint256 i = 0; i < 11; ++i) {
                (,,, bool due) = vault.amountDue(members[i]);
                if (due) _pay(members[i]);
            }
            vm.warp(block.timestamp + 31 days);
        }
        for (uint256 i = 0; i < 11; ++i) {
            (,,, bool due) = vault.amountDue(members[i]);
            if (due) _pay(members[i]);
        }
        address d = members[11];
        uint256 p = vault.memberOf(d).nextPeriod;
        // Behind (not a current voter): can't propose, even for themselves.
        vm.prank(d);
        vm.expectRevert(abi.encodeWithSelector(Governance.NotAllowedToPropose.selector, d));
        vault.proposeFeeWaiver(d, p, Governance.Reason.Other);

        vm.prank(honest);
        uint256 rid = vault.proposeDormant(d);
        _votes(rid, 1, 11, true);
        assertTrue(vault.memberOf(d).dormant, "setup: not dormant");
        // Dormant: owes nothing, so no waiver from anyone.
        vm.prank(members[1]);
        vm.expectRevert(abi.encodeWithSelector(Governance.InvalidWaiver.selector, d, p));
        vault.proposeFeeWaiver(d, p, Governance.Reason.Other);
    }

    function test_S_RV_GOV_views_hasVotedProposal() public {
        vm.prank(honest);
        uint256 id = vault.proposeGuardianOff();
        assertTrue(vault.hasVotedProposal(id, honest));
        assertFalse(vault.hasVotedProposal(id, late));
        assertEq(vault.lastPauseAt(), 0);
        vm.prank(honest);
        vault.pause();
        assertEq(vault.lastPauseAt(), block.timestamp);
    }

    // GOV-13 (sound, kept as regression): dirty or short calldata never reaches storage.
    function test_S_RV_GOV_13_forwarderRejectsDirtyAndShortCalldata() public {
        bytes memory good = abi.encodeCall(CircleVault.proposeRuleChange, (_newRules()));
        bytes memory dirty = abi.encodeCall(CircleVault.proposeRuleChange, (_newRules()));
        // field 1 = tenorMonths (uint8): set a high bit.
        // solhint-disable-next-line no-inline-assembly
        assembly {
            mstore(add(dirty, add(0x20, add(4, 0x20))), 0x0106)
        }
        vm.prank(honest);
        (bool ok,) = address(vault).call(dirty);
        assertFalse(ok, "dirty uint8 accepted");

        bytes memory short = new bytes(good.length - 32);
        for (uint256 i = 0; i < short.length; ++i) {
            short[i] = good[i];
        }
        vm.prank(honest);
        (ok,) = address(vault).call(short);
        assertFalse(ok, "short calldata accepted");

        vm.prank(honest);
        (ok,) = address(vault).call(good);
        assertTrue(ok);
        assertEq(vault.proposalCount(), 1);
    }

    // GOV-13b (sound): a view called through CALL (not STATICCALL) writes nothing.
    function test_S_RV_GOV_13_viewPathDoesNotWrite() public {
        vm.prank(honest);
        uint256 id = vault.proposeGuardianOff();
        (bool ok, bytes memory ret) =
            address(vault).call(abi.encodeCall(CircleVault.proposal, (id)));
        assertTrue(ok);
        Governance.Proposal memory pr = abi.decode(ret, (Governance.Proposal));
        assertEq(pr.yes, 1);
        assertEq(vault.proposalCount(), 1);
    }
}

/// @notice EXIT-* fixes.
contract CircleVaultReviewExitsTest is ReviewBase {
    function setUp() public override {
        super.setUp();
        _payEveryone(); // December
    }

    function _churn(uint256 cycles) internal {
        _requestExit(members[2]);
        _requestExit(members[3]);
        for (uint256 i = 0; i < cycles; ++i) {
            vm.prank(members[2]);
            vault.cancelExit();
            _requestExit(members[2]);
            vm.prank(members[3]);
            vault.cancelExit();
            _requestExit(members[3]);
        }
    }

    // EXIT-01: request/cancel churn leaves nothing behind; cancel stays O(1).
    function test_S_RV_EXIT_01_cancelChurnLeavesNoGap() public {
        _requestExit(members[1]); // an exit in its notice holds the front
        _churn(300);
        _requestExit(members[4]);
        assertEq(vault.exitQueueLength(), 4, "only live exits are queued");
        uint256 g = gasleft();
        vm.prank(members[4]);
        vault.cancelExit();
        assertLt(g - gasleft(), 100_000, "cancel is O(1)");
        address[] memory page = vault.exitQueuePage(0, 10);
        assertEq(page.length, 3);
        assertEq(page[0], members[1]);
    }

    function test_S_RV_EXIT_01_twoWaitersArePaidOnceCashReturns() public {
        _requestExit(members[1]); // 30-day notice at the front
        _churn(50);
        vm.prank(members[2]);
        vault.cancelExit();
        vm.prank(members[3]);
        vault.cancelExit();
        _setRageQuitUntil(uint64(block.timestamp + 7 days));
        _requestExit(members[4]);
        _requestExit(members[5]);
        vm.warp(block.timestamp + 7 days);
        _lendOut(vault, vault.cash());
        vm.prank(members[5]);
        assertFalse(vault.claimExit());
        assertEq(vault.exitsWaiting(), 2, "both marked, in order");
        _repayAll(vault);
        vm.prank(members[5]);
        assertTrue(vault.claimExit(), "settles members[4] first, then pays members[5]");
        assertFalse(vault.isMember(members[4]));
        assertFalse(vault.isMember(members[5]));
        assertEq(vault.exitsWaiting(), 0);
    }

    // EXIT-02: self-claims never blind the keeper.
    function test_S_RV_EXIT_02_upkeepStillSeesMaturedExitsAfterSelfClaims() public {
        for (uint256 i = 2; i < 10; ++i) {
            _requestExit(members[i]);
        }
        vm.warp(block.timestamp + NOTICE);
        for (uint256 i = 2; i < 9; ++i) {
            vm.prank(members[i]);
            assertTrue(vault.claimExit());
        }
        (bool needed,) = vault.checkUpkeep("");
        assertTrue(needed, "keeper sees the last matured exit");
        vault.performUpkeep("");
        assertFalse(vault.isMember(members[9]));
        (needed,) = vault.checkUpkeep("");
        assertFalse(needed);
    }

    // EXIT-03: rage-quit exits mature at min(now + notice, switch) under the old rules.
    function test_S_RV_EXIT_03_rageQuitNeverInstantNeverAfterTheSwitch() public {
        _setRageQuitUntil(uint64(block.timestamp + 40 days)); // longer than the 30-day notice
        _requestExit(members[2]);
        assertEq(vault.exitOf(members[2]).maturesAt, block.timestamp + NOTICE);
        _setRageQuitUntil(uint64(block.timestamp + 5 days));
        _requestExit(members[3]);
        assertEq(vault.exitOf(members[3]).maturesAt, block.timestamp + 5 days);
        vm.prank(members[3]);
        vm.expectRevert(
            abi.encodeWithSelector(Exits.ExitNotReady.selector, block.timestamp + 5 days)
        );
        vault.claimExit();
    }

    // EXIT-04 (by design, ADR 0043): arrears are forgiven on exit; missed months bought no shares.
    function test_S_RV_EXIT_04_arrearsAreForgivenOnExitByDesign() public {
        address leaver = members[6];
        _warpTo(2027, 4, 25, 12, 0, 0);
        for (uint256 i = 0; i < 12; ++i) {
            if (members[i] == leaver) continue;
            while (true) {
                (,,, bool due) = vault.amountDue(members[i]);
                if (!due) break;
                _pay(members[i]);
            }
        }
        uint256 stake = vault.stakeOf(leaver);
        _requestExit(leaver);
        vm.warp(block.timestamp + NOTICE);
        uint256 before = leaver.balance;
        vault.processExits(1);
        assertEq(leaver.balance - before, stake);
    }

    // EXIT-05: a later claimant can't take cash ahead of an earlier matured exit.
    function test_S_RV_EXIT_05_claimCannotJumpTheQueue() public {
        _requestExit(members[7]); // first in line
        _requestExit(members[8]);
        vm.warp(block.timestamp + NOTICE);
        uint256 one = vault.exitValue(members[8]);
        _lendOut(vault, vault.cash() - one - 1); // cash for exactly one payout
        vm.prank(members[8]);
        assertFalse(vault.claimExit(), "the earlier exit is paid first");
        assertFalse(vault.isMember(members[7]));
        assertTrue(vault.isMember(members[8]));
        assertEq(vault.exitsWaiting(), 1);
    }

    // EXIT-06: a leaver can't vote or propose and leaves the quorum base until they cancel.
    function test_S_RV_EXIT_06_leaverLosesTheVoteUntilCancel() public {
        vm.prank(honest);
        uint256 id = vault.proposeGuardianOff();
        uint256 voters = vault.voterCount();
        _requestExit(late);
        assertTrue(vault.memberOf(late).exiting);
        assertEq(vault.voterCount(), voters - 1);
        assertFalse(vault.canVoteProposal(id, late));
        vm.prank(late);
        vm.expectRevert(abi.encodeWithSelector(Governance.NotAllowedToPropose.selector, late));
        vault.proposeDissolve();

        vm.prank(late);
        vault.cancelExit();
        assertFalse(vault.memberOf(late).exiting);
        assertEq(vault.voterCount(), voters);
        // A fresh stamp: no vote on the proposal opened before, yes on new ones.
        assertFalse(vault.canVoteProposal(id, late));
        vm.prank(late);
        vault.proposeDissolve();
    }

    // EXIT-09: the caller can't tune gas to push a payout into `withdrawable`.
    function test_S_RV_EXIT_09_tunedGasNeverPushesAPayoutIntoWithdrawable() public {
        Hungry h = new Hungry();
        vm.deal(address(h), FUNDS);
        address[] memory f = new address[](3);
        f[0] = late;
        f[1] = members[2];
        f[2] = members[3];
        CircleVault v = _createCircle(_cfg(), f);
        _payAll(v, f);
        h.exec(address(v), 0, abi.encodeCall(CircleVault.requestToJoin, ("Hungry", late)));
        vm.prank(late);
        v.vote(1, true);
        vm.prank(members[2]);
        v.vote(1, true);
        (, uint256 due,,) = v.amountDue(address(h));
        h.exec(address(v), due, abi.encodeCall(CircleVault.contribute, ()));
        h.exec(address(v), 0, abi.encodeCall(CircleVault.requestExit, ()));
        vm.warp(block.timestamp + NOTICE);

        for (uint256 gl = 60_000; gl < 400_000; gl += 1000) {
            uint256 snap = vm.snapshotState();
            try v.processExits{gas: gl}(1) returns (uint256) {
                assertEq(v.withdrawable(address(h)), 0, "payout refused for lack of gas");
            } catch {}
            vm.revertToState(snap);
        }
        v.processExits(1);
        assertEq(v.withdrawable(address(h)), 0);
        assertFalse(v.isMember(address(h)));
    }

    // EXIT-11: the guardian role ends for good once the creator leaves.
    function test_S_RV_EXIT_11_creatorWhoLeavesNeverGuardsAgain() public {
        vm.prank(honest);
        vault.pause();
        _requestExit(honest);
        vm.warp(block.timestamp + NOTICE);
        vault.processExits(10);
        assertFalse(vault.isMember(honest));
        assertTrue(vault.guardianDisabled());
        assertEq(vault.pausedUntil(), 0, "the pause ended with the guardian");

        vm.prank(honest);
        uint256 id = vault.requestToJoin("Back", address(0));
        _votes(id, 1, members.length, true);
        assertTrue(vault.isMember(honest), "setup: rejoined");
        vm.warp(block.timestamp + 91 days);
        vm.prank(honest);
        vm.expectRevert(Exits.GuardianOff.selector);
        vault.pause();
    }
}

/// @notice LOAN-* fixes and the loan parts of GOV-06.
contract CircleVaultReviewLoansTest is LoanBase {
    function _passDissolve() internal {
        vm.prank(honest);
        uint256 pid = vault.proposeDissolve();
        for (uint256 i = 1; i < members.length && !vault.dissolved(); ++i) {
            if (!vault.canVoteProposal(pid, members[i])) continue;
            vm.prank(members[i]);
            vault.voteProposal(pid, true);
        }
        assertTrue(vault.dissolved());
    }

    function _bombCircle(BombWallet w) internal returns (CircleVault v, address[] memory f) {
        f = new address[](12);
        for (uint256 i = 0; i < 12; ++i) {
            f[i] = members[i];
        }
        f[2] = address(w);
        v = _createCircleNoAccept(_cfg(), f);
        for (uint256 i = 1; i < 12; ++i) {
            if (i == 2) continue;
            vm.prank(f[i]);
            v.acceptInvite();
        }
        w.exec(address(v), 0, abi.encodeCall(CircleVault.acceptInvite, ()));
        for (uint256 i = 0; i < 12; ++i) {
            if (i == 2) continue;
            _payIn(v, f[i]);
        }
        w.exec(address(v), AVAX / 2, abi.encodeCall(CircleVault.contribute, ()));
    }

    // LOAN-01: one stake never backs two loans (no mutual or self-reused guarantees).
    function test_S_RV_LOAN_01_mutualAndReusedGuaranteesAreRefused() public {
        uint256 combined = vault.stakeOf(borrower) + vault.stakeOf(guarantor);
        _borrow(borrower, 2 * combined, guarantor);
        // The guarantor can't borrow while guaranteeing.
        vm.prank(guarantor);
        vm.expectRevert(
            abi.encodeWithSelector(LoanBook.AlreadyGuaranteeing.selector, guarantor, borrower)
        );
        vault.requestLoan(LOAN, false, borrower);
        // The borrower can't guarantee anyone while holding a loan.
        vm.prank(members[4]);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.InvalidGuarantor.selector, borrower));
        vault.requestLoan(LOAN, false, borrower);
        // Nor can a member with an open request of their own.
        _ask(members[5], 1e17, false, address(0));
        vm.prank(members[6]);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.InvalidGuarantor.selector, members[5]));
        vault.requestLoan(1e17, false, members[5]);
    }

    function test_S_RV_LOAN_01_guarantorWhoAsksForALoanCannotThenAccept() public {
        uint256 id = _ask(borrower, LOAN, false, guarantor); // names guarantor, not accepted yet
        _ask(guarantor, 1e17, false, address(0));
        vm.prank(guarantor);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.InvalidGuarantor.selector, guarantor));
        vault.acceptGuarantee(borrower);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Open));
    }

    // LOAN-02 + GOV-06: after a dissolve a default is settled with no vote, claims pay cash as it
    // comes in, and the vault always empties.
    function test_S_RV_LOAN_02_dissolvedCircleSettlesDefaultsAndEmpties() public {
        _borrow(borrower, LOAN, guarantor); // Dec 2026
        _passDissolve();
        // Untied members take their share of the cash now.
        uint256 out = vault.loansOutstanding();
        for (uint256 i = 0; i < members.length; ++i) {
            address a = members[i];
            if (a == borrower || a == guarantor) continue;
            vm.prank(a);
            vault.claimDissolution();
            assertTrue(vault.isMember(a), "stays while a loan is out");
        }
        vm.prank(guarantor);
        vm.expectRevert(abi.encodeWithSelector(Exits.ClaimBlockedByLoan.selector, guarantor));
        vault.claimDissolution();

        // Mar 11 2027: 2 interest months overdue. Anyone settles at once, no vote.
        _warpTo(2027, 3, 11, 12, 0, 0);
        vault.markDefault(borrower);
        vm.prank(outsider);
        assertEq(vault.proposeSettle(borrower), 0);
        assertEq(vault.loansOutstanding(), 0);
        assertEq(out, LOAN);

        // Everyone claims the rest and leaves; the vault empties.
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.isMember(members[i])) continue;
            vm.prank(members[i]);
            vault.claimDissolution();
            assertFalse(vault.isMember(members[i]));
        }
        assertEq(vault.totalShares(), 0);
        assertEq(vault.totalAssets(), 0);
        assertEq(address(vault).balance, _totalWithdrawable());
    }

    // LOAN-03 + item 12: a return-bomb or gas-burning borrower can't block disbursal.
    function test_S_RV_LOAN_03_returnBombBorrowerGetsWithdrawableAndTheVoteCloses() public {
        BombWallet w = new BombWallet();
        vm.deal(address(w), FUNDS);
        (CircleVault v, address[] memory f) = _bombCircle(w);
        address g = f[3];
        w.exec(address(v), 0, abi.encodeCall(CircleVault.requestLoan, (LOAN, false, g)));
        vm.prank(g);
        v.acceptGuarantee(address(w));
        w.setArmed(true);
        uint256[6] memory who = [uint256(0), 1, 4, 5, 6, 7];
        for (uint256 i = 0; i < 6; ++i) {
            vm.prank(f[who[i]]);
            v.voteLoan(1, true);
        }
        // No return data is copied, so the bomb costs the vault nothing: paid, vote closed.
        assertEq(uint8(ILoanReq(address(v)).loanRequest(1).status), uint8(LoanBook.Status.Approved));
        assertEq(v.loansOutstanding(), LOAN);
        assertEq(address(v).balance, v.totalAssets() - LOAN + v.withdrawable(address(w)));
    }

    function test_S_RV_LOAN_03_gasBurningBorrowerEndsUpWithdrawable() public {
        Burner w = new Burner();
        vm.deal(address(w), FUNDS);
        BombWallet dummy = BombWallet(payable(address(w)));
        (CircleVault v,) = _bombCircle(dummy);
        w.exec(address(v), 0, abi.encodeCall(CircleVault.requestLoan, (LOAN, false, address(0))));
        uint256[6] memory who = [uint256(0), 1, 3, 4, 5, 6];
        for (uint256 i = 0; i < 6; ++i) {
            vm.prank(members[who[i]]);
            v.voteLoan(1, true);
        }
        assertEq(v.withdrawable(address(w)), LOAN, "the vote didn't revert");
    }

    // LOAN-04: a rule change after payout never reprices or re-times a running loan.
    function test_S_RV_LOAN_04_defaultAfterAndFeeAreFixedAtPayout() public {
        _borrow(borrower, LOAN, address(0)); // Dec 2026, defaultAfter = 2, fee = 0.01
        Rules.Params memory r = vault.rules();
        r.defaultAfter = 1;
        r.interestFee = uint128(AVAX / 10);
        vm.prank(honest);
        uint256 pid = vault.proposeRuleChange(r);
        for (uint256 i = 1; i < members.length; ++i) {
            if (!vault.canVoteProposal(pid, members[i])) continue;
            vm.prank(members[i]);
            vault.voteProposal(pid, true);
        }
        _nextMonths(1); // Jan 1 2027: the change is in force
        assertEq(vault.rules().defaultAfter, 1);
        _warpTo(2027, 1, 11, 12, 0, 0); // January interest 1 month overdue
        vm.expectRevert(abi.encodeWithSelector(LoanBook.NotInDefault.selector, borrower));
        vault.markDefault(borrower);
        (, uint256 fees,) = vault.interestDue(borrower);
        assertEq(fees, FEE, "late fee stays the loan's own");
        assertEq(_loan(borrower).defaultAfter, 2);
    }

    /// @dev Everyone but the borrower and guarantor pays every installment due.
    function _payOthers() internal {
        for (uint256 i = 0; i < members.length; ++i) {
            address a = members[i];
            if (a == borrower || a == guarantor) continue;
            while (true) {
                (,,, bool due) = vault.amountDue(a);
                if (!due) break;
                _pay(a);
            }
        }
    }

    // LOAN-05: a medical loan whose cap was lowered before payout closes as Failed.
    function test_S_RV_LOAN_05_payoutRechecksTheMedicalCap() public {
        Rules.Params memory r = _defaults();
        r.medicalCap = uint128(AVAX);
        _withRules(r);
        uint256 id = _ask(borrower, LOAN, true, address(0));
        // A rule change in force sets the cap to 0 (medical off): bytes 13..28 of rules slot 0.
        uint256 word = uint256(vm.load(address(vault), bytes32(SLOT_RULES)));
        word &= ~(uint256(type(uint128).max) << (8 * 13));
        vm.store(address(vault), bytes32(SLOT_RULES), bytes32(word));
        assertEq(vault.rules().medicalCap, 0);
        _loanVotes(id, 0, members.length, true);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Failed));
        assertEq(vault.loansOutstanding(), 0);
    }

    // LOAN-06: a settle charges interest and fees only up to the default month.
    function test_S_RV_LOAN_06_settleDebtStopsAtTheDefaultMonth() public {
        _borrow(borrower, LOAN, guarantor);
        _warpTo(2027, 1, 5, 12, 0, 0);
        _payOthers();
        _warpTo(2027, 2, 11, 12, 0, 0);
        _payOthers();
        vault.markDefault(borrower);
        (uint256 i0, uint256 f0,) = vault.interestDue(borrower);
        uint256 debt = LOAN + i0 + f0;
        for (uint256 mo = 3; mo <= 6; ++mo) {
            _warpTo(2027, mo, 5, 12, 0, 0); // months pass before the settle
            _payOthers();
        }
        (uint256 i1, uint256 f1,) = vault.interestDue(borrower);
        assertGt(i1 + f1, i0 + f0, "a cure would still pay everything owed");

        vm.prank(members[4]);
        uint256 id = vault.proposeSettle(borrower);
        uint256 bStake = vault.stakeOf(borrower);
        vm.recordLogs();
        _loanVotes(id, 5, members.length, true);
        assertEq(vault.loansOutstanding(), 0);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool seen;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] != LoanBook.LoanSettled.selector) continue;
            (uint256 fromB, uint256 fromG, uint256 writtenOff) =
                abi.decode(logs[i].data, (uint256, uint256, uint256));
            assertEq(fromB, bStake);
            assertEq(fromG, debt - bStake, "debt frozen at the default month");
            assertEq(writtenOff, 0);
            seen = true;
        }
        assertTrue(seen);
    }

    // LOAN-07: an exit whose notice ended blocks disbursal even before anyone marks it.
    function test_S_RV_LOAN_07_maturedUnmarkedExitBlocksDisbursal() public {
        vm.prank(members[9]);
        vault.requestExit();
        vm.warp(block.timestamp + 30 days);
        assertEq(vault.exitsWaiting(), 0);
        uint256 id = _ask(borrower, LOAN, false, address(0));
        _loanVotes(id, 0, members.length, true);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Open), "disbursal waits");
        vault.processExits(10);
        vault.finalizeLoan(id);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Approved));
    }

    // LOAN-08: a frozen (defaulted) member can't vote.
    function test_S_RV_LOAN_08_frozenMembersCannotVote() public {
        _borrow(borrower, LOAN, guarantor);
        _warpTo(2027, 2, 11, 12, 0, 0);
        _payAll();
        vault.markDefault(borrower);
        assertTrue(vault.memberOf(guarantor).frozen);
        uint256 id = _ask(members[4], 1e17, false, address(0));
        assertFalse(vault.canVoteLoan(id, guarantor));
        vm.prank(honest);
        uint256 pid = vault.proposeGuardianOff();
        assertFalse(vault.canVoteProposal(pid, guarantor));
    }

    // LOAN-09: a member in exit notice can't borrow or guarantee.
    function test_S_RV_LOAN_09_leaversCannotBorrowOrGuarantee() public {
        vm.prank(members[6]);
        vault.requestExit();
        vm.prank(members[6]);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.MemberExiting.selector, members[6]));
        vault.requestLoan(1e17, false, address(0));
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.MemberExiting.selector, members[6]));
        vault.requestLoan(1e17, false, members[6]);

        uint256 id = _ask(borrower, 1e17, false, guarantor);
        vm.prank(guarantor);
        vault.requestExit(); // not tied until they accept
        vm.prank(guarantor);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.MemberExiting.selector, guarantor));
        vault.acceptGuarantee(borrower);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Open));
    }

    // LOAN-11: loanRequest(0) reverts with a clean error, not a panic.
    function test_S_RV_LOAN_11_loanRequestZeroRevertsCleanly() public {
        vm.expectRevert(abi.encodeWithSelector(LoanBook.LoanRequestNotOpen.selector, 0));
        _req(0);
    }

    function test_S_RV_LOAN_payoutGasFloor() public {
        // A disbursal reverts (rather than queueing the payout) when the caller sends too little
        // gas for the capped transfer.
        uint256 id = _ask(borrower, LOAN, false, address(0));
        _loanVotes(id, 0, 6, true); // 5 yes of 11: the next yes decides it
        vm.prank(members[7]);
        vm.expectRevert();
        vault.voteLoan{gas: 200_000}(id, true);
        assertEq(Ledger.PAYOUT_GAS, 50_000);
    }
}

/// @notice Member wallet that answers a payout with a return bomb sized to its own gas.
contract BombWallet {
    bool public armed;

    function setArmed(bool a) external {
        armed = a;
    }

    function exec(address to, uint256 value, bytes calldata data) external payable {
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {
        if (!armed) return;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let g := mul(gas(), 486)
            let x := g
            let y := shr(1, add(x, 1))
            for {} lt(y, x) {} {
                x := y
                y := shr(1, add(div(g, x), x))
            }
            return(0, mul(x, 32))
        }
    }
}

/// @notice Member wallet whose `receive` burns all the gas it gets.
contract Burner {
    function exec(address to, uint256 value, bytes calldata data) external payable {
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {
        // solhint-disable-next-line no-empty-blocks
        while (true) {}
    }
}

/// @notice A smart wallet whose `receive` needs about 30k gas (well under the 50k cap).
contract Hungry {
    uint256[4] internal sink;

    function exec(address to, uint256 value, bytes calldata data) external {
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {
        if (msg.sender.code.length == 0) return;
        require(gasleft() >= 47_000, "needs gas");
    }
}

interface ILoanReq {
    function loanRequest(uint256 id) external view returns (LoanBook.Request memory);
}
