// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Reputation} from "../src/Reputation.sol";
import {LoanBase} from "./CircleVault.loans.t.sol";

/// @notice Circles write the soulbound record (ADR 0042): on-time and late months from
///         `contribute`, repaid loans from `repay`, defaults from `markDefault`.
contract CircleVaultReputationTest is LoanBase {
    function _rep() internal view returns (Reputation) {
        return Reputation(vault.reputation());
    }

    function test_S_REP_06_vaultUsesItsFactorysRecord() public view {
        assertEq(vault.reputation(), address(factory.reputation()));
    }

    function test_S_REP_07_paymentsAreRecordedOnTimeOrLate() public {
        // LoanBase.setUp paid December on time for everyone.
        Reputation.Record memory r = _rep().recordOf(honest);
        assertEq(r.onTime, 1);
        assertEq(r.late, 0);
        assertEq(r.circles, 1);

        // January paid after the due day: late.
        _warpTo(2027, 1, 15, 12, 0, 0);
        _pay(late);
        r = _rep().recordOf(late);
        assertEq(r.onTime, 1);
        assertEq(r.late, 1);
        assertEq(_rep().onTimeBps(late), 5000);
    }

    function test_S_REP_08_repaidLoanIsRecorded() public {
        _borrow(members[2], LOAN, address(0));
        _nextMonths(1);
        _payInterest(members[2]);
        uint256 owed = vault.payoffDue(members[2]);
        vm.prank(members[2]);
        vault.repay{value: owed}();
        assertEq(_rep().recordOf(members[2]).loansRepaid, 1);
        assertEq(_rep().recordOf(members[2]).defaults, 0);
    }

    function test_S_REP_09_defaultIsRecorded() public {
        _borrow(members[3], LOAN, address(0));
        // Nobody pays interest for three months; installments keep coming.
        _nextMonths(3);
        vault.markDefault(members[3]);
        assertEq(_rep().recordOf(members[3]).defaults, 1);
    }
}
