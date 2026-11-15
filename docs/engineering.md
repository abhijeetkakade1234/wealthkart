# Engineering standards

How we work in this repo. Short on purpose; each rule exists because skipping it bites later.

## 1. Folder READMEs (mandatory)

Every folder has a `README.md` with:

```md
# <folder name>

**What's here:** one or two lines.
**Open this when:** you need to … (so you can skip it otherwise)
**Key files:** file → one-line purpose
**Depends on / used by:** …
```

A PR that adds a folder without a README fails review. A PR that changes what a folder contains updates its README.

Exceptions: Next.js route folders that hold a single `page.tsx` or `route.ts` (the parent route README describes them), git submodules under `packages/contracts/lib/`, and `__tests__/` folders.

## 2. Decisions → ADRs

Architecture, money flow, security, data or scope decisions get an ADR in `docs/decisions/` before merge. See its README.

## 3. Status and todos

`docs/STATUS.md` holds the current phase and the checklist. Update it in the same PR that completes an item.

## 4. Git

- **Three long-lived branches:** `main` ← `dev` ← `abhijeet`
  - `abhijeet`: day-to-day work; all commits go here
  - `dev`: integration; updated only by PR from `abhijeet`
  - `main`: production; updated only by PR from `dev`
- No other branches unless agreed (a parallel tool worktree may use a short-lived branch that merges into `abhijeet` and is then deleted)
- **Conventional Commits** (`feat(contracts): add exit queue`), enforced by commitlint
- PRs need a green CI; `main` and `dev` are protected
- Versioning and changelog via Changesets

## 5. Husky hooks

| Hook         | Runs                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| `pre-commit` | lint-staged: Prettier, ESLint (changed TS), Solhint + `forge fmt --check` (changed .sol) |
| `commit-msg` | commitlint (conventional)                                                                |
| `pre-push`   | `turbo typecheck` + unit tests for affected packages                                     |

## 6. CI (GitHub Actions)

On every PR:

1. Install (pnpm, cached) → Turborepo affected graph
2. Lint + format check (ESLint, Prettier, Solhint, `forge fmt --check`)
3. Typecheck (`tsc --noEmit`, strict)
4. Contracts: `forge build` (size check), `forge test` (scenarios, fuzz, invariants), coverage gate, `forge snapshot --diff`
5. Slither + Aderyn (fail on new high/medium)
6. Rules engine: Vitest + differential vectors vs contracts
7. Web: build static export, Playwright E2E against Anvil
8. Preview deploy to Cloudflare Pages (comment the URL on the PR)

On `main`: the same, plus a production deploy of `apps/web` to Cloudflare Pages.
Nightly: deep invariant runs, Fuji fork tests, dependency audit.
Contract deploys: **manual workflow** with environment approval (Fuji / mainnet), verify on Snowtrace, write the address to `packages/contracts/deployments/<chain>.json`, sdk picks it up.

## 7. Code rules

- TypeScript strict; no `any` without a comment saying why
- Money is `bigint` (wei) everywhere in TS; format only at display
- Contracts: Solidity pinned version, OpenZeppelin, checks-effects-interactions, `ReentrancyGuard` on value transfers, custom errors, events for every state change (the indexer depends on them), NatSpec on all externals
- No loops over members in write paths (ADR 0015)
- Circle contracts are immutable (ADR 0020): no proxies, no `delegatecall` to mutable targets. Every new factory version ships with migration tests (old circle → new circle, balances and shares identical)

## 8. Secrets and config

- `.env.example` documents every variable; real values live in GitHub Actions secrets / Cloudflare env only
- Deployer keys are never on a laptop for mainnet: hardware wallet or multisig (Safe)
- Guardian (pause only, limited per ADR 0020) = founder multisig (Safe); no one holds upgrade or fund-moving powers

## 9. Security

- `SECURITY.md`: how to report a vulnerability
- Pre-mainnet: external audit, bug bounty
- Runtime: monitoring and alerts on contract events (large exits, pauses, failed automation), and an incident runbook in `docs/runbook.md`
