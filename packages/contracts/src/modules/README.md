# packages/contracts/src/modules

**What's here:** external libraries linked into `CircleVault` (ADR 0031). Each one keeps its state in a struct the vault owns and is called with `DELEGATECALL`, so the vault stays immutable and under the 24 KB size limit.
**Open this when:** changing membership rules, or adding a Phase 2 module (loans, governance, exits).

**Key files**

- `Membership.sol`: founder invites, join and dormant requests, voting (quorum, snapshots, pass marks), wake, display names. ADRs 0028, 0029, 0032.
- `Governance.sol`: circle proposals (rule change with delay and rage-quit window, fee waiver with a fixed reason, dissolve and pro-rata claims, guardian off). The vault forwards its calldata raw (`_govForward`). ADR 0040.

Rules: a module reads and writes only the `Store` it is given and the arguments it is passed; events and errors are declared in the module and merged into the vault ABI by `packages/sdk/scripts/gen-abi.mjs` (add new modules to its `MERGE` map).
