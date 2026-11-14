# WealthKart

On-chain savings-and-lending circles for friends, on Avalanche. Members contribute AVAX monthly into a circle vault, borrow by member vote, and every rule is enforced by smart contracts.

**Status:** Phase 0, Foundation. See [`docs/STATUS.md`](docs/STATUS.md).

## Repo map
| Path | What's inside | Open when |
|---|---|---|
| [`PLAN.md`](PLAN.md) | Product plan, system design, pages, roadmap, funding | You need the big picture |
| [`docs/`](docs/README.md) | Status/todos, decisions (ADRs), testing, engineering rules | You need *why*, *what's next*, or *how we work* |
| [`CLAUDE.md`](CLAUDE.md) | Context for Claude Code sessions | Working with Claude |
| [`.claude/skills/`](.claude/skills/README.md) | Claude Code skills for this repo (Solidity hardening, red team, frontend design, …) | Adding or updating a skill |
| `apps/web/` | Next.js PWA (landing + app) | *(Phase 0, not yet created)* |
| `packages/contracts/` | Solidity + Foundry | *(Phase 0, not yet created)* |
| `packages/sdk/` | ABIs, addresses, typed client | *(Phase 0, not yet created)* |
| `packages/rules/` | TS mirror of contract math | *(Phase 0, not yet created)* |
| `workers/` | Optional Cloudflare Workers (push, indexer) | *(later)* |
| [`WealthKart-Guide.md`](WealthKart-Guide.md) | Guide for the original G1 group app (Apps Script version) | Understanding the rules we're porting |
| `WealthKart G1 Monthly Investment.xlsx` | G1's real 8-year ledger; test fixture source | Building or checking the rule engine |

## License
See [`LICENSE`](LICENSE).
