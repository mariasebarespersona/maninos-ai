"""Regression tests that lock in the two presentation bugs we just fixed
in the income statement and balance sheet endpoints.

If either of these tests starts failing, the books DON'T cuadrar on screen
even if they do internally — that's exactly the trap we keep falling into.

Tests run against live prod via the public API, no DB writes."""
import os
import urllib.request
import json
import pytest

API = os.getenv("E2E_API_URL", "https://maninos-ai-production.up.railway.app")


def _get(path: str) -> dict:
    with urllib.request.urlopen(f"{API}{path}", timeout=30) as resp:
        return json.load(resp)


def test_income_statement_exposes_total_income():
    """The /reports/income-statement endpoint MUST expose total_income
    in its `sections` payload so the UI can render the Income header row.
    Before this regression test we returned an income TREE but no total,
    so the UI showed $0.00 next to "Income" even when there were real
    sales."""
    data = _get("/api/accounting/reports/income-statement")
    sec = data.get("sections", {})

    assert "total_income" in sec, "sections.total_income MUST be present"
    assert "total_cogs" in sec, "sections.total_cogs MUST be present"
    assert "total_expenses" in sec, "sections.total_expenses MUST be present"

    # The internal accounting equation must still hold:
    #   net_income = total_income + total_other_income
    #              - total_cogs - total_expenses - total_other_expenses
    inc = sec.get("total_income", 0)
    oi = sec.get("total_other_income", 0)
    cogs = sec.get("total_cogs", 0)
    exp = sec.get("total_expenses", 0)
    oe = sec.get("total_other_expenses", 0)
    expected_ni = inc + oi - cogs - exp - oe
    reported_ni = sec.get("net_income", 0)
    assert abs(expected_ni - reported_ni) < 0.01, (
        f"Net Income arithmetic broken: "
        f"{inc} + {oi} - {cogs} - {exp} - {oe} = {expected_ni:.2f} "
        f"but report says {reported_ni:.2f}"
    )


def test_balance_sheet_actually_balances():
    """The accounting equation must hold ON SCREEN.
    Assets must equal Total Liabilities + Equity (reported field).
    If this test fails the Balance Sheet shows internally inconsistent
    figures to the operator even if every individual transaction is
    correct in the ledger."""
    data = _get("/api/accounting/reports/balance-sheet")
    sec = data.get("sections", {})

    assets = sec.get("total_assets", 0)
    le_total = sec.get("total_liabilities_and_equity", 0)

    assert abs(assets - le_total) < 0.01, (
        f"Balance Sheet does not balance: "
        f"Assets={assets:.2f} ≠ Total L+E={le_total:.2f} "
        f"(diff={assets - le_total:.2f}). "
        f"This usually means equity is being computed off raw ledger "
        f"rows with inconsistent is_income sign conventions. The fix is "
        f"to derive total_equity from Assets - Liabilities - NetIncome "
        f"(see get_balance_sheet in api/routes/accounting.py)."
    )


def test_balance_sheet_equity_is_not_inverted():
    """Equity must be shown with its NATURAL sign (positive credit balance),
    not as a negative number that confuses operators into thinking the
    company has negative net worth."""
    data = _get("/api/accounting/reports/balance-sheet")
    sec = data.get("sections", {})

    total_assets = sec.get("total_assets", 0)
    total_equity = sec.get("total_equity", 0)

    # If the company has positive net assets (typical case for an LLC
    # running operations from contributed capital), equity must be
    # positive too. Allow the equity to be zero or negative ONLY if
    # liabilities exceed assets — that would be a real insolvency.
    total_liabilities = sec.get("total_liabilities", 0)
    if total_assets > total_liabilities:
        assert total_equity > -0.01, (
            f"Equity reported as ${total_equity:,.2f} (negative) while "
            f"Assets ${total_assets:,.2f} > Liabilities ${total_liabilities:,.2f}. "
            f"A solvent company with positive net assets cannot have negative "
            f"equity on a correctly-presented Balance Sheet. The opening "
            f"balance equity sign is likely inverted (see migration 093)."
        )
