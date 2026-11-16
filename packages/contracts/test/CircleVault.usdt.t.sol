// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CircleVault} from "../src/CircleVault.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {Rules} from "../src/modules/Rules.sol";
import {Ledger} from "../src/modules/Ledger.sol";
import {LoanBook} from "../src/modules/LoanBook.sol";
import {ILoanBookViews} from "../src/interfaces/ILoanBookViews.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";
import {TestUSDT} from "./helpers/MockUSDT.sol";

/// @notice Harness for USDT circles (ADR 0046): the same 12 founders, paid in a 6-decimal test
///         token. 50 USDT due on the 10th, late fees 1 + 1 USDT. Every member holds 100k USDT.
abstract contract CircleVaultUsdtBase is CircleVaultBase {
    uint256 internal constant USD = 1e6;
    uint256 internal constant INSTALLMENT = 50 * USD;

    TestUSDT internal usdt;

    function _cfg() internal pure virtual override returns (CircleVault.Config memory c) {
        c = super._cfg();
        c.asset = CircleVault.Asset.USDT;
        c.installment = uint128(INSTALLMENT);
        c.fee1 = uint128(USD);
        c.fee2 = uint128(USD);
        c.rules = Rules.defaults(uint128(INSTALLMENT));
    }

    function setUp() public virtual override {
        vm.warp(DEC_1_2026);
        usdt = new TestUSDT();
        factory = new CircleFactory(type(CircleVault).creationCode, address(usdt));
        members = _makeMembers(12);
        for (uint256 i = 0; i < members.length; ++i) {
            usdt.mint(members[i], 100_000 * USD);
        }
        vault = _createCircle(_cfg(), members);
        honest = members[0];
        late = members[1];
        outsider = _actor("outsider");
        attacker = _actor("attacker");
        usdt.mint(attacker, 100_000 * USD);
    }

    /// @dev Approve exactly what is due, then pay (the app's flow).
    function _payT(CircleVault v, address who) internal returns (uint256 amount) {
        bool due;
        (, amount,, due) = v.amountDue(who);
        require(due, "nothing due");
        vm.startPrank(who);
        usdt.approve(address(v), amount);
        v.contribute();
        vm.stopPrank();
    }

    function _payAllT() internal {
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.isMember(members[i])) continue;
            (,,, bool due) = vault.amountDue(members[i]);
            if (due) _payT(vault, members[i]);
        }
    }

    function _borrowT(address b, uint256 amount) internal returns (uint256 id) {
        vm.prank(b);
        id = vault.requestLoan(amount, false, address(0));
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.canVoteLoan(id, members[i])) continue;
            vm.prank(members[i]);
            vault.voteLoan(id, true);
        }
        LoanBook.Request memory q = ILoanBookViews(address(vault)).loanRequest(id);
        assertEq(uint8(q.status), uint8(LoanBook.Status.Approved), "loan not approved");
    }

    function _dissolveT() internal {
        vm.prank(honest);
        uint256 pid = vault.proposeDissolve();
        for (uint256 i = 1; i < members.length && !vault.dissolved(); ++i) {
            if (!vault.canVoteProposal(pid, members[i])) continue;
            vm.prank(members[i]);
            vault.voteProposal(pid, true);
        }
        assertTrue(vault.dissolved());
    }

    function _sumWithdrawable() internal view returns (uint256 sum) {
        for (uint256 i = 0; i < members.length; ++i) {
            sum += vault.withdrawable(members[i]);
        }
    }

    /// @dev The USDT solvency invariant (ADR 0046).
    function _assertSolvent() internal view {
        assertGe(
            usdt.balanceOf(address(vault)),
            vault.totalAssets() - vault.loansOutstanding() + _sumWithdrawable(),
            "vault holds less USDT than it owes"
        );
    }
}

