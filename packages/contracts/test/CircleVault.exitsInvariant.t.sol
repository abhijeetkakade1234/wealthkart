// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {Membership} from "../src/modules/Membership.sol";
import {Exits} from "../src/modules/Exits.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";
import {RejectingWallet} from "./helpers/Actors.sol";

/// @dev Drives random contributions, exit requests, cancels, claims, batches, time jumps and
///      simulated lending (LoanBook isn't in this branch, so loans are set with `vm.store`).
///      One member is a wallet that refuses AVAX, so refused payouts are exercised too.
contract ExitsHandler is Test {
    uint256 internal constant LOANS_SLOT = 25; // CircleVaultBase.SLOT_LOANS_OUTSTANDING

    CircleVault public vault;
    address[] public members;
    RejectingWallet public wallet;
    address public walletOwner;

    constructor(CircleVault v, address[] memory m, RejectingWallet w, address owner) {
        vault = v;
        members = m;
        wallet = w;
        walletOwner = owner;
    }

    function _call(address who, uint256 value, bytes memory data) internal returns (bool ok) {
        if (who == address(wallet)) {
            vm.prank(walletOwner);
            try wallet.exec(address(vault), value, data) {
                return true;
            } catch {
                return false;
            }
        }
        vm.prank(who);
        (ok,) = address(vault).call{value: value}(data);
    }

    function contribute(uint256 who) external {
        address a = members[who % members.length];
        if (!vault.isMember(a)) return;
        (, uint256 amount,, bool due) = vault.amountDue(a);
        if (!due) return;
        if (a != address(wallet)) vm.deal(a, a.balance + amount);
        _call(a, amount, abi.encodeCall(CircleVault.contribute, ()));
    }

    function requestExit(uint256 who) external {
        _call(members[who % members.length], 0, abi.encodeCall(CircleVault.requestExit, ()));
    }

    function cancelExit(uint256 who) external {
        _call(members[who % members.length], 0, abi.encodeCall(CircleVault.cancelExit, ()));
    }

    function claimExit(uint256 who) external {
        _call(members[who % members.length], 0, abi.encodeCall(CircleVault.claimExit, ()));
    }

    uint256 public ghostPaid;

    function processExits(uint256 n) external {
        ghostPaid += vault.processExits(bound(n, 0, 15));
    }

    function performUpkeep() external {
        vault.performUpkeep("");
    }

    function warp(uint256 secondsAhead) external {
        vm.warp(block.timestamp + bound(secondsAhead, 1 hours, 20 days));
    }

    /// @dev Lend out up to all cash, or bring all of it back.
    function lendOrRepay(uint256 amount, bool repay) external {
        uint256 out = vault.loansOutstanding();
        if (repay) {
            vm.store(address(vault), bytes32(LOANS_SLOT), bytes32(0));
            vm.deal(address(vault), address(vault).balance + out);
            return;
        }
        amount = bound(amount, 0, vault.cash());
        vm.store(address(vault), bytes32(LOANS_SLOT), bytes32(out + amount));
        vm.deal(address(vault), address(vault).balance - amount);
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    // ---- nominee claims (ADR 0056): dormant votes, claims, votes, cancels and wakes

    address public constant HEIR = address(0xBEEF);

    function setNominee(uint256 who, uint256 nom) external {
        address a = members[who % members.length];
        address n = nom % 3 == 0 ? HEIR : members[nom % members.length];
        _call(a, 0, abi.encodeCall(CircleVault.setNominee, (n)));
    }

    function proposeDormant(uint256 who, uint256 target) external {
        _call(
            members[who % members.length],
            0,
            abi.encodeCall(CircleVault.proposeDormant, (members[target % members.length]))
        );
    }

    /// @dev Coverage counters: claims opened and claims that reached the queue.
    uint256 public ghostClaims;
    uint256 public ghostClaimsQueued;

    function requestClaim(uint256 target) external {
        address m = members[target % members.length];
        address n = vault.nomineeOf(m);
        if (n == address(0)) return;
        if (_call(n, 0, abi.encodeCall(CircleVault.requestNomineeClaim, (m)))) ++ghostClaims;
    }

    /// @dev Votes on (or settles) one of the open requests.
    function voteOrFinalize(uint256 who, uint256 pick, bool support, bool settle) external {
        uint256 n = vault.openRequestCount();
        if (n == 0) return;
        (uint256[] memory ids,) = vault.openRequestsPage(0, n);
        uint256 id = ids[pick % ids.length];
        address subject = vault.getRequest(id).account;
        (, address before) = vault.nomineeClaimOf(subject);
        if (settle) {
            vault.finalize(id);
        } else {
            _call(members[who % members.length], 0, abi.encodeCall(CircleVault.vote, (id, support)));
        }
        (, address afterPay) = vault.nomineeClaimOf(subject);
        if (before == address(0) && afterPay != address(0)) ++ghostClaimsQueued;
    }

    function cancelClaim(uint256 who) external {
        _call(members[who % members.length], 0, abi.encodeCall(CircleVault.cancelNomineeClaim, ()));
    }

    function wake(uint256 who) external {
        _call(members[who % members.length], 0, abi.encodeCall(CircleVault.wake, ()));
    }
}

contract CircleVaultExitsInvariantTest is CircleVaultBase {
    ExitsHandler internal handler;
    address[] internal everyone;

    function setUp() public override {
        super.setUp();
        RejectingWallet w = new RejectingWallet(address(this));
        address[] memory f = new address[](6);
        for (uint256 i = 0; i < 5; ++i) {
            f[i] = members[i];
        }
        f[5] = address(w);
        vault = _createCircleNoAccept(_cfg(), f);
        for (uint256 i = 1; i < 5; ++i) {
            vm.prank(f[i]);
            vault.acceptInvite();
        }
        w.exec(address(vault), 0, abi.encodeCall(CircleVault.acceptInvite, ()));
        vm.deal(address(w), FUNDS);
        everyone = f;
        handler = new ExitsHandler(vault, f, w, address(this));
        targetContract(address(handler));
    }

    /// I-9: the vault holds at least its cash plus refused payouts waiting for `withdraw`
    ///      (`>=`: AVAX can be forced in, EXIT-10).
    function invariant_I9_balanceIsCashPlusWithdrawable() public view {
        uint256 owed;
        for (uint256 i = 0; i < everyone.length; ++i) {
            owed += vault.withdrawable(everyone[i]);
        }
        owed += vault.withdrawable(handler.HEIR());
        assertGe(address(vault).balance, vault.totalAssets() - vault.loansOutstanding() + owed);
    }

    /// I-14 (ADR 0056): an open claim is an open Claim request about a dormant member; an
    ///      approved one is a live queue entry of a dormant member, paid to a fixed address.
    function invariant_I14_nomineeClaimsAreConsistent() public view {
        for (uint256 i = 0; i < everyone.length; ++i) {
            address a = everyone[i];
            (uint256 id, address payTo) = vault.nomineeClaimOf(a);
            if (id != 0) {
                Membership.Request memory r = vault.getRequest(id);
                assertEq(uint8(r.kind), uint8(Membership.Kind.Claim));
                assertEq(uint8(r.status), uint8(Membership.Status.Open));
                assertEq(r.account, a);
                assertTrue(vault.memberOf(a).dormant, "claim about a dormant member");
                assertEq(payTo, address(0), "never open and approved at once");
            }
            if (payTo != address(0)) {
                assertGt(vault.exitOf(a).requestedAt, 0, "approved claim is queued");
                assertTrue(vault.memberOf(a).dormant, "payee only for a dormant member");
            }
            if (!vault.isMember(a)) assertEq(vault.nomineeOf(a), address(0));
        }
    }

    /// I-2 (with exits): member shares sum to total shares; removed members hold none.
    function invariant_I2_sharesSumToTotalAndLeaversHoldNone() public view {
        uint256 sum;
        for (uint256 i = 0; i < everyone.length; ++i) {
            Membership.Member memory m = vault.memberOf(everyone[i]);
            if (!m.active) assertEq(m.shares, 0);
            sum += m.shares;
        }
        assertEq(sum, vault.totalShares());
    }

    /// I-10: `exitsWaiting` equals the pending exits marked waiting; leavers have no exit.
    function invariant_I10_exitsWaitingIsExact() public view {
        uint256 waiting;
        for (uint256 i = 0; i < everyone.length; ++i) {
            Exits.Entry memory e = vault.exitOf(everyone[i]);
            if (e.waiting) ++waiting;
            if (e.requestedAt != 0) assertTrue(vault.isMember(everyone[i]));
        }
        assertEq(vault.exitsWaiting(), waiting);
    }

    /// I-10b (S-RT-EXIT-LIST): the queue is a consistent linked list of live exits; each
    ///      member in it is flagged `exiting`, and nobody outside it is.
    function invariant_I10b_exitQueueIsAConsistentList() public view {
        uint256 n = vault.exitQueueLength();
        address[] memory page = vault.exitQueuePage(0, n + 1);
        assertEq(page.length, n);
        address prev = address(0);
        for (uint256 i = 0; i < n; ++i) {
            Exits.Entry memory e = vault.exitOf(page[i]);
            assertGt(e.requestedAt, 0, "queued entry is live");
            assertEq(e.prev, prev, "prev link");
            assertTrue(vault.memberOf(page[i]).exiting, "queued member flagged");
            prev = page[i];
        }
        uint256 flagged;
        uint256 voters;
        for (uint256 i = 0; i < everyone.length; ++i) {
            Membership.Member memory m = vault.memberOf(everyone[i]);
            if (m.exiting) ++flagged;
            if (m.active && m.voter && !m.dormant && !m.exiting) ++voters;
        }
        assertEq(flagged, n, "exiting flag only on queued members");
        assertEq(vault.voterCount(), voters, "leavers are out of the quorum base");
    }
}
