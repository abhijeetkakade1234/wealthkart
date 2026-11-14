# packages/sdk/scripts

**What's here:** codegen for the SDK.
**Open this when:** contract ABIs changed.

**Key files**

- `gen-abi.mjs`: reads `packages/contracts/out` and writes `src/abi/*.ts` (run after `forge build`)
