"""
One-off: extract the G1 ledger from the (anonymised) xlsx into a compact JSON
fixture for the replay tests in packages/rules/test/g1-replay.test.ts.

Usage (repo root):  python packages/rules/scripts/extract-g1.py
                    pnpm prettier --write packages/rules/test/fixtures/g1-ledger.json
Needs: openpyxl. The xlsx was re-saved without cached values, so every formula
cell we read must be plain arithmetic ("=2500-50000"); anything else fails loudly.
Free-text notes are NOT copied (they are not needed and may hold personal data).
"""
import ast
import json
import operator
import sys
from fractions import Fraction
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "WealthKart G1 Monthly Investment.xlsx"
OUT = Path(__file__).resolve().parents[1] / "test" / "fixtures" / "g1-ledger.json"

FIRST_ROW, LAST_ROW = 3, 107  # Apr-18 .. Dec-26
MEMBER_COLS = range(5, 17)  # E..P
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


def _ev(node):
    if isinstance(node, ast.Expression):
        return _ev(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return Fraction(str(node.value))
    if isinstance(node, ast.BinOp) and type(node.op) in OPS:
        return OPS[type(node.op)](_ev(node.left), _ev(node.right))
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _ev(node.operand)
        return -v if isinstance(node.op, ast.USub) else v
    raise ValueError("not plain arithmetic")


def num(cell):
    """Value of a cell holding a number or an arithmetic-only formula, in whole rupees."""
    v = cell.value
    if v is None or v == "":
        return 0
    if isinstance(v, (int, float)):
        f = Fraction(str(v))
    elif isinstance(v, str) and v.startswith("="):
        try:
            f = _ev(ast.parse(v[1:].replace(" ", ""), mode="eval"))
        except (ValueError, SyntaxError) as e:
            sys.exit(f"{cell.parent.title}!{cell.coordinate}: can't evaluate {v!r} ({e})")
    else:
        sys.exit(f"{cell.parent.title}!{cell.coordinate}: unexpected value {v!r}")
    if f.denominator != 1:
        sys.exit(f"{cell.parent.title}!{cell.coordinate}: non-integer rupees {v!r}")
    return int(f)


def main():
    wb = openpyxl.load_workbook(SRC, data_only=False)
    g1, debit, summary = wb["WealthKart G1"], wb["Debit"], wb["Summary"]
    members = [g1.cell(2, c).value for c in MEMBER_COLS]
    assert members == [f"MEMBER {i:02d}" for i in range(1, 13)], members

    months = []
    for i, r in enumerate(range(FIRST_ROW, LAST_ROW + 1)):
        idx = 3 + i  # month index from Apr-2018 (0-based month 3)
        year, mon = 2018 + idx // 12, idx % 12
        label = str(g1.cell(r, 1).value).strip().upper()[:3]
        assert label == MONTHS[mon], (r, label)
        paid = [num(g1.cell(r, c)) for c in MEMBER_COLS]
        assert all(p in (0, 1) for p in paid), (r, paid)
        months.append(
            {
                "month": f"{year}-{mon + 1:02d}",
                "installment": num(g1.cell(r, 19)),  # S
                "paid": paid,
                "credit": num(g1.cell(r, 17)),  # Q: bank interest, bonus, fees, interest lump
                "uti": num(g1.cell(r, 21)),  # U
                "debit": [num(debit.cell(r, c)) for c in MEMBER_COLS],  # interest + repaid - lent
            }
        )

    data = {
        "source": "WealthKart G1 Monthly Investment.xlsx (anonymised copy)",
        "units": "whole rupees",
        "members": members,
        "months": months,
        # Hand-edited outstanding-loan formulas; the sheet keeps two copies.
        "outstandingDebitRow110": [num(debit.cell(110, c)) for c in MEMBER_COLS],
        "outstandingSummaryColE": [num(summary.cell(r, 5)) for r in range(2, 14)],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(months)} months)")


if __name__ == "__main__":
    main()
