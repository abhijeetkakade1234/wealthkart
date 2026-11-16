# 0051. Fuji or mainnet is chosen by the environment

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

The founder asked that the environment decide whether WealthKart runs on Fuji or on Avalanche mainnet. Until now the vault refused mainnet in code, the app could only target Fuji, and the deploy workflows offered only Fuji. ADR 0050 removed the vault's block and moved the mainnet guard into the deploy script (`CONFIRM_MAINNET=yes`, C-Chain USDt only). This ADR covers the app, the indexer and the workflows.

## Decision

- **App:** `NEXT_PUBLIC_NETWORK` is `fuji` (the default when empty) or `mainnet`. Each build targets exactly one chain (`TARGET_CHAIN`), and the wallet must be on it. Any other value fails the build, so a typo can't point the app at the wrong network. Contract addresses come from `packages/sdk/src/deployments/<chainId>.json` (`43113` Fuji, `43114` mainnet).
- **Indexer:** the top of `wrangler.toml` is Fuji; `[env.mainnet]` is mainnet with its own D1 database and factory.
- **Workflows:** **Deploy contracts** and **Deploy indexer** take `network` = `fuji` or `mainnet` and run in the GitHub environment of that name. A mainnet contract deploy also needs the `confirm_mainnet` input typed as `yes`, and uses C-Chain USDt. On Fuji the deploy creates the faucet test USDT.

## Alternatives considered

- **One build serving both networks with a switcher:** more code paths, and members could pay on the wrong network by mistake. One build per network is simpler and safer.
- **Keep the mainnet block in the contracts:** a contract can't read the environment, and exits now exist, so the original reason for the block is gone (ADR 0050).

## Consequences

- Branches map to networks (founder setting): `main` is Cloudflare Production (`fuji` now, `mainnet` after the audit), `dev` is Preview on `fuji`, `abhijeet` isn't deployed, and a PC runs against a local anvil chain. Table in `docs/engineering.md` §6.
- Going live is configuration, not code: deploy the factory with `network=mainnet`, create the mainnet D1 database, deploy the indexer with `network=mainnet`, and build the web app with `NEXT_PUBLIC_NETWORK=mainnet`.
- The owner should give the GitHub `mainnet` environment required reviewers so a mainnet deploy also needs their approval.
- The audit and bug bounty still come before mainnet. That gate is now a process rule, not a code rule.
- The landing page still says "Now testing on Avalanche Fuji". Change it when mainnet launches.
