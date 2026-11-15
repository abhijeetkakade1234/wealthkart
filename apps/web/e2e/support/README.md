# apps/web/e2e/support

**What's here:** helpers for the Playwright suite; `../README.md` explains how a run works.
**Open this when:** writing a new E2E test.

**Key files**

- `env.ts`: ports, chain id, anvil dev accounts, factory address
- `fake-core.ts`: test wallet that announces itself as Core and forwards to anvil
- `chain.ts`: JSON-RPC, time travel, snapshots
- `global-setup.ts`: installs Multicall3, deploys the Membership library and the factory linked to it (ADR 0031)
- `multicall3.ts`: Multicall3 runtime bytecode
