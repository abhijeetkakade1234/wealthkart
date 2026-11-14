# packages/rules/scripts

**What's here:** one-off helper scripts. Not part of the build or tests.
**Open this when:** the G1 sheet changes and the replay fixture needs rebuilding.

| File            | Purpose                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extract-g1.py` | Reads the anonymised `WealthKart G1 Monthly Investment.xlsx` at the repo root and writes `../test/fixtures/g1-ledger.json`. Copies numbers only, never the free-text notes. Needs `openpyxl`. |

Run from the repo root:

```sh
python packages/rules/scripts/extract-g1.py
pnpm prettier --write packages/rules/test/fixtures/g1-ledger.json
```

The output is deterministic; a rerun on the same sheet gives an identical file.
