# 0054. Circle templates on the create form, and a `/start` guide with a first-run checklist

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Two Phase 4 growth items. First, the create form asked a new founder to set a dozen rules with only G1's values as defaults, and it hid the loan, vote and notice rules altogether (they always took `Rules.defaults`). Groups differ: a family circle wants gentle fees and long notice, a circle of colleagues wants stricter votes and guarantors. Second, most people we want to reach have never used a crypto wallet. Nothing in the app explained how to install Core, why the recovery phrase matters, or where AVAX for fees comes from.

Constraints: rules are a fixed menu with on-chain bounds (ADR 0022); the asset is chosen once (ADR 0046, 0048) and the member cap is 3..50 (ADR 0045); public copy never advertises returns or endorses a company (ADR 0024); the look is Gallery (ADR 0025) and landing motion stays light (ADR 0049); the network comes from `NEXT_PUBLIC_NETWORK` (ADR 0051). No contract change.

## Decision

**Templates.** The create form opens with step 1, "Pick a starting point": Friends (picked by default, today's values), Family, Office and Custom. A template only fills in the form's existing fields; every field stays editable, and a note counts how many settings the creator changed. The values live in one file, `apps/web/src/lib/templates.ts`, so they are easy to change.

| Setting                             | Friends   | Family    | Office  | Custom    |
| ----------------------------------- | --------- | --------- | ------- | --------- |
| Suggested installment (AVAX / USDT) | 0.5 / 50  | 0.25 / 25 | 1 / 100 | 0.5 / 50  |
| Late fees, each (share of amount)   | 2%        | 1%        | 4%      | 2%        |
| Due day, second fee after day       | 10, 20    | 10, 25    | 5, 15   | 10, 20    |
| Payment holidays a year             | 3         | 6         | 2       | 3         |
| Missed months before a dormant vote | 3         | 6         | 2       | 3         |
| Payments before a new member votes  | 2         | 1         | 3       | 2         |
| Voters who must take part           | 50%       | 50%       | 66%     | 50%       |
| Yes votes needed (loans, rules)     | over half | over half | 60%     | over half |
| Loan interest a month               | 1%        | 0.5%      | 1.5%    | 1%        |
| Loan limit vs savings (k)           | 2         | 3         | 1       | 2         |
| Every loan needs a guarantor        | no        | no        | yes     | no        |
| Notice to leave                     | 30 days   | 60 days   | 30 days | 30 days   |
| Suggested member cap                | 12        | 10        | 20      | 12        |

To make these settable, the form gains a "Loans, votes and leaving" section with six fields: interest, k, quorum (`Config.quorumPct`, 20..100), yes votes needed (`passPct`), notice to leave and the guarantor switch. Every other rule keeps `Rules.defaults`. The later-term rates rise with the first rate, so a higher rate can't break their order. The rules are checked with the same `rulesProblem` the rule-change form uses, and a unit test (S-TPL-01) runs every template in both assets through the form's own `validate` and the contract bounds.

The asset and the member cap stay explicit choices. A template never changes the asset, and only suggests a cap: it replaces the cap field only while it still holds the previous template's suggestion. "Guarantor required for bigger loans" became "every loan needs a guarantor" plus a lower k, because the contract has a single guarantor switch and no size threshold.

**Onboarding guide.** A public, indexable page at `/start` written for someone who has never used crypto: install Core (extension or phone, only from core.app or the official stores), create a wallet and write down the recovery phrase (a boxed warning: lost phrase means lost money, nobody can reset it, never share it, WealthKart will never ask), pick a backup (nominee) wallet, get a little AVAX for fees, get USDT if the circle uses it, then open the invite link and join. Fuji builds link the free Fuji faucet and the in-app "Get test USDT" button (ADR 0053); mainnet builds say to buy on a licensed exchange and name none. The page uses the shared content model (`content/pages.ts`), so it gets a sitemap entry, a `/start.md` twin, an llms.txt line, an OG card and `HowTo` JSON-LD for free. Two new block kinds carry the warning box and link lists.

Each step has a small ink line drawing with one cobalt element, like the landing diagrams. Motion is CSS plus a 40-line observer: the hero lines trace on load and each step's drawing traces once as it scrolls in. No GSAP. Without a script or with reduced motion, every drawing is complete.

The sign-in page links it ("New to wallets? Start here"), as do the landing hero, the landing's final call to action and the public header and footer. The public header's links now appear from the `lg` breakpoint, since five links no longer fit at `md`.

**First-run checklist.** The home screen shows "Before you start" for a connected wallet until everything is done or the person hides it: recovery phrase written down (self-ticked), a little AVAX for fees (read from the balance), a backup wallet picked (self-ticked) and in a circle (read from the chain). Each open item links to its `/start` step. Ticks and "hide" are stored per wallet in localStorage, and every read and write is wrapped in try/catch, so blocked storage only means the list shows again.

## Alternatives considered

- **Templates as presets in the contract or factory:** needs a contract change and makes the menu harder to adjust. Rejected; the form is the only place they matter.
- **Locking a template's values:** creators would have to switch to Custom to change one field. Rejected; everything stays editable and the form shows what changed.
- **Template sets the member cap and asset:** both are permanent. Rejected; they stay deliberate choices.
- **Reading the nominee from the chain:** the nominee setting (ADR 0016) isn't built in the contracts yet, so the checklist item is self-ticked and the guide says the setting is on its way. It becomes a chain read when the contract lands.
- **Naming exchanges or an on-ramp:** an endorsement we can't stand behind, and it varies by country. Rejected.
- **GSAP on `/start`:** not needed for a stroke trace; it would add weight to a page meant for slow phones.

## Consequences

- Founders see what a set of rules means before creating a circle, and the loan, vote and notice rules are now set at creation instead of always defaulting.
- Changing a template is a one-file edit, guarded by S-TPL-01.
- When the nominee contract work lands, update the `/start` backup-wallet step and switch the checklist item to a chain read.
- Scenarios: S-TPL-01..06 and S-ONB-01..07 in `docs/testing.md`.
