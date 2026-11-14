# .claude/skills

**What's here:** Claude Code skills scoped to this repo, copied from the team's skills repo (`github.com/abhijeetkakade1234/skills`, local `D:\skills`). Claude loads them automatically when a task matches.
**Open this when:** adding, updating or removing a skill, or checking which skill covers a task.

| Skill | Use for in WealthKart | Phase |
|---|---|---|
| `solidity-hardening` | Review and harden every contract (vault, loans, exits): stuck funds, reentrancy, access control, upgrades | 0+ (every contract PR) |
| `redteam-attack` | Attack the design and contracts: vote gaming, bank runs, share inflation, griefing | 0+ (each phase, before audit) |
| `security-audit-orchestrator` | Full OWASP-style audit across web, workers, dependencies, secrets; specialists in `specialized/` | 3 (pre-mainnet), then periodic |
| `frontend-design` | Building app screens and components without generic AI look | 0+ |
| `3d-website-guide` | The "cooler" landing page later (scroll-driven 3D) | 4 (landing stays plain until then) |
| `dead-code-audit` | Cleanup and maintainability passes | End of each phase |
| `human-writing-style` | READMEs, ADRs, PR descriptions, pitch and grant writing | Any |

**Not copied (and why):** `cf-fullstack-starter` (Hono + D1 two-repo backend; conflicts with ADR 0011 static app), `blueteam-defend` (backend-focused; we have no backend, and the orchestrator covers it), `theme-factory`, `google-stitch-skill` (design tooling; add when needed), game skills (out of scope).

**Updating:** pull `D:\skills`, then re-copy the changed skill folder here. `solidity-hardening` is stored upstream as `solidity-hardening.md`; it's renamed to `SKILL.md` here.
