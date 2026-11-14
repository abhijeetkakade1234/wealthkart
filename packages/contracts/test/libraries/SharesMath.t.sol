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
}
