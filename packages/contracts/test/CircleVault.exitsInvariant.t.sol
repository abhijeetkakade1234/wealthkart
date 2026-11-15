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
    uint256 internal constant LOANS_SLOT = 26; // _ledger.loansOutstanding

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

    /// I-9: the vault holds exactly its cash plus refused payouts waiting for `withdraw`.
    function invariant_I9_balanceIsCashPlusWithdrawable() public view {
        uint256 owed;
        for (uint256 i = 0; i < everyone.length; ++i) {
            owed += vault.withdrawable(everyone[i]);
        }
        assertEq(address(vault).balance, vault.totalAssets() - vault.loansOutstanding() + owed);
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
            if (e.slot != 0) assertTrue(vault.isMember(everyone[i]));
        }
        assertEq(vault.exitsWaiting(), waiting);
    }
}
