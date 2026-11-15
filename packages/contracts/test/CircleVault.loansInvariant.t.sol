// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CircleVault} from "../src/CircleVault.sol";
import {LoanBook} from "../src/modules/LoanBook.sol";
import {ILoanBookViews} from "../src/interfaces/ILoanBookViews.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";

/// @dev Drives random loan requests, guarantees, votes, finalisations, interest payments,
///      repayments, defaults and settlements, interleaved with installments and time jumps.
contract LoanHandler is Test {
    CircleVault public vault;
    address[] public members;
    /// @dev Ghost: loans paid out, so the run is known to reach disbursal.
    uint256 public disbursed;

    constructor(CircleVault v, address[] memory m) {
        vault = v;
        members = m;
    }

    function _who(uint256 seed) internal view returns (address) {
        return members[seed % members.length];
    }

    function _views() internal view returns (ILoanBookViews) {
        return ILoanBookViews(address(vault));
    }

    function payAll() public {
        for (uint256 i = 0; i < members.length; ++i) {
            (, uint256 amount,, bool due) = vault.amountDue(members[i]);
            if (!due) continue;
            vm.prank(members[i]);
            vault.contribute{value: amount}();
        }
    }

    function request(uint256 who, uint256 amount, uint256 g, bool withGuarantor) external {
        address b = _who(who);
        address gu = withGuarantor ? _who(g) : address(0);
        amount = bound(amount, 1, 1.5 ether); // around the k-cap, so some fail
        vm.prank(b);
        try vault.requestLoan(amount, false, gu) {} catch {}
    }

    function accept(uint256 g, uint256 b) external {
        vm.prank(_who(g));
        try vault.acceptGuarantee(_who(b)) {} catch {}
    }

    function vote(uint256 id, uint256 who, bool support) external {
        uint256 n = vault.loanRequestCount();
        if (n == 0) return;
        id = (id % n) + 1;
        vm.prank(_who(who));
        try vault.voteLoan(id, support) {} catch {}
    }

    /// @dev Request a small loan and have everyone vote yes at once (runs reach payouts often).
    function borrowNow(uint256 who, uint256 amount) external {
        // Catch everyone up first: a member more than a month behind can't borrow or vote.
        for (uint256 k = 0; k < 3; ++k) {
            payAll();
        }
        address b = _who(who);
        vm.prank(b);
        try vault.requestLoan(bound(amount, 1, 0.5 ether), false, address(0)) returns (uint256 id) {
            this.voteAllYes(id - 1);
        } catch {}
    }

    /// @dev Every eligible member votes yes on request `id` (lets runs reach payouts often).
    function voteAllYes(uint256 id) external {
        uint256 n = vault.loanRequestCount();
        if (n == 0) return;
        id = (id % n) + 1;
        uint256 before = vault.loansOutstanding();
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.canVoteLoan(id, members[i])) continue;
            vm.prank(members[i]);
            try vault.voteLoan(id, true) {} catch {}
        }
        if (vault.loansOutstanding() > before) disbursed += 1;
    }

    function finalize(uint256 id) external {
        uint256 n = vault.loanRequestCount();
        if (n == 0) return;
        try vault.finalizeLoan((id % n) + 1) {} catch {}
    }

    function cancel(uint256 who) external {
        vm.prank(_who(who));
        try vault.cancelLoanRequest() {} catch {}
    }

    function payInterest(uint256 who) external {
        address b = _who(who);
        (uint256 i, uint256 f,) = vault.interestDue(b);
        vm.prank(b);
        try vault.payInterest{value: i + f}() {} catch {}
    }

    function repay(uint256 who, uint256 amount) external {
        address b = _who(who);
        uint256 p = _views().loanOf(b).principal;
        if (p == 0) return;
        vm.prank(b);
        try vault.repay{value: bound(amount, 1, p)}() {} catch {}
    }

    function payoff(uint256 who) external {
        address b = _who(who);
        (uint256 i, uint256 f,) = vault.interestDue(b);
        if (i + f != 0) {
            vm.prank(b);
            try vault.payInterest{value: i + f}() {} catch {}
        }
        uint256 due = vault.payoffDue(b);
        if (due == 0) return;
        vm.prank(b);
        try vault.repay{value: due}() {} catch {}
    }

    function markDefault(uint256 who) external {
        try vault.markDefault(_who(who)) {} catch {}
    }

    function settle(uint256 proposer, uint256 who) external {
        vm.prank(_who(proposer));
        try vault.proposeSettle(_who(who)) {} catch {}
    }

    function warp(uint256 secondsAhead) external {
        vm.warp(block.timestamp + bound(secondsAhead, 1 hours, 25 days));
    }
}

/// @notice Loan invariants: the books balance, `loansOutstanding` equals the loans, `loanTies`
///         and `frozen` match the loans and guarantees exactly (Exits relies on both).
contract CircleVaultLoansInvariantTest is CircleVaultBase {
    LoanHandler internal handler;

    function setUp() public override {
        super.setUp();
        for (uint256 i = 0; i < members.length; ++i) {
            _pay(members[i]);
        }
        handler = new LoanHandler(vault, members);
        targetContract(address(handler));
    }

    function _views() internal view returns (ILoanBookViews) {
        return ILoanBookViews(address(vault));
    }

    /// I-L1: AVAX held = cash + refused payouts (members here are EOAs, so none are refused).
    function invariant_S_LOAN_28_IL1_balanceEqualsCash() public view {
        assertEq(address(vault).balance, vault.totalAssets() - vault.loansOutstanding());
    }

    /// I-L2: loans out equals the sum of every borrower's principal.
    function invariant_S_LOAN_28_IL2_loansOutstandingEqualsLoans() public view {
        uint256 sum;
        for (uint256 i = 0; i < members.length; ++i) {
            sum += _views().loanOf(members[i]).principal;
        }
        assertEq(vault.loansOutstanding(), sum);
    }

    /// I-L3: ties = open request + active loan + accepted guarantee; frozen = own loan
    ///       defaulted or guaranteeing a defaulted loan.
    function invariant_S_LOAN_28_IL3_tiesAndFrozenAreExact() public view {
        (, LoanBook.Request[] memory open) = _views().openLoanRequestsPage(0, 100);
        for (uint256 i = 0; i < members.length; ++i) {
            address a = members[i];
            uint256 ties;
            bool frozen;
            LoanBook.Loan memory own = _views().loanOf(a);
            if (own.principal != 0) ties += 1;
            if (own.defaulted) frozen = true;
            for (uint256 j = 0; j < members.length; ++j) {
                LoanBook.Loan memory ln = _views().loanOf(members[j]);
                if (ln.principal != 0 && ln.guarantor == a) {
                    ties += 1;
                    if (ln.defaulted) frozen = true;
                }
            }
            for (uint256 j = 0; j < open.length; ++j) {
                if (open[j].kind != LoanBook.Kind.Loan) continue;
                if (open[j].borrower == a) ties += 1;
                if (open[j].guarantor == a && open[j].guarantorAccepted) ties += 1;
            }
            assertEq(vault.memberOf(a).loanTies, ties, "loanTies");
            assertEq(vault.memberOf(a).frozen, frozen, "frozen");
        }
    }

    /// The run actually lent money (otherwise the invariants above prove little).
    function afterInvariant() public view {
        assertGt(handler.disbursed(), 0, "no loan was ever paid out");
    }

    /// I-L4: loans never exceed total assets.
    function invariant_S_LOAN_28_IL4_loansWithinAssets() public view {
        assertLe(vault.loansOutstanding(), vault.totalAssets());
    }
}
