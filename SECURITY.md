# Security

WealthKart circles hold members' money in smart contracts, so we take reports seriously and answer them fast.

## Reporting a problem

- Open a **private** report through GitHub: _Security_ tab → _Report a vulnerability_. Please don't open a public issue.
- Include what you found, the contract or page, steps or a test that shows it, and the impact as you see it.
- We reply within 3 days and keep you updated until it's fixed. With your permission, we credit you when the fix ships.

## What's in scope

| Area                    | Where                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| Circle contracts        | `packages/contracts/src/` (factory, vault, modules, libraries)         |
| The app                 | `apps/web/` (anything that could make a member pay the wrong contract) |
| Indexer Worker          | `workers/indexer/`                                                     |
| Deploy and CI workflows | `.github/workflows/`                                                   |

Out of scope: denial of service by spamming a public RPC, issues in third-party wallets, findings that need a member's own private key, and social engineering.

## Testnet bug bounty (Phase 3)

Before mainnet, the contracts run on Avalanche Fuji with a public bug bounty. Rewards are paid for valid, previously unknown findings, by severity:

| Severity | Example                                                                           |
| -------- | --------------------------------------------------------------------------------- |
| Critical | Stealing or permanently locking members' AVAX; minting shares out of thin air     |
| High     | Bypassing a vote, the loan cap, the reserve or the exit rules; blocking all exits |
| Medium   | Griefing that blocks a member for a long time; wrong late fees or interest        |
| Low      | Misleading events or views the app relies on                                      |

Amounts and the bounty window are announced when it opens. Testing must stay on Fuji or a local chain, never on another person's mainnet funds.

## How we keep it safe

- Contracts are immutable: no proxies, no admin who can move money (ADR 0020). The guardian can pause new loans and joins for up to 14 days, never exits.
- Every change runs fuzz and invariant tests, Slither, and our hardening and red-team reviews (`docs/testing.md`, `docs/redteam/`).
- An external audit happens before mainnet. The audit pack is in [`docs/audit/`](docs/audit/README.md).
- The app never asks for a seed phrase or a signature other than a transaction you can read in your wallet.
