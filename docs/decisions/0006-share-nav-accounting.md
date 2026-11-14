# 0006. Share/NAV accounting for fair joins and exits

- **Status:** Accepted
- **Date:** 2026-11-14

## Context
G1 assumes everyone owns 1/12, which breaks with open membership, late joiners, missed months and exits.

## Decision
Each contribution mints non-transferable shares at the current NAV (vault value / total shares). Interest and penalties raise NAV. Stake = shares x NAV. Exits burn shares at NAV.

## Alternatives considered
- Equal split per member: unfair with late joins and missed months.
- Per-member ledgers of principal plus pro-rata interest: complex and error-prone.

## Consequences
Must defend against first-depositor and donation (inflation) attacks: use internal accounting, never `address(this).balance`, plus virtual shares or a minimum initial deposit. Rounding must favour the vault.
