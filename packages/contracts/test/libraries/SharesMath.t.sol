// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SharesMath} from "../../src/libraries/SharesMath.sol";

contract SharesMathTest is Test {
    uint256 internal constant AVAX = 1e18;

    /// S-PAY-01: equal deposits into an empty vault get equal stakes.
    function test_equalDepositsEqualShares() public pure {
        uint256 a = SharesMath.sharesForDeposit(AVAX, 0, 0);
        uint256 b = SharesMath.sharesForDeposit(AVAX, AVAX, a);
        assertEq(a, b);
    }

    /// S-MATH-01: first-depositor inflation attack can't rob the next member.
    function test_inflationAttackBounded() public pure {
        uint256 attacker = SharesMath.sharesForDeposit(1, 0, 0);
        uint256 assets = 1 + 10 * AVAX; // pretend a donation were counted
        uint256 victim = SharesMath.sharesForDeposit(15 * AVAX, assets, attacker);
        assertGt(victim, 0);
        uint256 value = SharesMath.assetsForShares(victim, assets + 15 * AVAX, attacker + victim);
        assertLt(15 * AVAX - value, (15 * AVAX) / 1_000_000);
    }

    /// S-MATH-02 / I-3: redeeming freshly minted shares never returns more than deposited.
    function testFuzz_roundTripNeverProfits(uint96 deposit, uint96 totalAssets, uint96 totalShares)
        public
        pure
    {
        vm.assume(deposit > 0);
        uint256 s = SharesMath.sharesForDeposit(deposit, totalAssets, totalShares);
        uint256 back =
            SharesMath.assetsForShares(s, uint256(totalAssets) + deposit, uint256(totalShares) + s);
        assertLe(back, deposit);
    }

    /// S-MATH-01a: the same defence at 6 decimals (USDT circles, ADR 0046). An attacker who
    /// deposits 1 unit (1e-6 USDT) and inflates the assets by `donation` never profits, and the
    /// next member loses at most about donation / 1e6 to rounding. (A circle never counts
    /// donations in NAV anyway; this checks the maths alone.)
    function testFuzz_S_MATH_01a_inflationAttackUnprofitableAt6Decimals(
        uint256 donation,
        uint256 deposit
    ) public pure {
        donation = bound(donation, 0, 1e14); // up to 100M USDT
        deposit = bound(deposit, 1e6, 1e12); // 1 USDT .. 1M USDT
        uint256 attacker = SharesMath.sharesForDeposit(1, 0, 0);
        uint256 ta = 1 + donation;
        uint256 victim = SharesMath.sharesForDeposit(deposit, ta, attacker);
        uint256 ta2 = ta + deposit;
        uint256 ts2 = attacker + victim;

        assertLe(SharesMath.assetsForShares(attacker, ta2, ts2), 1 + donation, "attacker profits");
        uint256 got = SharesMath.assetsForShares(victim, ta2, ts2);
        assertLe(got, deposit);
        assertLe(deposit - got, (donation + deposit + 2) / 1e6 + 2, "victim loss too big");
    }

    /// S-MATH-01a: with no donation, a 1 USDT installment after a 1-unit first deposit keeps
    /// its value to within 1 unit.
    function test_S_MATH_01a_oneUsdtKeepsItsValue() public pure {
        uint256 attacker = SharesMath.sharesForDeposit(1, 0, 0);
        uint256 victim = SharesMath.sharesForDeposit(1e6, 1, attacker);
        uint256 got = SharesMath.assetsForShares(victim, 1 + 1e6, attacker + victim);
        assertGe(got + 1, 1e6);
    }
}
