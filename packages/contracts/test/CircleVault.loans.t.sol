// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CircleVault} from "../src/CircleVault.sol";
import {LoanBook} from "../src/modules/LoanBook.sol";
import {Rules} from "../src/modules/Rules.sol";
import {Ledger} from "../src/modules/Ledger.sol";
import {ILoanBookViews} from "../src/interfaces/ILoanBookViews.sol";
import {CircleVaultBase} from "./CircleVault.base.sol";
import {RejectingWallet, ReentrantAttacker} from "./helpers/Actors.sol";

/// @notice Shared helpers for loan scenarios (ADR 0007, 0009, 0018, 0038).
abstract contract LoanBase is CircleVaultBase {
    /// @dev `Ledger.Store` switch slots come from CircleVaultBase; used to simulate the Exits
    ///      and Governance switches.
    uint256 internal constant SLOT_PAUSE_FLAGS = SLOT_SWITCHES;

    uint256 internal constant LOAN = 8e17; // 0.8 AVAX
    uint256 internal constant FEE = 1e16; // interestFee default = installment / 50

    address internal borrower;
    address internal guarantor;

    function setUp() public virtual override {
        super.setUp();
        borrower = members[2];
        guarantor = members[3];
        _payAll(); // December: 6 AVAX in the vault, each stake ~0.5 AVAX
    }

    function _lv() internal view returns (ILoanBookViews) {
        return ILoanBookViews(address(vault));
    }

    function _loan(address who) internal view returns (LoanBook.Loan memory) {
        return _lv().loanOf(who);
    }

    function _req(uint256 id) internal view returns (LoanBook.Request memory) {
        return _lv().loanRequest(id);
    }

    /// @dev Starts a fresh circle with the same 12 founders and `r` as its rules.
    function _withRules(Rules.Params memory r) internal {
        CircleVault.Config memory c = _cfg();
        c.rules = r;
        vault = _createCircle(c, members);
        _payAll();
    }

    function _defaults() internal pure returns (Rules.Params memory) {
        return Rules.defaults(uint128(AVAX / 2));
    }

    /// @dev Every member pays whatever installment is due right now.
    function _payAll() internal {
        for (uint256 i = 0; i < members.length; ++i) {
            if (!vault.isMember(members[i]) || vault.memberOf(members[i]).dormant) continue;
            (,,, bool due) = vault.amountDue(members[i]);
            if (due) _pay(members[i]);
        }
    }

    /// @dev Moves to the 1st of the next month, 12:00 UTC, `n` times; everyone pays each month.
    function _nextMonths(uint256 n) internal {
        for (uint256 i = 0; i < n; ++i) {
            uint256 p = vault.currentPeriod() + 1;
            _warpTo(p / 12, (p % 12) + 1, 1, 12, 0, 0);
            _payAll();
        }
    }

    function _ask(address who, uint256 amount, bool medical, address g)
        internal
        returns (uint256 id)
    {
        vm.prank(who);
        id = vault.requestLoan(amount, medical, g);
    }

    /// @dev Members `from..to-1` vote `support` while they can (stops once the request closes).
    function _loanVotes(uint256 id, uint256 from, uint256 to, bool support) internal {
        for (uint256 i = from; i < to; ++i) {
            if (!vault.canVoteLoan(id, members[i])) continue;
            vm.prank(members[i]);
            vault.voteLoan(id, support);
        }
    }

    /// @dev Request and pass a loan on the spot (6 yes of 11 eligible).
    function _borrow(address who, uint256 amount, address g) internal returns (uint256 id) {
        id = _ask(who, amount, false, g);
        if (g != address(0)) {
            vm.prank(g);
            vault.acceptGuarantee(who);
        }
        _loanVotes(id, 0, members.length, true);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Approved), "loan not approved");
    }

    function _payInterest(address who) internal returns (uint256 total) {
        (uint256 i, uint256 f,) = vault.interestDue(who);
        total = i + f;
        vm.prank(who);
        vault.payInterest{value: total}();
    }

    function _setExitsWaiting(uint256 n) internal {
        vm.store(address(vault), bytes32(SLOT_EXITS_WAITING), bytes32(n));
    }

    /// @dev Sets `pausedUntil` (low 8 bytes) and `dissolved` (byte 16) of the packed slot.
    function _setPauseFlags(uint64 pausedUntil, bool dissolved) internal {
        uint256 v = uint256(pausedUntil) | (dissolved ? uint256(1) << 128 : 0);
        vm.store(address(vault), bytes32(SLOT_PAUSE_FLAGS), bytes32(v));
    }

    /// @dev Money invariant: AVAX held = cash + refused payouts waiting to be withdrawn.
    function _assertBooks() internal view {
        assertEq(
            address(vault).balance,
            vault.totalAssets() - vault.loansOutstanding() + _totalWithdrawable(),
            "balance != cash + withdrawable"
        );
        uint256 sum;
        for (uint256 i = 0; i < members.length; ++i) {
            sum += _loan(members[i]).principal;
        }
        assertEq(vault.loansOutstanding(), sum, "loansOutstanding != sum of principal");
    }

    function _openCount() internal view returns (uint256) {
        (uint256[] memory ids,) = _lv().openLoanRequestsPage(0, 100);
        return ids.length;
    }

    function _totalWithdrawable() internal view returns (uint256 t) {
        for (uint256 i = 0; i < members.length; ++i) {
            t += vault.withdrawable(members[i]);
        }
    }
}

