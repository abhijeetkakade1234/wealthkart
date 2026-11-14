import { describe, expect, it } from "vitest";
import { assetsForShares, sharesForDeposit, type VaultTotals } from "../src/index.js";

const AVAX = 10n ** 18n;

describe("shares / NAV (ADR 0006)", () => {
  it("S-PAY-01 equal deposits into an empty vault get equal stakes", () => {
    let v: VaultTotals = { totalAssets: 0n, totalShares: 0n };
    const a = sharesForDeposit(AVAX, v);
    v = { totalAssets: AVAX, totalShares: a };
    const b = sharesForDeposit(AVAX, v);
    expect(b).toBe(a);
  });

  it("S-MEM-03 late joiner buys in at current NAV without diluting existing members", () => {
    // 12 members, 10 AVAX in, 2 AVAX interest earned -> NAV up 20%
    const shares = sharesForDeposit(10n * AVAX, { totalAssets: 0n, totalShares: 0n });
    const v: VaultTotals = { totalAssets: 12n * AVAX, totalShares: shares };
    const before = assetsForShares(shares, v);
    const joinShares = sharesForDeposit(AVAX, v);
    const after: VaultTotals = {
      totalAssets: v.totalAssets + AVAX,
      totalShares: shares + joinShares,
    };
    // existing members' value does not drop (rounding favours the vault)
    expect(assetsForShares(shares, after)).toBeGreaterThanOrEqual(before);
    // joiner can't redeem more than they put in
    expect(assetsForShares(joinShares, after)).toBeLessThanOrEqual(AVAX);
  });

  it("S-MATH-01 first-depositor inflation attack does not rob the next member", () => {
    // attacker deposits 1 wei, then a 10 AVAX donation inflates assets (if it were counted)
    const attackerShares = sharesForDeposit(1n, { totalAssets: 0n, totalShares: 0n });
    const v: VaultTotals = { totalAssets: 1n + 10n * AVAX, totalShares: attackerShares };
    const victimShares = sharesForDeposit(15n * AVAX, v);
    expect(victimShares).toBeGreaterThan(0n);
    const after: VaultTotals = {
      totalAssets: v.totalAssets + 15n * AVAX,
      totalShares: attackerShares + victimShares,
    };
    const victimValue = assetsForShares(victimShares, after);
    // victim keeps essentially all of their deposit (loss below 1 millionth)
    expect(15n * AVAX - victimValue).toBeLessThan((15n * AVAX) / 1_000_000n);
  });

  it("S-MATH-02 rounding never pays out more than deposited over many deposits", () => {
    let v: VaultTotals = { totalAssets: 0n, totalShares: 0n };
    let mine = 0n;
    for (let i = 0; i < 120; i++) {
      const dep = 333_333_333_333_333_333n; // awkward amount
      const s = sharesForDeposit(dep, v);
      mine += s;
      v = { totalAssets: v.totalAssets + dep, totalShares: v.totalShares + s };
    }
    expect(assetsForShares(mine, v)).toBeLessThanOrEqual(v.totalAssets);
  });
});
