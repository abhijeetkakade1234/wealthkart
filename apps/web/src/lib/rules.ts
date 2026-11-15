/**
 * Mirror of `Rules.defaults` and `Rules.Params` (packages/contracts/src/modules/Rules.sol,
 * ADR 0037): G1-like loan, exit and governance settings sent with a new circle. Bounds are
 * checked on-chain; the create wizard will expose these in Phase 2 UI work.
 */
export interface RulesParams {
  interestBps: number;
  tenorMonths: number;
  tenor2Bps: number;
  tenor3Bps: number;
  reserveBps: number;
  maxLoanBps: number;
  kMultiplier: number;
  minInterestMonth: boolean;
  medicalCap: bigint;
  medicalFreeMonths: number;
  guarantorRequired: boolean;
  interestFee: bigint;
  defaultAfter: number;
  minMembersForLoans: number;
  passPct: number;
  dissolvePassPct: number;
  ruleChangeDelayDays: number;
  exitNoticeDays: number;
  exitFeeBps: number;
}

/** Same values as `Rules.defaults(installment)`. */
export function defaultRules(installment: bigint): RulesParams {
  return {
    interestBps: 100,
    tenorMonths: 6,
    tenor2Bps: 150,
    tenor3Bps: 200,
    reserveBps: 2000,
    maxLoanBps: 4000,
    kMultiplier: 2,
    minInterestMonth: true,
    medicalCap: 0n,
    medicalFreeMonths: 3,
    guarantorRequired: false,
    interestFee: installment / 50n,
    defaultAfter: 2,
    minMembersForLoans: 3,
    passPct: 50,
    dissolvePassPct: 66,
    ruleChangeDelayDays: 7,
    exitNoticeDays: 30,
    exitFeeBps: 0,
  };
}
