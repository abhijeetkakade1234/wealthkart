# apps/web/e2e

**What's here:** Playwright end-to-end tests. Every user-facing feature ships with one (CLAUDE.md).
**Open this when:** adding a screen or flow, or when the E2E CI job fails.

How it works: `playwright.config.ts` starts a local **anvil** chain that uses Fuji's chain id (43113), builds the static site with `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_FACTORY_OVERRIDE` pointing at it, and serves `out/`. `support/global-setup.ts` installs Multicall3, deploys the `Membership` library and the real `CircleFactory` linked to it from the Foundry build. Each test injects a **fake Core wallet** (EIP-6963, rdns `app.core.extension`) that forwards to anvil, so transactions, reverts and receipts are real.

| Path                      | Purpose                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `*.e2e.ts`                | Tests; names carry `S-E2E-xx` IDs from `docs/testing.md`                                                                         |
| `support/env.ts`          | Ports, chain id, anvil dev accounts (fake money, local only), factory address                                                    |
| `support/fake-core.ts`    | `installFakeCore(page, account)`                                                                                                 |
| `support/chain.ts`        | `rpc`, `increaseTime`, `warpToNextMonth`, `balanceOf`, snapshots                                                                 |
| `support/vault.ts`        | `asWallet`, `createCircle`, `paidCircleOfThree`, `payAllDue`, `vaultWrite`, `vaultUint`, `vaultSend`, `loanFor`, `pendingLoanOf` |
| `support/global-setup.ts` | Multicall3 + factory, libraries and faucet MockUSDT deploy                                                                       |
| `support/usdt.ts`         | Factory USDT, faucet `mintUsdt`, token balance and allowance, `vaultView`                                                        |
| `support/multicall3.ts`   | Multicall3 runtime bytecode (public)                                                                                             |
| `serve.mjs`               | Dependency-free static server that mirrors Cloudflare Pages routing                                                              |

Run: `FOUNDRY_DIR=/d/tools/foundry pnpm --filter @wealthkart/web e2e` (after `forge build` in `packages/contracts`). Browsers live in `PLAYWRIGHT_BROWSERS_PATH` (D:\tools\ms-playwright on the dev machine). Tests share one chain and run in order: each one creates its own circle, and chain time only moves forward.
