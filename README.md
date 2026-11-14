# WealthKart

On-chain savings-and-lending circles for friends, on Avalanche. Members contribute AVAX monthly into a circle vault, borrow by member vote, and every rule is enforced by smart contracts.

**Status:** Phase 0, Foundation. See [`docs/STATUS.md`](docs/STATUS.md).

## Repo map

| Path                                                  | What's inside                                                                       | Open when                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| [`PLAN.md`](PLAN.md)                                  | Product plan, system design, pages, roadmap, funding                                | You need the big picture                        |
| [`docs/`](docs/README.md)                             | Status/todos, decisions (ADRs), testing, engineering rules                          | You need _why_, _what's next_, or _how we work_ |
| [`CLAUDE.md`](CLAUDE.md)                              | Context for Claude Code sessions                                                    | Working with Claude                             |
| [`.claude/skills/`](.claude/skills/README.md)         | Claude Code skills for this repo (Solidity hardening, red team, frontend design, …) | Adding or updating a skill                      |
| [`apps/web/`](apps/web/README.md)                     | Next.js PWA (landing + app)                                                         | Working on screens                              |
| [`packages/contracts/`](packages/contracts/README.md) | Solidity + Foundry                                                                  | Working on money logic                          |
| `packages/sdk/`                                       | ABIs, addresses, typed client                                                       | _(Phase 0, not yet created)_                    |
| [`packages/rules/`](packages/rules/README.md)         | TS mirror of contract math                                                          | Previewing or checking numbers                  |
| `workers/`                                            | Optional Cloudflare Workers (push, indexer)                                         | _(later)_                                       |
| [`WealthKart-Guide.md`](WealthKart-Guide.md)          | Guide for the original G1 group app (Apps Script version)                           | Understanding the rules we're porting           |
| `WealthKart G1 Monthly Investment.xlsx`               | G1's real 8-year ledger; test fixture source                                        | Building or checking the rule engine            |

## License

See [`LICENSE`](LICENSE).
