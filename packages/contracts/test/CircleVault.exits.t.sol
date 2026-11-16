// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CircleVault} from "../src/CircleVault.sol";
import {Membership} from "../src/modules/Membership.sol";
import {Exits} from "../src/modules/Exits.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";
import {RejectingWallet, ReentrantAttacker} from "./helpers/Actors.sol";

/// @notice Exits and the guardian pause (ADR 0039): notice, NAV at payout, exit fee, cash
///         shortage and `exitsWaiting` (RT-17), bounded FIFO processing, Chainlink upkeep,
///         self-claim (RT-21), refusing and re-entering wallets (RT-20), rage-quit (ADR 0019),
///         pause limits (ADR 0020, RT-14).
/// @dev Loans and Governance aren't built in this branch, so their switches (loansOutstanding,
///      frozen, loanTies, rageQuitUntil, guardianDisabled) are set with `vm.store`. Slots come
///      from `forge inspect CircleVault storageLayout`; `_checkLayout` fails loudly if they move.
contract CircleVaultExitsTest is CircleVaultBase {
    uint256 internal constant MEMBERS_SLOT = SLOT_MEMBERS;
    uint256 internal constant LEDGER_SLOT = SLOT_LEDGER;
    uint256 internal constant LOANS_SLOT = SLOT_LOANS_OUTSTANDING;
    uint256 internal constant FLAGS_SLOT = SLOT_SWITCHES;
    uint256 internal constant BYTE_FROZEN = 3;
    uint256 internal constant BYTE_LOAN_TIES = 4;
    uint256 internal constant NOTICE = 30 days;
    /// @dev _rules second slot: interestFee(16) defaultAfter minMembers passPct dissolvePct
    ///      delayDays exitNoticeDays(2) exitFeeBps(2) -> exitFeeBps at byte 23.
    uint256 internal constant RULES_SLOT_2 = SLOT_RULES + 1;
    uint256 internal constant BYTE_EXIT_FEE = 23;

    function setUp() public override {
        super.setUp();
        _checkLayout();
        _payAll(vault, members); // December
    }

    // ---------------------------------------------------------------- helpers

    function _checkLayout() internal view {
        assertEq(uint256(vm.load(address(vault), bytes32(LEDGER_SLOT))), vault.totalAssets());
        assertEq(uint8(uint256(vm.load(address(vault), _memberSlot(honest)))), 1, "active flag");
    }

    function _payAll(CircleVault v, address[] memory list) internal {
        for (uint256 i = 0; i < list.length; ++i) {
            if (!v.isMember(list[i])) continue;
            (,,, bool payable_) = v.amountDue(list[i]);
            if (payable_) _payIn(v, list[i]);
        }
    }

    function _memberSlot(address a) internal pure returns (bytes32) {
        return keccak256(abi.encode(a, MEMBERS_SLOT));
    }

    function _setByte(CircleVault v, bytes32 slot, uint256 index, uint256 value) internal {
        uint256 word = uint256(vm.load(address(v), slot));
        word = (word & ~(uint256(0xff) << (8 * index))) | (value << (8 * index));
        vm.store(address(v), slot, bytes32(word));
    }

    function _setFrozen(address a, bool on) internal {
        _setByte(vault, _memberSlot(a), BYTE_FROZEN, on ? 1 : 0);
    }

    function _setLoanTies(address a, uint8 n) internal {
        _setByte(vault, _memberSlot(a), BYTE_LOAN_TIES, n);
    }

    /// @dev What LoanBook would do: `amount` leaves the vault as a loan.
    function _lendOut(CircleVault v, uint256 amount) internal {
        vm.store(address(v), bytes32(LOANS_SLOT), bytes32(amount));
        vm.deal(address(v), address(v).balance - amount);
    }

    /// @dev The loan comes back (principal only): cash is restored.
    function _repayAll(CircleVault v) internal {
        uint256 out = v.loansOutstanding();
        vm.store(address(v), bytes32(LOANS_SLOT), bytes32(0));
        vm.deal(address(v), address(v).balance + out);
    }

    function _setRageQuitUntil(uint64 t) internal {
        uint256 word = uint256(vm.load(address(vault), bytes32(FLAGS_SLOT)));
        word = (word & ~(uint256(type(uint64).max) << 64)) | (uint256(t) << 64);
        vm.store(address(vault), bytes32(FLAGS_SLOT), bytes32(word));
    }

    function _setGuardianDisabled() internal {
        _setByte(vault, bytes32(FLAGS_SLOT), 17, 1);
    }

    /// @dev What Governance would do once a rule change takes effect.
    function _setExitFee(CircleVault v, uint16 bps) internal {
        uint256 word = uint256(vm.load(address(v), bytes32(RULES_SLOT_2)));
        uint256 mask = uint256(0xffff) << (8 * BYTE_EXIT_FEE);
        word = (word & ~mask) | (uint256(bps) << (8 * BYTE_EXIT_FEE));
        vm.store(address(v), bytes32(RULES_SLOT_2), bytes32(word));
        assertEq(v.rules().exitFeeBps, bps, "rules layout moved");
    }

    function _requestExit(address who) internal {
        vm.prank(who);
        vault.requestExit();
    }

    function _assertBooks(CircleVault v) internal view {
        assertEq(address(v).balance, v.totalAssets() - v.loansOutstanding() + _withdrawableSum(v));
    }

    /// @dev Sum of refused payouts across known actors (tests credit only these).
    function _withdrawableSum(CircleVault v) internal view returns (uint256 sum) {
        uint256 n = v.memberListLength();
        address[] memory list = v.membersPage(0, n);
        for (uint256 i = 0; i < n; ++i) {
            sum += v.withdrawable(list[i]);
        }
    }

    function _assertSharesSum(CircleVault v) internal view {
        uint256 n = v.memberListLength();
        address[] memory list = v.membersPage(0, n);
        uint256 sum;
        for (uint256 i = 0; i < n; ++i) {
            Membership.Member memory m = v.memberOf(list[i]);
            if (!m.active) assertEq(m.shares, 0, "removed member keeps shares");
            sum += m.shares;
        }
        assertEq(sum, v.totalShares());
    }

    function _smallCircle(CircleVault.Config memory c, address a, address b, address d)
        internal
        returns (CircleVault v, address[] memory f)
    {
        f = new address[](3);
        f[0] = a;
        f[1] = b;
        f[2] = d;
        v = _createCircle(c, f);
    }

    // ---------------------------------------------------------------- S-EXIT-01

    function test_S_EXIT_01_requestThenNoticeThenPayoutAtNav() public {
        address leaver = members[5];
        vm.expectEmit(address(vault));
        emit Exits.ExitRequested(leaver, block.timestamp + NOTICE, 0);
        _requestExit(leaver);
        Exits.Entry memory e = vault.exitOf(leaver);
        assertEq(e.maturesAt, block.timestamp + NOTICE);
        assertGt(e.requestedAt, 0);
        assertEq(vault.exitQueueLength(), 1);

        // Too early: nothing happens, and a self-claim reverts.
        assertEq(vault.processExits(10), 0);
        vm.prank(leaver);
        vm.expectRevert(abi.encodeWithSelector(Exits.ExitNotReady.selector, e.maturesAt));
        vault.claimExit();

        vm.warp(block.timestamp + NOTICE);
        uint256 stake = vault.stakeOf(leaver);
        uint256 shares = vault.memberOf(leaver).shares;
        uint256 total = vault.totalShares();
        uint256 balBefore = leaver.balance;
        assertEq(vault.exitValue(leaver), stake);

        vm.expectEmit(address(vault));
        emit Exits.ExitPaid(leaver, shares, stake, 0, stake);
        assertEq(vault.processExits(10), 1);

        assertEq(leaver.balance - balBefore, stake);
        assertFalse(vault.isMember(leaver));
        assertEq(vault.memberCount(), 11);
        assertEq(vault.voterCount(), 11);
        assertEq(vault.totalShares(), total - shares);
        assertEq(vault.exitOf(leaver).requestedAt, 0);
        assertEq(vault.exitQueueLength(), 0);
        _assertBooks(vault);
        _assertSharesSum(vault);
    }

    function test_S_EXIT_14_claimWithTooLittleGasRevertsInsteadOfPayingNobody() public {
        address a = members[5];
        address b = members[6];
        address c = members[7];
        _requestExit(a);
        _requestExit(b);
        _requestExit(c);
        vm.warp(block.timestamp + NOTICE);

        // Enough gas for one exit but not to reach c: the claim reverts, so a wallet's gas
        // estimate keeps searching instead of landing on a run that pays nobody.
        vm.prank(c);
        vm.expectRevert(Exits.ExitGasTooLow.selector);
        vault.claimExit{gas: 260_000}();
        assertTrue(vault.isMember(c));

        // With normal gas the queue is settled in order and c is paid.
        uint256 before = c.balance;
        vm.prank(c);
        assertTrue(vault.claimExit());
        assertGt(c.balance, before);
        assertFalse(vault.isMember(a));
        assertFalse(vault.isMember(b));
        _assertBooks(vault);
    }

    /// RT-USDT-01 / M-1, AVAX side of S-USDT-09: the same gas sweep stays green.
    /// forge-config: default.isolate = true
    /// forge-config: ci.isolate = true
    function test_S_EXIT_14b_batchGasSweepNeverHitsPayoutFloor() public {
        address[6] memory leavers =
            [members[0], members[4], members[5], members[6], members[7], members[8]];
        for (uint256 i = 0; i < leavers.length; ++i) {
            _nameAndRequestExit(vault, leavers[i], i);
        }
        vm.warp(block.timestamp + NOTICE);
        _sweepProcessExits(vault, 150_000, 1_200_000, 2000, leavers.length);
        _assertBooks(vault);
    }

    function test_S_EXIT_01_onlyMembersOncePerMember() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Membership.NotAMember.selector, outsider));
        vault.requestExit();

        _requestExit(honest);
        vm.prank(honest);
        vm.expectRevert(
            abi.encodeWithSelector(Exits.ExitAlreadyPending.selector, block.timestamp + NOTICE)
        );
        vault.requestExit();
    }

    // ---------------------------------------------------------------- S-EXIT-02

    function test_S_EXIT_02_loanTiesOrFrozenBlockTheRequest() public {
        _setLoanTies(late, 1);
        vm.prank(late);
        vm.expectRevert(abi.encodeWithSelector(Exits.HasLoanTies.selector, late, 1));
        vault.requestExit();

        _setLoanTies(late, 0);
        _setFrozen(late, true);
        vm.prank(late);
        vm.expectRevert(abi.encodeWithSelector(Exits.MemberFrozen.selector, late));
        vault.requestExit();
    }

    function test_S_EXIT_13_tiesTakenDuringNoticeDropTheExit() public {
        _requestExit(late);
        _requestExit(honest);
        _setFrozen(late, true);
        _setLoanTies(honest, 2);
        vm.warp(block.timestamp + NOTICE);

        vm.expectEmit(address(vault));
        emit Exits.ExitDropped(late, Exits.DropReason.Frozen);
        vm.expectEmit(address(vault));
        emit Exits.ExitDropped(honest, Exits.DropReason.LoanTies);
        assertEq(vault.processExits(10), 0);
        assertTrue(vault.isMember(late));
        assertTrue(vault.isMember(honest));
        assertEq(vault.exitOf(late).requestedAt, 0);
        assertEq(vault.exitQueueLength(), 0);
        assertEq(vault.exitsWaiting(), 0);
    }

    // ---------------------------------------------------------------- S-EXIT-03

    function test_S_EXIT_03_bankRunQueuesPaysInOrderFromInflows() public {
        // Half the circle asks to leave on the same day while most of the cash is lent out.
        for (uint256 i = 6; i < 12; ++i) {
            _requestExit(members[i]);
        }
        uint256 stake = vault.stakeOf(members[6]);
        _lendOut(vault, vault.cash() - 2 * stake - 1); // room for two payouts only
        vm.warp(block.timestamp + NOTICE);

        assertEq(vault.processExits(20), 2);
        assertFalse(vault.isMember(members[6]));
        assertFalse(vault.isMember(members[7]));
        for (uint256 i = 8; i < 12; ++i) {
            assertTrue(vault.isMember(members[i]));
            assertTrue(vault.exitOf(members[i]).waiting);
        }
        assertEq(vault.exitsWaiting(), 4); // LoanBook lends nothing now (RT-17)
        _assertBooks(vault);

        // A later member can't jump the queue by claiming directly.
        vm.prank(members[11]);
        assertFalse(vault.claimExit());
        assertTrue(vault.isMember(members[11]));

        // Repayments come in; the queue is paid in order.
        _repayAll(vault);
        assertEq(vault.processExits(20), 4);
        assertEq(vault.exitsWaiting(), 0);
        assertEq(vault.memberCount(), 6);
        _assertBooks(vault);
        _assertSharesSum(vault);
    }

    function test_S_EXIT_03_waitingExitCancelledKeepsCounterExact() public {
        _requestExit(members[3]);
        _requestExit(members[4]);
        _lendOut(vault, vault.cash());
        vm.warp(block.timestamp + NOTICE);
        vault.processExits(10);
        assertEq(vault.exitsWaiting(), 2);

        vm.prank(members[3]);
        vault.cancelExit();
        assertEq(vault.exitsWaiting(), 1);
        // members[4] is now the only one waiting, so a self-claim may pay once cash is back.
        _repayAll(vault);
        vm.prank(members[4]);
        assertTrue(vault.claimExit());
        assertEq(vault.exitsWaiting(), 0);
        assertFalse(vault.isMember(members[4]));
    }

    // ---------------------------------------------------------------- S-EXIT-04

    function test_S_EXIT_04_S_RT_29_automationDownAnyoneProcessesOrMemberClaims() public {
        _requestExit(members[2]);
        _requestExit(members[3]);
        vm.warp(block.timestamp + NOTICE + 7 days); // the keeper missed a week

        uint256 stake = vault.stakeOf(members[2]);
        vm.prank(outsider);
        assertEq(vault.processExits(1), 1);
        assertFalse(vault.isMember(members[2]));
        assertEq(members[2].balance, FUNDS - AVAX / 2 + stake);

        vm.prank(members[3]);
        assertTrue(vault.claimExit());
        assertFalse(vault.isMember(members[3]));
        assertEq(vault.processExits(10), 0); // only settled slots remain; head moves past them
        assertEq(vault.exitQueueLength(), 0);
    }

    function test_S_EXIT_04_claimWithoutRequestReverts() public {
        vm.prank(honest);
        vm.expectRevert(Exits.NoExitPending.selector);
        vault.claimExit();
        vm.prank(honest);
        vm.expectRevert(Exits.NoExitPending.selector);
        vault.cancelExit();
    }

    function test_S_EXIT_04_checkUpkeepAndPerformUpkeep() public {
        (bool needed,) = vault.checkUpkeep("");
        assertFalse(needed); // empty queue

        _requestExit(members[8]);
        (needed,) = vault.checkUpkeep("");
        assertFalse(needed); // notice running

        vm.warp(block.timestamp + NOTICE);
        (needed,) = vault.checkUpkeep("");
        assertTrue(needed);
        vault.performUpkeep("");
        assertFalse(vault.isMember(members[8]));
        (needed,) = vault.checkUpkeep("");
        assertFalse(needed);

        // Short of cash: one upkeep marks the exit waiting, then stays quiet until cash returns.
        _requestExit(members[9]);
        _lendOut(vault, vault.cash());
        vm.warp(block.timestamp + NOTICE);
        (needed,) = vault.checkUpkeep("");
        assertTrue(needed);
        vault.performUpkeep("");
        assertEq(vault.exitsWaiting(), 1);
        (needed,) = vault.checkUpkeep("");
        assertFalse(needed);
        _repayAll(vault);
        (needed,) = vault.checkUpkeep("");
        assertTrue(needed);
        vault.performUpkeep("");
        assertFalse(vault.isMember(members[9]));
        assertEq(vault.exitsWaiting(), 0);
    }

    function test_S_EXIT_04_processExitsIsBoundedAndFifo() public {
        for (uint256 i = 1; i <= 5; ++i) {
            _requestExit(members[i]);
        }
        vm.warp(block.timestamp + NOTICE);
        assertEq(vault.processExits(2), 2);
        assertFalse(vault.isMember(members[1]));
        assertFalse(vault.isMember(members[2]));
        assertTrue(vault.isMember(members[3]));
        assertEq(vault.exitQueueLength(), 3);
        address[] memory page = vault.exitQueuePage(0, 10);
        assertEq(page.length, 3);
        assertEq(page[0], members[3]);
        assertEq(vault.processExits(0), 0);
        assertEq(vault.processExits(10), 3);
        assertEq(vault.exitQueueLength(), 0);
        assertEq(vault.exitQueuePage(0, 10).length, 0);
    }

    // ---------------------------------------------------------------- S-EXIT-05 (RT-20)

    function test_S_EXIT_05_refusingWalletDoesNotBlockQueue() public {
        RejectingWallet w = _smartWallet(honest);
        (CircleVault v, address[] memory f) = _smallCircle(_cfg(), late, members[2], members[3]);
        _payAll(v, f);
        // The wallet joins by vote, pays, and asks to leave.
        vm.prank(honest);
        w.exec(address(v), 0, abi.encodeCall(CircleVault.requestToJoin, ("Safe_Wallet", late)));
        vm.prank(late);
        v.vote(1, true);
        vm.prank(members[2]);
        v.vote(1, true);
        assertTrue(v.isMember(address(w)));
        (, uint256 due,,) = v.amountDue(address(w));
        vm.prank(honest);
        w.exec(address(v), due, abi.encodeCall(CircleVault.contribute, ()));
        vm.prank(honest);
        w.exec(address(v), 0, abi.encodeCall(CircleVault.requestExit, ()));
        vm.prank(members[3]);
        v.requestExit();
        vm.warp(block.timestamp + NOTICE);

        uint256 owed = v.exitValue(address(w));
        assertEq(v.processExits(10), 2); // members[3] behind the wallet is paid too
        assertEq(v.withdrawable(address(w)), owed);
        assertFalse(v.isMember(address(w)));
        assertFalse(v.isMember(members[3]));
        _assertBooks(v);
    }

    function test_S_RT_28_gasBurningWalletCannotStallTheBatch() public {
        GasBurner b = new GasBurner();
        vm.deal(address(b), FUNDS);
        (CircleVault v, address[] memory f) = _smallCircle(_cfg(), late, members[2], members[3]);
        _payAll(v, f);
        b.exec(address(v), 0, abi.encodeCall(CircleVault.requestToJoin, ("Burner", late)));
        vm.prank(late);
        v.vote(1, true);
        vm.prank(members[2]);
        v.vote(1, true);
        (, uint256 due,,) = v.amountDue(address(b));
        b.exec(address(v), due, abi.encodeCall(CircleVault.contribute, ()));
        b.exec(address(v), 0, abi.encodeCall(CircleVault.requestExit, ()));
        vm.prank(members[3]);
        v.requestExit();
        vm.warp(block.timestamp + NOTICE);

        uint256 owed = v.exitValue(address(b));
        uint256 g = gasleft();
        assertEq(v.processExits{gas: 1_000_000}(10), 2);
        assertLt(g - gasleft(), 1_000_000);
        assertEq(v.withdrawable(address(b)), owed);
        assertFalse(v.isMember(members[3]));
        _assertBooks(v);
    }

    // ---------------------------------------------------------------- S-EXIT-06

    function test_S_EXIT_06_reentrantWalletIsPaidOnce() public {
        ReentrantAttacker a = _attackerContract();
        (CircleVault v, address[] memory f) = _smallCircle(_cfg(), late, members[2], members[3]);
        _payAll(v, f);
        a.exec(address(v), 0, abi.encodeCall(CircleVault.requestToJoin, ("Attacker", late)));
        vm.prank(late);
        v.vote(1, true);
        vm.prank(members[2]);
        v.vote(1, true);
        (, uint256 due,,) = v.amountDue(address(a));
        a.exec(address(v), due, abi.encodeCall(CircleVault.contribute, ()));
        a.exec(address(v), 0, abi.encodeCall(CircleVault.requestExit, ()));
        a.arm(address(v), abi.encodeCall(CircleVault.claimExit, ()), 0);
        vm.warp(block.timestamp + NOTICE);

        uint256 owed = v.exitValue(address(a));
        uint256 before = address(a).balance;
        assertEq(v.processExits(10), 1);
        assertTrue(a.reentered()); // it did try, inside the payout's gas cap
        assertFalse(a.reentrySucceeded());
        assertEq(address(a).balance - before + v.withdrawable(address(a)), owed);
        _assertBooks(v);
    }

    // ---------------------------------------------------------------- S-EXIT-07

    function test_S_EXIT_07_navChangesBeforePayoutPayoutUsesNavWhenPaid() public {
        address leaver = members[4];
        _requestExit(leaver);
        uint256 atRequest = vault.stakeOf(leaver);
        // January: one member pays late with both fees; fees raise everyone's NAV.
        _warpTo(2027, 1, 5, 12, 0, 0);
        for (uint256 i = 0; i < 12; ++i) {
            if (members[i] != late) _pay(members[i]);
        }
        _warpTo(2027, 1, 25, 12, 0, 0);
        _pay(late);
        // Notice ended on Dec 31; nobody processed it until now, so today's NAV applies.
        uint256 atPayout = vault.stakeOf(leaver);
        assertGt(atPayout, atRequest + AVAX / 2); // second installment plus a slice of fees

        uint256 before = leaver.balance;
        vault.processExits(1);
        assertEq(leaver.balance - before, atPayout);
    }

    // ---------------------------------------------------------------- S-EXIT-08

    function test_S_EXIT_08_cancelDuringNoticeRestoresNormal() public {
        _requestExit(members[6]);
        vm.expectEmit(address(vault));
        emit Exits.ExitCancelled(members[6]);
        vm.prank(members[6]);
        vault.cancelExit();
        assertEq(vault.exitOf(members[6]).requestedAt, 0);

        vm.warp(block.timestamp + NOTICE);
        assertEq(vault.processExits(10), 0);
        assertTrue(vault.isMember(members[6]));
        assertEq(vault.exitQueueLength(), 0); // the stale slot was skipped

        // Can ask again later with a fresh notice.
        _requestExit(members[6]);
        assertEq(vault.exitOf(members[6]).maturesAt, block.timestamp + NOTICE);
        assertEq(vault.exitQueuePage(0, 5)[0], members[6]);
    }

    function test_S_EXIT_08_requestCancelSpamDoesNotGrowTheQueue() public {
        _requestExit(members[1]); // a real exit in its notice holds the head
        for (uint256 i = 0; i < 50; ++i) {
            _requestExit(members[2]);
            _requestExit(members[3]);
            vm.prank(members[2]);
            vault.cancelExit();
            vm.prank(members[3]);
            vault.cancelExit();
        }
        assertEq(vault.exitQueueLength(), 1);
    }

    // ---------------------------------------------------------------- S-EXIT-09

    function test_S_EXIT_09_lastMemberLeavesVaultEmpty() public {
        CircleVault.Config memory c = _cfg();
        c.rules.exitFeeBps = 500;
        (CircleVault v, address[] memory f) = _smallCircle(c, late, members[2], members[3]);
        _payAll(v, f);
        for (uint256 i = 0; i < 3; ++i) {
            vm.prank(f[i]);
            v.requestExit();
        }
        vm.warp(block.timestamp + NOTICE);
        assertEq(v.processExits(10), 3);
        assertEq(v.totalAssets(), 0);
        assertEq(v.totalShares(), 0);
        assertEq(address(v).balance, 0);
        assertEq(v.memberCount(), 0);
    }

    // ---------------------------------------------------------------- S-EXIT-10 (fee)

    function test_S_EXIT_10_exitFeeStaysAndRaisesOthersNav() public {
        CircleVault.Config memory c = _cfg();
        c.rules.exitFeeBps = 500; // 5%
        CircleVault v = _createCircle(c, members);
        _payAll(v, members);
        address leaver = members[7];
        vm.prank(leaver);
        v.requestExit();
        vm.warp(block.timestamp + NOTICE);

        uint256 value = v.stakeOf(leaver);
        uint256 fee = (value * 500 + 9999) / 10_000; // rounded up, for the circle
        assertEq(v.exitValue(leaver), value - fee);
        uint256 navBefore = v.navPerShareE18();
        uint256 otherBefore = v.stakeOf(honest);
        vm.expectEmit(address(v));
        emit Exits.ExitPaid(leaver, v.memberOf(leaver).shares, value, fee, value - fee);
        v.processExits(1);
        assertGt(v.navPerShareE18(), navBefore);
        assertGt(v.stakeOf(honest), otherBefore);
        _assertBooks(v);
    }

    // ---------------------------------------------------------------- S-EXIT-11 (dormant)

    function test_S_EXIT_11_dormantMemberCanExitWithShares() public {
        address lost = members[11];
        // Jan, Feb missed by `lost` (Dec was paid), then voted dormant.
        _warpTo(2027, 1, 5, 12, 0, 0);
        for (uint256 i = 0; i < 11; ++i) {
            _pay(members[i]);
        }
        _warpTo(2027, 2, 5, 12, 0, 0);
        for (uint256 i = 0; i < 11; ++i) {
            _pay(members[i]);
        }
        _warpTo(2027, 3, 5, 12, 0, 0);
        for (uint256 i = 0; i < 11; ++i) {
            _pay(members[i]);
        }
        _warpTo(2027, 3, 11, 12, 0, 0);
        vm.prank(honest);
        uint256 id = vault.proposeDormant(lost);
        _votes(id, 1, 11, true);
        assertTrue(vault.memberOf(lost).dormant);
        assertGt(vault.memberOf(lost).shares, 0);

        _requestExit(lost);
        vm.warp(block.timestamp + NOTICE);
        uint256 stake = vault.stakeOf(lost);
        vault.processExits(1);
        assertFalse(vault.isMember(lost));
        assertEq(vault.dormantCount(), 0);
        assertEq(lost.balance, FUNDS - AVAX / 2 + stake);
    }

    function test_S_EXIT_08_memberWhoLeftCanRejoinAndOldSlotStaysSettled() public {
        _requestExit(members[5]);
        vm.warp(block.timestamp + NOTICE);
        vault.processExits(1);
        vm.prank(members[5]);
        vault.requestToJoin("Back_Again", honest);
        _votes(vault.requestCount(), 0, 12, true);
        assertTrue(vault.isMember(members[5]));
        assertEq(vault.exitOf(members[5]).requestedAt, 0);
        assertEq(vault.processExits(10), 0);
    }

    // ---------------------------------------------------------------- S-EXIT-12 (rage-quit)

    /// @dev EXIT-03 (ADR 0043): a rage-quit exit matures when the new rules apply, never at once.
    function test_S_EXIT_12_rageQuitExitMaturesWhenTheNewRulesApply() public {
        _requestExit(members[1]); // normal 30-day notice, first in the queue
        _setRageQuitUntil(uint64(block.timestamp + 7 days));
        _requestExit(members[2]);
        assertEq(vault.exitOf(members[2]).maturesAt, block.timestamp + 7 days);
        assertEq(vault.processExits(10), 0, "no instant exit");

        // At the switch the rage-quitter is paid, though the exit ahead is still in its notice.
        vm.warp(block.timestamp + 7 days);
        assertEq(vault.processExits(10), 1);
        assertFalse(vault.isMember(members[2]));
        assertTrue(vault.isMember(members[1]));
        assertEq(vault.exitQueueLength(), 1); // members[1] is still waiting out its notice

        _requestExit(members[3]); // window over: full notice again
        assertEq(vault.exitOf(members[3]).maturesAt, block.timestamp + NOTICE);
    }

    // ---------------------------------------------------------------- S-RT-20 (fee locked)

    function test_S_RT_20_feeRaisedAfterRequestDoesNotApply() public {
        _requestExit(members[3]); // fee 0% when asked
        _setExitFee(vault, 1000); // a 10% fee passes during the notice
        vm.warp(block.timestamp + NOTICE);
        uint256 stake = vault.stakeOf(members[3]);
        assertEq(vault.exitValue(members[3]), stake);
        uint256 before = members[3].balance;
        vault.processExits(1);
        assertEq(members[3].balance - before, stake);
        // Someone asking now pays the new fee.
        _requestExit(members[4]);
        uint256 s4 = vault.stakeOf(members[4]);
        assertEq(vault.exitValue(members[4]), s4 - (s4 + 9) / 10);
    }

    function test_S_RT_20_feeLoweredAfterRequestApplies() public {
        CircleVault.Config memory c = _cfg();
        c.rules.exitFeeBps = 500;
        (CircleVault v, address[] memory f) = _smallCircle(c, late, members[2], members[3]);
        _payAll(v, f);
        vm.prank(late);
        v.requestExit();
        _setExitFee(v, 0);
        vm.warp(block.timestamp + NOTICE);
        assertEq(v.exitValue(late), v.stakeOf(late));
    }

    // ---------------------------------------------------------------- S-RT-22 (guardian pause)

    function test_S_RT_22_guardianPauseLimits() public {
        vm.prank(late);
        vm.expectRevert(Exits.NotGuardian.selector);
        vault.pause();

        vm.expectEmit(address(vault));
        emit Exits.GuardianPaused(honest, block.timestamp + 14 days);
        vm.prank(honest);
        vault.pause();
        assertEq(vault.pausedUntil(), block.timestamp + 14 days);

        // Joins are blocked while paused.
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Exits.CirclePaused.selector, vault.pausedUntil()));
        vault.requestToJoin("Outsider", address(0));

        // No re-pause within 90 days of the last one, even after it ended (RT-14).
        uint256 allowed = block.timestamp + 90 days;
        vm.warp(block.timestamp + 15 days);
        vm.prank(outsider);
        vault.requestToJoin("Outsider", address(0)); // pause over by itself
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(Exits.PauseTooSoon.selector, allowed));
        vault.pause();
        vm.warp(allowed);
        vm.prank(honest);
        vault.pause();
    }

    function test_S_RT_22_unpauseRules() public {
        vm.prank(honest);
        vm.expectRevert(Exits.NotPaused.selector);
        vault.unpause();

        vm.prank(honest);
        vault.pause();
        vm.prank(late);
        vm.expectRevert(Exits.NotGuardian.selector);
        vault.unpause();
        vm.expectEmit(address(vault));
        emit Exits.GuardianUnpaused(honest);
        vm.prank(honest);
        vault.unpause();
        assertEq(vault.pausedUntil(), block.timestamp);
        vm.prank(outsider);
        vault.requestToJoin("Outsider", address(0));
    }

    function test_S_RT_22_guardianVotedOffCannotPauseAndAnyoneUnpauses() public {
        vm.prank(honest);
        vault.pause();
        _setGuardianDisabled();
        vm.prank(late);
        vault.unpause(); // the guardian is gone, so anyone may end the pause
        vm.warp(block.timestamp + 91 days);
        vm.prank(honest);
        vm.expectRevert(Exits.GuardianOff.selector);
        vault.pause();
    }

    function test_S_RT_22_guardianWhoLeftCannotPause() public {
        _requestExit(honest);
        vm.warp(block.timestamp + NOTICE);
        vault.processExits(1);
        vm.prank(honest);
        vm.expectRevert(Exits.NotGuardian.selector);
        vault.pause();
    }

    function test_S_RT_22_pauseNeverBlocksExitsClaimsOrWithdraw() public {
        _requestExit(members[3]);
        _requestExit(members[4]);
        vm.warp(block.timestamp + NOTICE - 1 days);
        vm.prank(honest);
        vault.pause();
        vm.warp(block.timestamp + 1 days);
        assertGt(vault.pausedUntil(), block.timestamp);

        _requestExit(members[5]); // asking to exit works too
        assertEq(vault.processExits(1), 1);
        vm.prank(members[4]);
        assertTrue(vault.claimExit());
        (bool needed,) = vault.checkUpkeep("");
        assertFalse(needed);
    }

    // ---------------------------------------------------------------- S-RT-25 / S-RT-28 / S-RT-29

    function test_S_RT_25_exitsWaitingTracksMaturedUnpaidExits() public {
        _requestExit(members[2]);
        _lendOut(vault, vault.cash());
        assertEq(vault.exitsWaiting(), 0); // notice still running: loans may continue
        vm.warp(block.timestamp + NOTICE);
        vm.expectEmit(address(vault));
        emit Exits.ExitWaiting(members[2], vault.exitValue(members[2]), 0);
        vault.processExits(5);
        assertEq(vault.exitsWaiting(), 1);
        vault.processExits(5); // marking twice doesn't double count
        assertEq(vault.exitsWaiting(), 1);
        _setFrozen(members[2], true); // defaults while waiting: dropped, counter back to 0
        vault.processExits(5);
        assertEq(vault.exitsWaiting(), 0);
    }
}

/// @dev A wallet that burns every bit of gas it is given when paid (RT-20).
contract GasBurner {
    function exec(address to, uint256 value, bytes calldata data) external {
        (bool ok, bytes memory ret) = to.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

    receive() external payable {
        while (true) {}
    }
}
