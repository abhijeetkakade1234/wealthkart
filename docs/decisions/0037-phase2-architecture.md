# 0037. Phase 2 architecture: blueprint factory, Ledger, Rules, one module per feature

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Phase 2 adds loans, exits and governance. All three move money and read the same balances, all three must fit in immutable contracts (ADR 0020), and the work is split between parallel agents. After ADR 0031 the factory still embedded the vault's creation code and had only 4.3 KB left.

## Decision

- **Blueprint factory:** `CircleFactory` takes the linked vault creation code in its constructor, writes it into immutable data contracts (`CodeStore`, the SSTORE2 pattern), and deploys each vault from it with `CREATE`, passing on the vault's own revert reason.
  - It exposes `vaultCodeHash` so anyone can check it against the audited build.
  - Factory: 3.2 KB. The vault keeps its own 24 KB runtime limit and can use up to 48 KB of creation code.
  - Supersedes the size consequences in ADRs 0028 and 0031.
- **Ledger** (`src/modules/Ledger.sol`, internal): one struct for the circle's money that every module shares.
  - Holds `totalAssets` (cash + loans out), `totalShares` and `loansOutstanding`, plus `withdrawable` / `totalWithdrawable` for payouts a wallet refused.
  - `payOut` tries to push the AVAX and keeps it claimable on failure, so one bad wallet never blocks a vote, a loan or the exit queue (RT-20). `withdraw()` is the pull side.
  - Accrued but unpaid interest is not in NAV until it's paid. That is RT-08, recorded for the audit.
- **Rules** (`src/modules/Rules.sol`, external): loan, exit and governance settings live in the vault's storage, not in immutables, because Governance changes them after the delay (ADR 0019).
  - Every field has on-chain bounds (`validate`), checked at creation and on every change.
  - Defaults match G1 (PLAN.md §3).
  - `passes(yes, total, pct)`: at 50% it means strictly more than half; otherwise at least `pct`.
- **One module per feature**, each an external library with its own storage struct inside the vault:
  - `LoanBook`: request, vote, disbursal, interest, repayment, tenors, fees, default.
  - `Exits`: notice, payout, Chainlink Automation, guardian pause.
  - `Governance`: rule changes with delay and rage-quit, fee waivers, dissolution.
  - Their entry points sit only in their own marked section of `CircleVault.sol`.
  - Shared hooks in Membership: `isCurrentVoter`, `canVoteAt` (snapshot voting), `removeMember`, and the `frozen` flag (set and cleared only by LoanBook).
- **Phase 2 simplifications** (written down so the audit sees them):
  - One active loan and one pending request per member.
  - A free-text loan note is left out (PLAN.md D5: no personal data on-chain).
  - Interest on unpaid months does not compound.

## Alternatives considered

- **A separate deployer contract holding the vault code:** still capped at 24 KB of code, so it only moves the problem.
- **Clones or proxies:** ruled out by ADR 0020.
- **Immutables for every rule:** cheaper to read, but rule changes by vote would be impossible.

## Consequences

- Deploys link and order libraries: forge scripts handle it themselves. E2E deploys the factory first and then the libraries at predicted addresses, so the factory address never moves.
- Every module must keep vault entry points thin (views in the library where possible). The vault has about 9 KB of runtime space for Phase 2.
- `Rules.Params` is part of `CircleVault.Config`, so the create form sends the defaults (`apps/web/src/lib/rules.ts`) until the wizard exposes them.