/// @notice Loan scenarios S-LOAN-* and red-team RT-15..RT-20 (docs/testing.md). 12 founders paid
///         December 2026 (6 AVAX in the vault). G1 defaults: 1% / 1.5% / 2% over 6-month tenors,
///         20% reserve, 40% fund cap, k = 2, 0.01 AVAX interest late fee, default after 2 months,
///         48 h votes, 50% quorum, pass with more than half. `borrower` = members[2],
///         `guarantor` = members[3].
contract CircleVaultLoansTest is LoanBase {
    // ---------------------------------------------------------------- S-LOAN-01

    function test_S_LOAN_01_votePassesAndAvaxArrivesInTheSameTx() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        LoanBook.Request memory q = _req(id);
        assertEq(q.eligible, 11); // 12 voters minus the borrower
        assertEq(q.deadline, block.timestamp + 48 hours);
        assertEq(vault.memberOf(borrower).loanTies, 1);
        assertEq(vault.pendingLoanOf(borrower), id);

        _loanVotes(id, 0, 6, true); // members 0,1,3,4,5: 5 yes
        uint256 before = borrower.balance;
        vm.prank(members[7]);
        vm.expectEmit(address(vault));
        emit LoanBook.LoanDisbursed(id, borrower, LOAN, DEC_2026);
        vault.voteLoan(id, true);

        assertEq(borrower.balance, before + LOAN);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Approved));
        assertEq(vault.loansOutstanding(), LOAN);
        assertEq(vault.totalAssets(), 6 * AVAX); // cash out, loan in
        assertEq(vault.cash(), 6 * AVAX - LOAN);
        LoanBook.Loan memory ln = _loan(borrower);
        assertEq(ln.principal, LOAN);
        assertEq(ln.disbursedPeriod, DEC_2026);
        assertEq(ln.rate1, 100);
        assertEq(vault.memberOf(borrower).loanTies, 1);
        assertEq(vault.pendingLoanOf(borrower), 0);
        _assertBooks();
    }

    // ---------------------------------------------------------------- S-LOAN-02

    function test_S_LOAN_02_voteFailsNothingDisbursed() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        _loanVotes(id, 0, members.length, false); // 6 no of 11: can't pass any more
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Rejected));
        assertEq(vault.loansOutstanding(), 0);
        assertEq(vault.memberOf(borrower).loanTies, 0);
        assertEq(_openCount(), 0);
    }

    function test_S_LOAN_02_quorumNotMetExpires() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        _loanVotes(id, 0, 4, true); // 3 yes, quorum needs 6
        vm.expectRevert(abi.encodeWithSelector(LoanBook.LoanNotDecidedYet.selector, id));
        vault.finalizeLoan(id);
        vm.warp(block.timestamp + 48 hours + 1);
        vault.finalizeLoan(id);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Expired));
        assertEq(vault.loansOutstanding(), 0);
        assertEq(vault.memberOf(borrower).loanTies, 0);
        // A new request can follow.
        _ask(borrower, LOAN, false, address(0));
    }

    function test_S_LOAN_02_windowEndsWithMajorityOfVotesCastPasses() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        _loanVotes(id, 0, 5, true); // 4 yes (members 0,1,3,4)
        _loanVotes(id, 5, 7, false); // 2 no: 6 cast = quorum, not decided early
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Open));
        vm.warp(block.timestamp + 48 hours + 1);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.LoanVotingClosed.selector, id));
        vm.prank(members[8]);
        vault.voteLoan(id, true);
        vault.finalizeLoan(id); // anyone
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Approved));
        assertEq(vault.loansOutstanding(), LOAN);
    }

    // ---------------------------------------------------------------- S-LOAN-03

    function test_S_LOAN_03_borrowerCannotVoteOnOwnLoan() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        assertFalse(vault.canVoteLoan(id, borrower));
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.CannotVoteOnLoan.selector, id, borrower));
        vault.voteLoan(id, true);
    }

    function test_S_LOAN_03_noDoubleVotesAndOutsidersCannotVote() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        vm.prank(honest);
        vault.voteLoan(id, true);
        vm.prank(honest);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.AlreadyVotedOnLoan.selector, id));
        vault.voteLoan(id, false);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.CannotVoteOnLoan.selector, id, outsider));
        vault.voteLoan(id, true);
    }

    // ---------------------------------------------------------------- S-LOAN-04 / S-RT-05

    function test_S_LOAN_04_memberWhoGainsVotingRightsAfterTheRequestCannotVote() public {
        // Newcomer admitted in December pays Dec; on Jan 1 the 2nd payment grants voting rights.
        _admit(outsider, "newcomer");
        _pay(outsider);
        _warpTo(2026, 12, 31, 12, 0, 0);
        uint256 id = _ask(borrower, LOAN, false, address(0));
        assertEq(_req(id).eligible, 11); // the newcomer can't vote yet
        _warpTo(2027, 1, 1, 0, 30, 0);
        _pay(outsider);
        assertTrue(vault.memberOf(outsider).voter);
        assertFalse(vault.canVoteLoan(id, outsider));
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.CannotVoteOnLoan.selector, id, outsider));
        vault.voteLoan(id, true);
    }

    // ---------------------------------------------------------------- S-LOAN-05

    function test_S_LOAN_05_twoApprovedLoansExceedingCashSecondFailsSafely() public {
        Rules.Params memory r = _defaults();
        r.kMultiplier = 10; // stake 0.5 -> 5 AVAX k-cap
        r.reserveBps = 5000; // lendable 3 of 6
        r.maxLoanBps = 10_000;
        _withRules(r);
        uint256 a = _ask(members[2], 2 * AVAX, false, address(0));
        uint256 b = _ask(members[3], 2 * AVAX, false, address(0));
        _loanVotes(a, 0, members.length, true);
        assertEq(vault.loansOutstanding(), 2 * AVAX);
        uint256 before = members[3].balance;
        _loanVotes(b, 0, members.length, true); // passes, but only 1 AVAX is lendable now
        assertEq(uint8(_req(b).status), uint8(LoanBook.Status.Failed));
        assertEq(members[3].balance, before);
        assertEq(vault.loansOutstanding(), 2 * AVAX);
        assertEq(vault.memberOf(members[3]).loanTies, 0);
        _assertBooks();
    }

    // ---------------------------------------------------------------- S-LOAN-06

    function test_S_LOAN_06_reserveBreachRejectedAtRequest() public {
        Rules.Params memory r = _defaults();
        r.kMultiplier = 10;
        r.maxLoanBps = 10_000;
        _withRules(r);
        // 6 AVAX, 20% reserve = 1.2 AVAX kept back: 4.8 lendable.
        assertEq(vault.lendableCash(), 48e17);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.AmountTooLarge.selector, 49e17, 48e17));
        vault.requestLoan(49e17, false, address(0));
        _ask(borrower, 48e17, false, address(0));
    }

    function test_S_LOAN_06_fundCapAndKCap() public {
        // Fund cap 40% of 6 = 2.4 AVAX; k-cap 2 x ~0.5 = ~1 AVAX without a guarantor.
        vm.prank(borrower);
        vm.expectPartialRevert(LoanBook.AmountTooLarge.selector);
        vault.requestLoan(11e17, false, address(0));
        // With a guarantor the cap counts both stakes (ADR 0018): ~2 AVAX.
        _ask(borrower, 19e17, false, guarantor);
    }

    // ---------------------------------------------------------------- S-LOAN-07

    function test_S_LOAN_07_interestStartsNextMonthAndMidMonthRepaymentKeepsIt() public {
        _borrow(borrower, LOAN, address(0)); // Dec 2026
        (uint256 i, uint256 f, uint256 m) = vault.interestDue(borrower);
        assertEq(i + f + m, 0); // nothing in the disbursal month

        _warpTo(2027, 1, 5, 12, 0, 0);
        (i, f, m) = vault.interestDue(borrower);
        assertEq(i, 8e15); // 1% of 0.8
        assertEq(f, 0);
        assertEq(m, 0); // January is due on the 10th

        vm.prank(borrower);
        vault.repay{value: 4e17}();
        assertEq(_loan(borrower).principal, 4e17);
        (i,,) = vault.interestDue(borrower);
        assertEq(i, 8e15); // January stays on the start-of-month balance

        _warpTo(2027, 2, 5, 12, 0, 0);
        (i, f, m) = vault.interestDue(borrower);
        assertEq(i, 8e15 + 4e15); // Jan on 0.8, Feb on 0.4
        assertEq(m, 1); // January is overdue
        assertEq(f, FEE);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.InterestOverdue.selector, 1));
        vault.repay{value: 1e17}();

        uint256 ta = vault.totalAssets();
        assertEq(_payInterest(borrower), 22e15);
        assertEq(vault.totalAssets(), ta + 22e15); // interest and fees are income
        (i, f, m) = vault.interestDue(borrower);
        assertEq(i + f + m, 0);
        _assertBooks();
    }

    // ---------------------------------------------------------------- S-LOAN-08

    function test_S_LOAN_08_repaidInTheSameMonthPaysOneMonthsInterest() public {
        _borrow(borrower, LOAN, address(0));
        uint256 payoff = vault.payoffDue(borrower);
        assertEq(payoff, LOAN + 8e15); // rule 17
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.WrongLoanAmount.selector, payoff, LOAN));
        vault.repay{value: LOAN}();

        uint256 ta = vault.totalAssets();
        vm.prank(borrower);
        vm.expectEmit(address(vault));
        emit LoanBook.LoanRepaid(borrower, LOAN, 8e15, 0);
        vault.repay{value: payoff}();
        assertEq(_loan(borrower).principal, 0);
        assertEq(vault.loansOutstanding(), 0);
        assertEq(vault.totalAssets(), ta + 8e15);
        assertEq(vault.memberOf(borrower).loanTies, 0);
        _assertBooks();
    }

    function test_S_LOAN_08_noMinimumOnceInterestWasPaid() public {
        _borrow(borrower, LOAN, address(0));
        _warpTo(2027, 1, 5, 12, 0, 0);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.InterestOwed.selector, 8e15));
        vault.repay{value: LOAN}(); // January's interest must be paid first
        _payInterest(borrower);
        assertEq(vault.payoffDue(borrower), LOAN);
        vm.prank(borrower);
        vault.repay{value: LOAN}();
        assertEq(vault.loansOutstanding(), 0);
    }

    function test_S_LOAN_08_minimumOffWhenRuleDisabled() public {
        Rules.Params memory r = _defaults();
        r.minInterestMonth = false;
        _withRules(r);
        _borrow(borrower, LOAN, address(0));
        assertEq(vault.payoffDue(borrower), LOAN);
        vm.prank(borrower);
        vault.repay{value: LOAN}();
        assertEq(vault.loansOutstanding(), 0);
    }

    // ---------------------------------------------------------------- S-LOAN-09

    function test_S_LOAN_09_medicalLoanFreeMonthsThenNormalRateOncePerYear() public {
        Rules.Params memory r = _defaults();
        r.medicalCap = uint128(AVAX);
        _withRules(r);
        uint256 id = _ask(borrower, LOAN, true, address(0));
        assertEq(_req(id).deadline, block.timestamp + 24 hours); // half the 48 h window
        _loanVotes(id, 0, members.length, true);
        assertTrue(_loan(borrower).medical);

        // Rule 18: December (disbursal), January and February are free.
        _nextMonths(1);
        (uint256 i,,) = vault.interestDue(borrower);
        assertEq(i, 0);
        _warpTo(2027, 2, 25, 12, 0, 0);
        _payAll();
        (uint256 i2, uint256 f2, uint256 m2) = vault.interestDue(borrower);
        assertEq(i2 + f2 + m2, 0); // free months are never overdue
        _nextMonths(1); // March
        (i,,) = vault.interestDue(borrower);
        assertEq(i, 8e15);

        // Pay off; the first medical loan was in 2026, so a new one in 2027 is allowed.
        _warpTo(2027, 3, 5, 12, 0, 0);
        _payInterest(borrower);
        vm.prank(borrower);
        vault.repay{value: LOAN}();
        _ask(borrower, LOAN, true, address(0));
    }

    function test_S_RT_27_secondMedicalLoanInTheSameUtcYearRejected() public {
        Rules.Params memory r = _defaults();
        r.medicalCap = uint128(AVAX);
        _withRules(r);
        uint256 id = _ask(borrower, LOAN, true, address(0));
        _loanVotes(id, 0, members.length, true);
        // Medical loans are exempt from rule 17: the payoff is just the principal.
        assertEq(vault.payoffDue(borrower), LOAN);
        vm.prank(borrower);
        vault.repay{value: LOAN}();
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.MedicalLoanThisYear.selector, 2026));
        vault.requestLoan(LOAN, true, address(0));
        // A regular loan is still fine.
        _ask(borrower, LOAN, false, address(0));
    }

    function test_S_LOAN_09_medicalCapAndOff() public {
        vm.prank(borrower);
        vm.expectRevert(LoanBook.MedicalLoansOff.selector);
        vault.requestLoan(LOAN, true, address(0));
        Rules.Params memory r = _defaults();
        r.medicalCap = uint128(AVAX / 2);
        _withRules(r);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.AmountTooLarge.selector, LOAN, AVAX / 2));
        vault.requestLoan(LOAN, true, address(0));
    }

    function test_S_LOAN_09_medicalWindowNeverUnderOneHour() public {
        CircleVault.Config memory c = _cfg();
        c.votingWindow = 1 hours;
        c.rules.medicalCap = uint128(AVAX);
        vault = _createCircle(c, members);
        _payAll();
        uint256 id = _ask(borrower, LOAN, true, address(0));
        assertEq(_req(id).deadline, block.timestamp + 1 hours);
    }

    // ---------------------------------------------------------------- S-LOAN-10

    function test_S_LOAN_10_interestIsPaidExactlyAndLeftToPayStaysRight() public {
        _borrow(borrower, LOAN, address(0));
        vm.prank(borrower);
        vm.expectRevert(LoanBook.NothingOwed.selector);
        vault.payInterest{value: 0}();
        _warpTo(2027, 1, 20, 12, 0, 0);
        (uint256 i, uint256 f,) = vault.interestDue(borrower);
        assertEq(i + f, 8e15 + FEE);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.WrongLoanAmount.selector, i + f, 5e15));
        vault.payInterest{value: 5e15}(); // part payments aren't accepted (ADR 0038)
        (uint256 i2, uint256 f2,) = vault.interestDue(borrower);
        assertEq(i2 + f2, i + f);
        _payInterest(borrower);
        (i2, f2,) = vault.interestDue(borrower);
        assertEq(i2 + f2, 0);
    }

    // ---------------------------------------------------------------- S-LOAN-11

    function test_S_LOAN_11_overpayingRepaymentRejectedNeverLost() public {
        _borrow(borrower, LOAN, address(0));
        _warpTo(2027, 1, 5, 12, 0, 0);
        _payInterest(borrower);
        uint256 before = borrower.balance;
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.WrongLoanAmount.selector, LOAN, LOAN + 1));
        vault.repay{value: LOAN + 1}();
        assertEq(borrower.balance, before);
        vm.prank(borrower);
        vm.expectRevert(LoanBook.ZeroAmount.selector);
        vault.repay{value: 0}();
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.NoLoan.selector, outsider));
        vault.repay{value: 1}();
    }

    // ---------------------------------------------------------------- S-LOAN-12

    function test_S_LOAN_12_oneActiveLoanAndOnePendingRequestPerMember() public {
        uint256 id = _ask(borrower, 4e17, false, address(0));
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.LoanRequestOpen.selector, id));
        vault.requestLoan(4e17, false, address(0));
        _loanVotes(id, 0, members.length, true);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.LoanActive.selector, borrower));
        vault.requestLoan(4e17, false, address(0));
    }

    // ---------------------------------------------------------------- S-LOAN-13

    function test_S_LOAN_13_missedInterestFeeThenDefaultFreezesBothThenCure() public {
        _borrow(borrower, 16e17, guarantor);
        assertEq(vault.memberOf(guarantor).loanTies, 1);

        _warpTo(2027, 1, 11, 0, 0, 0);
        (uint256 i, uint256 f, uint256 m) = vault.interestDue(borrower);
        assertEq(i, 16e15);
        assertEq(f, FEE);
        assertEq(m, 1);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.NotInDefault.selector, borrower));
        vault.markDefault(borrower);

        _warpTo(2027, 2, 11, 0, 0, 0);
        (i, f, m) = vault.interestDue(borrower);
        assertEq(i, 32e15); // no compounding: 2 x 1% of 1.6
        assertEq(f, 2 * FEE);
        assertEq(m, 2);
        vm.prank(outsider); // anyone can mark it
        vm.expectEmit(address(vault));
        emit LoanBook.LoanDefaulted(borrower, guarantor, 2);
        vault.markDefault(borrower);
        assertTrue(_loan(borrower).defaulted);
        assertTrue(vault.memberOf(borrower).frozen);
        assertTrue(vault.memberOf(guarantor).frozen);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.AlreadyDefaulted.selector, borrower));
        vault.markDefault(borrower);

        // A frozen member can't borrow or guarantee.
        vm.prank(guarantor);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.MemberFrozen.selector, guarantor));
        vault.requestLoan(1e17, false, address(0));
        vm.prank(members[4]);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.InvalidGuarantor.selector, guarantor));
        vault.requestLoan(1e17, false, guarantor);

        // Paying everything owed cures it.
        _payInterest(borrower);
        assertFalse(_loan(borrower).defaulted);
        assertFalse(vault.memberOf(borrower).frozen);
        assertFalse(vault.memberOf(guarantor).frozen);
        _assertBooks();
    }

    // ---------------------------------------------------------------- S-LOAN-14

    function test_S_LOAN_14_tenorRatesStepUp() public {
        _borrow(borrower, LOAN, address(0)); // Dec 2026; tenors Jan-Jun, Jul-Dec 2027, then 2%
        _warpTo(2027, 7, 5, 12, 0, 0);
        (uint256 i,,) = vault.interestDue(borrower);
        assertEq(i, 6 * 8e15 + 12e15); // 6 months at 1%, July at 1.5%
        _warpTo(2028, 1, 5, 12, 0, 0);
        (i,,) = vault.interestDue(borrower);
        assertEq(i, 6 * 8e15 + 6 * 12e15 + 16e15); // then 2%
    }

    function test_S_LOAN_14_afterThirdTenorLoanIsDueAndSharesRepayAfterVote() public {
        _borrow(borrower, LOAN, address(0)); // Dec 2026: last tenor month is Jun 2028
        for (uint256 k = 0; k < 18; ++k) {
            _nextMonths(1);
            _warpTo(vault.currentPeriod() / 12, (vault.currentPeriod() % 12) + 1, 5, 0, 0, 0);
            _payInterest(borrower);
        }
        assertEq(vault.currentPeriod(), DEC_2026 + 18); // Jun 2028
        vm.expectRevert(abi.encodeWithSelector(LoanBook.NotInDefault.selector, borrower));
        vault.markDefault(borrower);

        _nextMonths(1); // Jul 2028: tenor 3 ended with principal left
        vault.markDefault(borrower);
        assertTrue(vault.memberOf(borrower).frozen);

        uint256 sharesBefore = vault.memberOf(borrower).shares;
        uint256 stakeBefore = vault.stakeOf(borrower);
        uint256 navBefore = vault.navPerShareE18();
        (uint256 owedI, uint256 owedF,) = vault.interestDue(borrower);
        uint256 debt = LOAN + owedI + owedF;

        vm.prank(members[4]);
        uint256 id = vault.proposeSettle(borrower);
        assertEq(_req(id).eligible, 11);
        _loanVotes(id, 5, members.length, true);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Approved));

        // The stake covered everything: part of the shares burned, nothing written off.
        assertEq(_loan(borrower).principal, 0);
        assertEq(vault.loansOutstanding(), 0);
        assertLt(vault.memberOf(borrower).shares, sharesBefore);
        // Minus the debt, plus its own small share of the interest it just paid into NAV.
        assertGe(vault.stakeOf(borrower) + 1e6, stakeBefore - debt);
        assertLe(vault.stakeOf(borrower), stakeBefore - debt + (debt - LOAN));
        assertGe(vault.navPerShareE18(), navBefore); // nobody else lost anything
        assertFalse(vault.memberOf(borrower).frozen);
        assertEq(vault.memberOf(borrower).loanTies, 0);
        _assertBooks();
    }

    // ---------------------------------------------------------------- S-LOAN-15

    function test_S_LOAN_15_guarantorIsTiedWhileGuaranteeing() public {
        uint256 id = _ask(borrower, 16e17, false, guarantor);
        assertEq(vault.memberOf(guarantor).loanTies, 0); // not until they accept
        vm.prank(guarantor);
        vault.acceptGuarantee(borrower);
        assertEq(vault.memberOf(guarantor).loanTies, 1);
        _loanVotes(id, 0, members.length, true);
        assertEq(vault.memberOf(guarantor).loanTies, 1);
        assertEq(_loan(borrower).guarantor, guarantor);

        _warpTo(2027, 1, 5, 12, 0, 0);
        _payInterest(borrower);
        vm.prank(borrower);
        vault.repay{value: 16e17}();
        assertEq(vault.memberOf(guarantor).loanTies, 0);
        assertEq(vault.memberOf(borrower).loanTies, 0);
    }

    // ---------------------------------------------------------------- guarantor (rule 11, RT-16)

    function test_S_RT_24_oneGuaranteeAtATime() public {
        _ask(borrower, 16e17, false, guarantor);
        _ask(members[4], 16e17, false, guarantor); // both may name them
        vm.prank(guarantor);
        vault.acceptGuarantee(borrower);
        vm.prank(guarantor);
        vm.expectRevert(
            abi.encodeWithSelector(LoanBook.AlreadyGuaranteeing.selector, guarantor, borrower)
        );
        vault.acceptGuarantee(members[4]);
        vm.prank(members[5]);
        vm.expectRevert(
            abi.encodeWithSelector(LoanBook.AlreadyGuaranteeing.selector, guarantor, borrower)
        );
        vault.requestLoan(16e17, false, guarantor);
    }

    function test_S_LOAN_18_guarantorMustAcceptBeforeTheLoanCanPass() public {
        uint256 id = _ask(borrower, 16e17, false, guarantor);
        vm.prank(members[4]);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.NotYourGuarantee.selector, borrower));
        vault.acceptGuarantee(borrower);

        _loanVotes(id, 0, members.length, true); // majority yes, waiting for the guarantor
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Open));
        vm.expectRevert(abi.encodeWithSelector(LoanBook.GuaranteeNotAccepted.selector, id));
        vault.finalizeLoan(id);

        uint256 before = borrower.balance;
        vm.prank(guarantor);
        vault.acceptGuarantee(borrower); // the passed vote pays out now
        assertEq(borrower.balance, before + 16e17);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Approved));
    }

    function test_S_LOAN_18_guaranteeNeverAcceptedFailsAtWindowEnd() public {
        uint256 id = _ask(borrower, 16e17, false, guarantor);
        _loanVotes(id, 0, members.length, true);
        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(guarantor);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.LoanVotingClosed.selector, id));
        vault.acceptGuarantee(borrower);
        vault.finalizeLoan(id);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Failed));
        assertEq(vault.memberOf(borrower).loanTies, 0);
    }

    function test_S_LOAN_19_guarantorRequiredByRule11() public {
        Rules.Params memory r = _defaults();
        r.guarantorRequired = true;
        _withRules(r);
        vm.prank(borrower);
        vm.expectRevert(LoanBook.GuarantorRequired.selector);
        vault.requestLoan(LOAN, false, address(0));
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.InvalidGuarantor.selector, borrower));
        vault.requestLoan(LOAN, false, borrower);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.InvalidGuarantor.selector, outsider));
        vault.requestLoan(LOAN, false, outsider);
        _ask(borrower, LOAN, false, guarantor);
    }

    function test_S_LOAN_20_cancelReleasesBorrowerAndGuarantor() public {
        uint256 id = _ask(borrower, 16e17, false, guarantor);
        vm.prank(guarantor);
        vault.acceptGuarantee(borrower);
        vm.prank(borrower);
        vault.cancelLoanRequest();
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Cancelled));
        assertEq(vault.memberOf(borrower).loanTies, 0);
        assertEq(vault.memberOf(guarantor).loanTies, 0);
        vm.prank(borrower);
        vm.expectRevert(LoanBook.NoLoanRequest.selector);
        vault.cancelLoanRequest();
        // The guarantor is free to back someone else.
        _ask(members[4], 16e17, false, guarantor);
        vm.prank(guarantor);
        vault.acceptGuarantee(members[4]);
    }

    // ---------------------------------------------------------------- default + settle

    function test_S_LOAN_21_settleUsesBorrowerThenGuarantorSharesAndWritesOffTheRest() public {
        _borrow(borrower, 16e17, guarantor);
        // Everyone else keeps paying; borrower and guarantor stop.
        _warpTo(2027, 1, 5, 12, 0, 0);
        _payAllExcept2(borrower, guarantor);
        _warpTo(2027, 2, 5, 12, 0, 0);
        _payAllExcept2(borrower, guarantor);
        _warpTo(2027, 2, 11, 0, 0, 0);
        vault.markDefault(borrower);

        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.NotAVoter.selector, borrower));
        vault.proposeSettle(borrower);
        vm.prank(members[4]);
        uint256 id = vault.proposeSettle(borrower);
        assertEq(_req(id).eligible, 10); // minus borrower and guarantor
        assertFalse(vault.canVoteLoan(id, guarantor));
        vm.prank(members[5]);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.SettleOpen.selector, id));
        vault.proposeSettle(borrower);

        uint256 ta = vault.totalAssets();
        uint256 bStake = vault.stakeOf(borrower);
        uint256 gStake = vault.stakeOf(guarantor);
        (uint256 owedI, uint256 owedF,) = vault.interestDue(borrower);
        uint256 debt = 16e17 + owedI + owedF;
        assertGt(debt, bStake + gStake);

        _loanVotes(id, 5, members.length, true);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Approved));
        assertEq(vault.memberOf(borrower).shares, 0);
        assertEq(vault.memberOf(guarantor).shares, 0);
        assertEq(vault.loansOutstanding(), 0);
        // Assets drop by the principal: part repaid from the two stakes, the rest written off.
        assertEq(vault.totalAssets(), ta - 16e17);
        assertFalse(vault.memberOf(borrower).frozen);
        assertFalse(vault.memberOf(guarantor).frozen);
        assertEq(vault.memberOf(borrower).loanTies, 0);
        assertEq(vault.memberOf(guarantor).loanTies, 0);
        assertTrue(vault.isMember(borrower)); // still a member, with no shares
        _assertBooks();
    }

    function test_S_LOAN_22_settleVoteCancelledWhenBorrowerCuresFirst() public {
        _borrow(borrower, LOAN, address(0));
        _warpTo(2027, 2, 11, 0, 0, 0);
        _payAll();
        vault.markDefault(borrower);
        vm.prank(members[4]);
        uint256 id = vault.proposeSettle(borrower);
        _payInterest(borrower); // cured
        _loanVotes(id, 5, members.length, true);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Cancelled));
        assertEq(_loan(borrower).principal, LOAN);
        vm.prank(members[4]);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.NotInDefault.selector, borrower));
        vault.proposeSettle(borrower);
    }

    function test_S_LOAN_22_repayingInFullCancelsAnOpenSettleVote() public {
        _borrow(borrower, LOAN, address(0));
        _nextMonths(7); // Jul 2027, interest unpaid for months: default
        vault.markDefault(borrower);
        vm.prank(members[4]);
        uint256 id = vault.proposeSettle(borrower);
        _payInterest(borrower);
        vm.prank(borrower);
        vault.repay{value: LOAN}();
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Cancelled));
        assertEq(_openCount(), 0);
    }

    // ---------------------------------------------------------------- RT-17 / pause / dissolve

    function test_S_RT_25_noDisbursalWhileExitsWait() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        _setExitsWaiting(1);
        _loanVotes(id, 0, members.length, true); // passes, but nothing is paid out
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Open));
        assertEq(vault.loansOutstanding(), 0);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.DisbursalBlocked.selector, id));
        vault.finalizeLoan(id);
        _setExitsWaiting(0);
        vault.finalizeLoan(id);
        assertEq(vault.loansOutstanding(), LOAN);
    }

    function test_S_RT_25_blockedApprovalExpiresAfterOneMoreWindow() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        _setExitsWaiting(1);
        _loanVotes(id, 0, members.length, true);
        vm.warp(block.timestamp + 96 hours); // deadline + one more 48 h window
        vm.expectRevert(abi.encodeWithSelector(LoanBook.DisbursalBlocked.selector, id));
        vault.finalizeLoan(id);
        vm.warp(block.timestamp + 1);
        vault.finalizeLoan(id);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Failed));
        assertEq(vault.loansOutstanding(), 0);
        assertEq(vault.memberOf(borrower).loanTies, 0);
    }

    function test_S_LOAN_23_pauseBlocksRequestsAndDisbursal() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        _setPauseFlags(uint64(block.timestamp + 1 days), false);
        vm.prank(members[4]);
        vm.expectRevert(LoanBook.LoansPaused.selector);
        vault.requestLoan(1e17, false, address(0));
        _loanVotes(id, 0, members.length, true);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.DisbursalBlocked.selector, id));
        vault.finalizeLoan(id);
        vm.warp(block.timestamp + 1 days);
        vault.finalizeLoan(id);
        assertEq(vault.loansOutstanding(), LOAN);
    }

    function test_S_LOAN_23_dissolvedCircleMakesNoNewLoans() public {
        uint256 id = _ask(borrower, LOAN, false, address(0));
        _setPauseFlags(0, true);
        vm.prank(members[4]);
        vm.expectRevert(LoanBook.LoansClosed.selector);
        vault.requestLoan(1e17, false, address(0));
        _loanVotes(id, 0, members.length, true);
        assertEq(uint8(_req(id).status), uint8(LoanBook.Status.Failed));
        assertEq(vault.loansOutstanding(), 0);
        assertEq(vault.memberOf(borrower).loanTies, 0);
    }

    // ---------------------------------------------------------------- RT-20, reentrancy

    function test_S_LOAN_24_disbursalToWalletThatRefusesAvaxBecomesWithdrawable() public {
        RejectingWallet w = _smartWallet(members[2]);
        address[] memory f = _founders(address(w));
        CircleVault v = _createCircleNoAccept(_cfg(), f);
        _acceptAll(v, f, address(w));
        vm.prank(members[2]);
        w.exec(address(v), 0, abi.encodeCall(CircleVault.acceptInvite, ()));
        _payAllIn(v, f, address(w));
        vm.prank(members[2]);
        w.exec(address(v), AVAX / 2, abi.encodeCall(CircleVault.contribute, ()));

        vm.prank(members[2]);
        w.exec(address(v), 0, abi.encodeCall(CircleVault.requestLoan, (LOAN, false, address(0))));
        for (uint256 i = 0; i < 7; ++i) {
            if (f[i] == address(w)) continue;
            vm.prank(f[i]);
            v.voteLoan(1, true);
        }
        assertEq(v.loansOutstanding(), LOAN);
        assertEq(v.withdrawable(address(w)), LOAN); // the vote didn't revert
        assertEq(address(v).balance, v.totalAssets() - v.loansOutstanding() + LOAN);
    }

    function test_S_LOAN_25_reentrancyOnDisbursalIsBlocked() public {
        ReentrantAttacker a = _attackerContract();
        address[] memory f = _founders(address(a));
        CircleVault v = _createCircleNoAccept(_cfg(), f);
        _acceptAll(v, f, address(a));
        a.exec(address(v), 0, abi.encodeCall(CircleVault.acceptInvite, ()));
        _payAllIn(v, f, address(a));
        a.exec(address(v), AVAX / 2, abi.encodeCall(CircleVault.contribute, ()));
        a.exec(address(v), 0, abi.encodeCall(CircleVault.requestLoan, (LOAN, false, address(0))));
        // On receiving the loan it tries to repay it in the same call (and so skip rule 17).
        a.arm(address(v), abi.encodeWithSignature("repay()"), LOAN);
        for (uint256 i = 0; i < 7; ++i) {
            if (f[i] == address(a)) continue;
            vm.prank(f[i]);
            v.voteLoan(1, true);
        }
        assertTrue(a.reentered());
        assertFalse(a.reentrySucceeded());
        assertEq(v.loansOutstanding(), LOAN);
        assertEq(address(v).balance, v.totalAssets() - v.loansOutstanding());
    }

    // ---------------------------------------------------------------- request checks

    function test_S_LOAN_26_requestChecks() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.NotAVoter.selector, outsider));
        vault.requestLoan(LOAN, false, address(0));
        vm.prank(borrower);
        vm.expectRevert(LoanBook.ZeroAmount.selector);
        vault.requestLoan(0, false, address(0));
        vm.prank(borrower);
        vm.expectRevert(LoanBook.NoLoanRequest.selector);
        vault.acceptGuarantee(borrower);
        assertFalse(vault.canVoteLoan(0, honest));
        assertFalse(vault.canVoteLoan(99, honest));
        vm.expectRevert(abi.encodeWithSelector(LoanBook.LoanRequestNotOpen.selector, 5));
        vault.finalizeLoan(5);
    }

    function test_S_LOAN_26_tooFewMembersForLoans() public {
        address[] memory three = new address[](3);
        three[0] = members[0];
        three[1] = members[1];
        three[2] = members[2];
        CircleVault v = _createCircleNoAccept(_cfg(), three);
        vm.prank(members[1]);
        v.acceptInvite();
        vm.prank(members[0]);
        vm.expectRevert(abi.encodeWithSelector(LoanBook.TooFewMembers.selector, 2, 3));
        v.requestLoan(1, false, address(0));
    }

    function test_S_LOAN_26_openRequestsPage() public {
        uint256 a = _ask(members[2], 1e17, false, address(0));
        uint256 b = _ask(members[3], 1e17, false, address(0));
        (uint256[] memory ids, LoanBook.Request[] memory page) = _lv().openLoanRequestsPage(0, 10);
        assertEq(ids.length, 2);
        assertEq(ids[0], a);
        assertEq(page[1].borrower, members[3]);
        (ids,) = _lv().openLoanRequestsPage(1, 1);
        assertEq(ids[0], b);
        (ids,) = _lv().openLoanRequestsPage(5, 1);
        assertEq(ids.length, 0);
        assertEq(vault.loanRequestCount(), 2);
    }

    // ---------------------------------------------------------------- fuzz

    /// @dev Interest for any month count matches the tenor schedule computed month by month.
    function testFuzz_S_LOAN_27_interestMatchesMonthByMonth(uint8 monthsAhead) public {
        uint256 n = bound(monthsAhead, 0, 40);
        _borrow(borrower, LOAN, address(0));
        uint256 p = DEC_2026 + n;
        _warpTo(p / 12, (p % 12) + 1, 5, 0, 0, 0);
        uint256 expected;
        for (uint256 k = 1; k <= n; ++k) {
            uint256 rate = k <= 6 ? 100 : k <= 12 ? 150 : 200;
            expected += (LOAN * rate + 9999) / 10_000;
        }
        (uint256 i,,) = vault.interestDue(borrower);
        assertEq(i, expected);
    }

    // ---------------------------------------------------------------- helpers

    function _payAllExcept2(address a, address b) internal {
        for (uint256 i = 0; i < members.length; ++i) {
            if (members[i] == a || members[i] == b) continue;
            (,,, bool due) = vault.amountDue(members[i]);
            if (due) _pay(members[i]);
        }
    }

    /// @dev The 12 founders with members[2] replaced by `w`.
    function _founders(address w) internal view returns (address[] memory f) {
        f = new address[](12);
        for (uint256 i = 0; i < 12; ++i) {
            f[i] = members[i];
        }
        f[2] = w;
    }

    function _acceptAll(CircleVault v, address[] memory f, address skip) internal {
        for (uint256 i = 1; i < f.length; ++i) {
            if (f[i] == skip) continue;
            vm.prank(f[i]);
            v.acceptInvite();
        }
    }

    function _payAllIn(CircleVault v, address[] memory f, address skip) internal {
        for (uint256 i = 0; i < f.length; ++i) {
            if (f[i] == skip) continue;
            _payIn(v, f[i]);
        }
    }
}
