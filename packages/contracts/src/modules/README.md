# packages/contracts/src/modules

**What's here:** external libraries linked into `CircleVault` (ADR 0031). Each one keeps its state in a struct the vault owns and is called with `DELEGATECALL`, so the vault stays immutable and under the 24 KB size limit.
**Open this when:** changing membership rules, or adding a Phase 2 module (loans, governance, exits).

**Key files**

- `Membership.sol`: founder invites, join, dormant and nominee-claim requests, voting (quorum, snapshots, pass marks), wake hook, display names. `vote`/`finalize` return a closed claim's id for `Exits.closeClaim`. ADRs 0028, 0029, 0032, 0056.
- `Governance.sol`: circle proposals (rule change with delay and rage-quit window, fee waiver with a fixed reason, dissolve and pro-rata claims, guardian off), with member-bar votes for dissolve, guardian-off and risky rule changes, and `syncRules` so a passed change applies by itself. The vault forwards its calldata raw (`_govForward`). ADR 0040, 0043.
- `Ledger.sol` (internal) and `Rules.sol`: shared money books and vote-changeable settings. ADR 0037.
- `Exits.sol`: exit requests, notice, payout at NAV minus the exit fee, FIFO linked-list queue and `Ledger.exitsWaiting`, the `exiting` flag, Chainlink upkeep, self-claim, dissolution claims, guardian pause (`Ledger.pausedUntil`). ADR 0039, 0043. Also the nominee (backup wallet): `setNominee`, `requestClaim` (opens a `Membership.Kind.Claim` vote), `closeClaim` (queues the exit paid to the nominee, notice >= 30 days), and `wake`, the one way back from dormant, which ends any claim first. ADR 0056.
- `LoanBook.sol`: loan requests, guarantor accept, loan votes, payout, lazy O(1) interest with tenor step-ups, late fees, rule 17, default, cure, and settle votes that use frozen shares. Keeps `loanTies` and `frozen` exact for Exits. ADR 0038, 0043.
- `Ledger.sol` (internal): the shared money struct, the circle's token (`token`, 0 = AVAX, ADR 0046), the one payout path (AVAX 50k-gas or token `transfer` 100k-gas capped push; refused or frozen goes to `withdrawable`), and `pull` for USDT payments (allowance and balance checks, `SafeERC20.safeTransferFrom`, exact balance delta). `Rules.sol`: rule settings and bounds. ADR 0037, 0046.

View forwarding: views that return structs, arrays or strings (`getRequest`, `openRequestsPage`, `memberOf`, `membersPage`, `nameOf`, `memberByName`, `isNameAvailable`, `canVote`, `exitOf`, `exitQueuePage`, `rules`, and the LoanBook struct views) are forwarded by the vault's `_view(lib, sel, slot, dyn)`: one DELEGATECALL with the store's slot plus the caller's own calldata, output returned as is. Add the matching `external view` function to the module, never decoding logic to the vault.

Rules: a module reads and writes only the `Store` it is given and the arguments it is passed; events and errors are declared in the module and merged into the vault ABI by `packages/sdk/scripts/gen-abi.mjs` (add new modules to its `MERGE` map).
