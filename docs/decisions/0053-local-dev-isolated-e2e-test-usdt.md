# 0053. Local dev in one command, E2E on any ports, and a test USDT button

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Three small gaps slowed work down:

- The E2E suite used fixed ports (anvil 8546, web 4310, indexer 8787). Outside CI Playwright reuses a server that is already listening, so two runs at once (two worktrees, two agents) quietly shared one chain and one build and broke each other.
- Running the app on a PC against a local chain meant starting anvil, deploying the factory and its libraries by hand and copying the address into `.env.local`. The E2E setup already did all of that in code.
- Testers on Fuji needed test USDT for USDT circles (ADR 0046). The faucet token has a public `mint`, but there was no way to call it from the app.

## Decision

- **Ports from the environment.** `E2E_ANVIL_PORT`, `E2E_WEB_PORT` and `E2E_INDEXER_PORT` set the ports; the old values stay the defaults. `E2E_PORTS=auto` picks free ports for any not set, once, in the Playwright config process, and writes them back to `process.env` so the worker processes see the same ports. `pnpm e2e:isolated` does the same and prints them. The indexer gets the anvil URL with `wrangler dev --var RPC_URL:...` instead of the fixed URL in `wrangler.toml`.
- **One deploy module.** The deploy code moved from `global-setup.ts` into `apps/web/e2e/support/local-chain.mjs`, plain ESM so a node script can import it without a TypeScript step. The E2E setup and `pnpm dev:local` both call it, so the local app and the tests always run the same contracts at the same addresses.
- **`pnpm dev:local`** is a node script (works in PowerShell and Git Bash): forge build, anvil on chain id 43113, deploy, test USDT for the anvil test wallets, a generated `apps/web/.env.local`, `next dev`, and the indexer with `--indexer`. Ctrl+C stops every process it started and deletes the generated `.env.local` (a hand-written one is moved aside and put back). It is deleted so a later `pnpm build` or deploy from that folder can't bake a local factory override into a real build.
- **"Get test USDT".** Shown on the empty dashboard and on a USDT circle's Pay page only when all of these hold: the build isn't `mainnet`, it targets chain 43113, the factory has a USDT, and that token answers `MINT_CAP()` above zero. Real USDt has no `MINT_CAP`, so a misconfigured build still hides it. One tap mints 1,000 test USDT (or the cap, if lower) to the connected wallet, and the copy says the money has no value. The rule is a pure function with unit tests (S-USDT-11); the flow has an E2E test (S-E2E-40).

## Alternatives considered

- **Pick ports in the test files:** Playwright loads the config once per process, so random ports picked there would differ between the runner and its workers.
- **Docker for local dev:** heavier, and the dev machine is short on disk. Anvil and wrangler already run natively on Windows.
- **Keep `.env.local` after dev:local stops:** convenient for a restart, but it points at a chain that no longer exists and could leak into a deploy.
- **A Fuji faucet page outside the app:** one more thing to host; the button sits where the tester needs the money.

## Consequences

- Several E2E runs can share a machine as long as each has its own worktree (the build still writes `apps/web/out`).
- New local-chain setup goes in `local-chain.mjs`, not in `global-setup.ts`.
- The faucet button disappears by itself on mainnet builds and on any network whose USDT is real.
