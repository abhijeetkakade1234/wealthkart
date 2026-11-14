# .github

**What's here:** GitHub automation and repo policy.
**Open this when:** CI fails, you deploy contracts, or you change review rules.

| Path                             | Purpose                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflows/ci.yml`               | On every PR and push to `dev`/`main`: format, lint, typecheck, test, build; Solhint, forge, Slither; Lighthouse budget (`apps/web/lighthouserc.json`) |
| `workflows/deploy-contracts.yml` | Manual: deploy `CircleFactory` to Fuji (needs the `fuji` environment and its secret)                                                                  |
| `pull_request_template.md`       | Checklist every PR fills in                                                                                                                           |
| `CODEOWNERS`                     | Who must review; contracts and workflows always need the owner                                                                                        |

Branch flow: `abhijeet` → `dev` → `main` (`docs/engineering.md` §4). Branch protection on `main` and `dev` is set in GitHub settings, not here.