/// @notice USDT circle scenarios (ADR 0046): S-USDT-*.
contract CircleVaultUsdtTest is CircleVaultUsdtBase {
    // ---------------------------------------------------------------- creation

    function test_S_USDT_00_assetIsFixedAtCreation() public view {
        assertEq(vault.asset(), address(usdt));
        assertEq(factory.usdt(), address(usdt));
        assertEq(
            address(uint160(uint256(vm.load(address(vault), bytes32(SLOT_TOKEN))))),
            address(usdt),
            "Ledger.token slot moved"
        );
    }

    function test_S_USDT_00b_avaxCircleOnTheSameFactoryHasNoToken() public {
        CircleVault.Config memory c = _cfg();
        c.asset = CircleVault.Asset.AVAX;
        vm.prank(honest);
        CircleVault v = CircleVault(payable(factory.createCircle(c, new address[](0))));
        assertEq(v.asset(), address(0));
        vm.deal(honest, 100 ether);
        vm.prank(honest);
        v.contribute{value: INSTALLMENT}();
        assertEq(address(v).balance, INSTALLMENT);
        assertEq(usdt.balanceOf(address(v)), 0);
    }

    function test_S_USDT_07_factoryWithoutUsdtRefusesUsdtCircles() public {
        CircleFactory avaxOnly = new CircleFactory(type(CircleVault).creationCode, address(0));
        assertEq(avaxOnly.usdt(), address(0));
        vm.prank(honest);
        vm.expectRevert(CircleVault.UsdtNotAvailable.selector);
        avaxOnly.createCircle(_cfg(), new address[](0));
    }

    // ---------------------------------------------------------------- full lifecycle

    function test_S_USDT_01_fullLifecycleInUsdt() public {
        // December: everyone but `late` pays on time; `late` pays after the due day with fee 1.
        for (uint256 i = 0; i < members.length; ++i) {
            if (members[i] != late) _payT(vault, members[i]);
        }
        assertEq(usdt.balanceOf(address(vault)), 11 * INSTALLMENT);
        _warpTo(2026, 12, 11, 12, 0, 0);
        (, uint256 amount, uint256 fees,) = vault.amountDue(late);
        assertEq(fees, USD);
        assertEq(amount, INSTALLMENT + USD);
        _payT(vault, late);
        assertEq(vault.totalAssets(), 12 * INSTALLMENT + USD);
        assertEq(usdt.balanceOf(address(vault)), 12 * INSTALLMENT + USD);
        _assertSolvent();

        // Loan: 80 USDT paid out in the voting transaction.
        address b = members[2];
        uint256 before = usdt.balanceOf(b);
        _borrowT(b, 80 * USD);
        assertEq(usdt.balanceOf(b), before + 80 * USD);
        assertEq(vault.loansOutstanding(), 80 * USD);
        _assertSolvent();

        // January: 1% interest on 80 USDT, approved and paid exactly.
        _warpTo(2027, 1, 5, 12, 0, 0);
        _payAllT();
        (uint256 interest, uint256 lateFee,) = vault.interestDue(b);
        assertEq(interest, 8e5);
        assertEq(lateFee, 0);
        vm.startPrank(b);
        usdt.approve(address(vault), interest);
        vault.payInterest();
        vm.stopPrank();

        // Repay in full with the amount overload.
        uint256 payoff = vault.payoffDue(b);
        assertEq(payoff, 80 * USD);
        vm.startPrank(b);
        usdt.approve(address(vault), payoff);
        vault.repay(payoff);
        vm.stopPrank();
        assertEq(vault.loansOutstanding(), 0);
        assertEq(vault.totalAssets(), 24 * INSTALLMENT + USD + 8e5);
        _assertSolvent();

        // Exit: paid in USDT after the notice.
        address leaver = members[5];
        vm.prank(leaver);
        vault.requestExit();
        vm.warp(block.timestamp + 31 days);
        uint256 value = vault.exitValue(leaver);
        uint256 held = usdt.balanceOf(leaver);
        vault.processExits(10);
        assertEq(usdt.balanceOf(leaver), held + value);
        assertFalse(vault.isMember(leaver));
        _assertSolvent();

        // Dissolve, and everyone claims; the vault ends empty.
        _dissolveT();
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.isMember(members[i])) continue;
            vm.prank(members[i]);
            vault.claimDissolution();
        }
        assertEq(vault.totalAssets(), 0);
        assertEq(vault.totalShares(), 0);
        assertEq(usdt.balanceOf(address(vault)), 0);
    }

    // ---------------------------------------------------------------- bad tokens and calls

    function test_S_USDT_02_feeOnTransferIsRejected() public {
        usdt.setFeeBps(100); // 1% taken on every transfer
        vm.startPrank(honest);
        usdt.approve(address(vault), INSTALLMENT);
        vm.expectRevert(
            abi.encodeWithSelector(
                Ledger.TokenAmountMismatch.selector, INSTALLMENT, INSTALLMENT * 99 / 100
            )
        );
        vault.contribute();
        vm.stopPrank();
        assertEq(vault.totalAssets(), 0);
    }

    function test_S_USDT_03_frozenMemberNeverBlocksOthers() public {
        _payAllT();
        address frozen = members[4];
        address other = members[6];
        vm.prank(frozen);
        vault.requestExit();
        vm.prank(other);
        vault.requestExit();
        vm.warp(block.timestamp + 31 days);
        usdt.setBlacklisted(frozen, true); // Tether freezes the member's address

        uint256 frozenValue = vault.exitValue(frozen);
        uint256 otherHeld = usdt.balanceOf(other);
        uint256 otherValue = vault.exitValue(other);
        vm.expectEmit(address(vault));
        emit Ledger.PayoutQueued(frozen, frozenValue);
        vault.processExits(10);

        // The frozen member's payout waits; the member behind them is paid as normal.
        assertEq(vault.withdrawable(frozen), frozenValue);
        assertFalse(vault.isMember(frozen));
        assertEq(usdt.balanceOf(other), otherHeld + otherValue);
        _assertSolvent();

        vm.prank(frozen);
        vm.expectRevert(Ledger.WithdrawFailed.selector);
        vault.withdraw();

        usdt.setBlacklisted(frozen, false);
        uint256 held = usdt.balanceOf(frozen);
        vm.prank(frozen);
        vault.withdraw();
        assertEq(usdt.balanceOf(frozen), held + frozenValue);
        assertEq(vault.withdrawable(frozen), 0);
        _assertSolvent();
    }

    function test_S_USDT_03b_frozenBorrowerStillGetsTheLoanAsWithdrawable() public {
        _payAllT();
        address b = members[2];
        usdt.setBlacklisted(b, true);
        _borrowT(b, 80 * USD); // the vote still settles
        assertEq(vault.withdrawable(b), 80 * USD);
        assertEq(vault.loansOutstanding(), 80 * USD);
        _assertSolvent();
    }

    function test_S_USDT_04_avaxSentToAUsdtCircleIsRejected() public {
        vm.startPrank(honest);
        usdt.approve(address(vault), INSTALLMENT);
        vm.expectRevert(Ledger.AvaxNotAccepted.selector);
        vault.contribute{value: INSTALLMENT}();
        vm.stopPrank();

        _payAllT();
        address b = members[2];
        _borrowT(b, 80 * USD);
        _warpTo(2027, 1, 5, 12, 0, 0);
        vm.startPrank(b);
        usdt.approve(address(vault), type(uint256).max);
        vm.expectRevert(Ledger.AvaxNotAccepted.selector);
        vault.payInterest{value: 1}();
        vm.expectRevert(Ledger.AvaxNotAccepted.selector);
        vault.repay{value: 1}(1);
        vm.expectRevert(Ledger.AvaxNotAccepted.selector);
        vault.repay{value: 1}();
        // The AVAX-only overload sends nothing in a USDT circle, so there is nothing to repay.
        vm.expectRevert(LoanBook.ZeroAmount.selector);
        vault.repay();
        vm.stopPrank();
    }

    function test_S_USDT_05_payingWithoutApprovalRevertsPlainly() public {
        vm.prank(honest);
        vm.expectRevert(
            abi.encodeWithSelector(Ledger.TokenAllowanceTooLow.selector, INSTALLMENT, 0)
        );
        vault.contribute();

        // Approved, but the wallet holds too little.
        address poor = members[3];
        vm.startPrank(poor);
        usdt.transfer(attacker, usdt.balanceOf(poor) - 10 * USD);
        usdt.approve(address(vault), INSTALLMENT);
        vm.expectRevert(
            abi.encodeWithSelector(Ledger.TokenBalanceTooLow.selector, INSTALLMENT, 10 * USD)
        );
        vault.contribute();
        vm.stopPrank();
    }

    function test_S_USDT_06_donatedTokensDoNotMoveNav() public {
        _payAllT();
        uint256 nav = vault.navPerShareE18();
        usdt.mint(address(vault), 1_000_000 * USD);
        assertEq(vault.navPerShareE18(), nav);
        assertEq(vault.totalAssets(), 12 * INSTALLMENT);
        _assertSolvent();
    }
}

/// @notice The `repay(uint256)` overload in an AVAX circle (ADR 0046).
contract CircleVaultRepayAmountTest is CircleVaultBase {
    function test_S_USDT_08_avaxRepayWithAmountMustMatchValue() public {
        for (uint256 i = 0; i < members.length; ++i) {
            _pay(members[i]);
        }
        address b = members[2];
        vm.prank(b);
        uint256 id = vault.requestLoan(4e17, false, address(0));
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.canVoteLoan(id, members[i])) continue;
            vm.prank(members[i]);
            vault.voteLoan(id, true);
        }
        _warpTo(2027, 1, 5, 12, 0, 0);
        vm.prank(b);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.WrongLoanAmount.selector, 1e17, 2e17));
        vault.repay{value: 2e17}(1e17);
        vm.prank(b);
        vault.repay{value: 1e17}(1e17);
        assertEq(vault.loansOutstanding(), 3e17);
        assertEq(vault.asset(), address(0));
    }
}
