# apps/web/e2e

**What's here:** Playwright end-to-end tests. Every user-facing feature ships with one (CLAUDE.md).
**Open this when:** adding a screen or flow, or when the E2E CI job fails.

How it works: `playwright.config.ts` starts a local **anvil** chain that uses Fuji's chain id (43113), builds the static site with `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_FACTORY_OVERRIDE` pointing at it, and serves `out/`. `support/global-setup.ts` calls `support/local-chain.cjs` (shared with `pnpm dev:local`), which installs Multicall3 and deploys the real `CircleFactory`, the libraries the vault links to and the faucet MockUSDT from the Foundry build. Each test injects a **fake Core wallet** (EIP-6963, rdns `app.core.extension`) that forwards to anvil, so transactions, reverts and receipts are real.

| Path                      | Purpose                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `*.e2e.ts`                | Tests; names carry `S-E2E-xx` IDs from `docs/testing.md`                                                                         |
| `support/env.ts`          | Ports (from env or auto), chain id, anvil dev accounts (fake money, local only), factory address                                 |
| `support/local-chain.cjs` | Deploy code shared with `pnpm dev:local`: Foundry binaries, Multicall3, factory + libraries + MockUSDT, test funding             |
| `support/ports.mjs`       | Free-port finder (`node support/ports.mjs 3` prints three)                                                                       |
| `isolated.mjs`            | `pnpm e2e:isolated`: the suite on free ports                                                                                     |
| `indexer.mjs`             | Starts the indexer Worker (`INDEXER_PORT`, `INDEXER_RPC_URL`, `INDEXER_PERSIST`)                                                 |
| `support/fake-core.ts`    | `installFakeCore(page, account)`                                                                                                 |
| `support/chain.ts`        | `rpc`, `increaseTime`, `warpToNextMonth`, `balanceOf`, snapshots                                                                 |
| `support/vault.ts`        | `asWallet`, `createCircle`, `paidCircleOfThree`, `payAllDue`, `vaultWrite`, `vaultUint`, `vaultSend`, `loanFor`, `pendingLoanOf` |
| `support/global-setup.ts` | Runs the `local-chain.cjs` deploy against the E2E anvil                                                                          |
| `support/usdt.ts`         | Factory USDT, faucet `mintUsdt`, token balance and allowance, `vaultView`                                                        |
| `support/multicall3.cjs`  | Multicall3 runtime bytecode (public)                                                                                             |
| `support/push.ts`         | Reminders: mocked notification permission and `PushManager`, real P-256 device keys, a fake push service on 127.0.0.1            |
| `serve.mjs`               | Dependency-free static server that mirrors Cloudflare Pages routing                                                              |

Run: `FOUNDRY_DIR=/d/tools/foundry pnpm --filter @wealthkart/web e2e` (after `forge build` in `packages/contracts`). Browsers live in `PLAYWRIGHT_BROWSERS_PATH` (D:\tools\ms-playwright on the dev machine). Tests share one chain and run in order: each one creates its own circle, and chain time only moves forward. Reminders (ADR 0052): `playwright.config.ts` makes a VAPID key pair per run and passes it to the web build and the local indexer, with the configured web port as the only site allowed to sign.

**Ports (ADR 0053).** Defaults: anvil `8546`, web `4310`, indexer `8787`. Override any of them with `E2E_ANVIL_PORT`, `E2E_WEB_PORT`, `E2E_INDEXER_PORT`. Everything follows: the anvil command, the build's `NEXT_PUBLIC_RPC_URL`/`NEXT_PUBLIC_INDEXER_URL`, the fake Core wallet, the setup helpers and the indexer (`wrangler dev --port ... --var RPC_URL:...`). Outside CI Playwright reuses a server already listening on a port, so two runs on the default ports would share one chain. To run next to another E2E run (another worktree, another agent), use free ports:

```sh
pnpm --filter @wealthkart/web e2e:isolated            # whole suite on free ports
pnpm --filter @wealthkart/web e2e:isolated -g S-E2E-40 # any playwright args pass through
E2E_PORTS=auto pnpm --filter @wealthkart/web e2e       # same, picked inside the config
```

`e2e:isolated` prints the ports it chose. The static build still goes to `apps/web/out`, so two runs need two worktrees, not two terminals in one.
