# src/components/governance

**What's here:** circle proposals (ADR 0040): rule changes (ADR 0019), fee waivers, closing the circle (ADR 0021) and switching off the guardian (ADR 0020).
**Open this when:** changing the Votes page proposals, the new-proposal dialog, or the circle-wide notices.

| File                      | Purpose                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `proposal-card.tsx`       | One open proposal: what it does (before/after rules, waiver member/month/reason, calm closing warning), tally, deadline, vote, settle, withdraw |
| `new-proposal-dialog.tsx` | "New proposal" button and dialog with a tab per kind; the rule form is checked with `rulesProblem` before sending                               |
| `circle-notices.tsx`      | `RuleChangeBanner` (applies on date, diff, "Apply new rules" once due) and `DissolvedNotice` ("Claim your share", blocked while loans are out)  |
| `rules-card.tsx`          | "Circle rules" on the overview, in plain words                                                                                                  |
| `rule-diff-list.tsx`      | Before/after list of changed settings                                                                                                           |

Pure helpers: `src/lib/governance.ts` (outcome, tally, reasons) and `src/lib/rules.ts` (formatting, diff, bounds). Reads: `src/lib/gov-hooks.ts`.
