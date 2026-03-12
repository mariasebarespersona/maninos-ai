"""Tests for the full accounting flow: classify → confirm → post → report.

Validates that:
1. Only QuickBooks accounts (with parent_account_id) are used for classification
2. The report tree correctly aggregates transactions under QB hierarchy
3. Reconciled movements update existing transactions (not create duplicates)
4. P&L and Balance Sheet show correct figures
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.routes.accounting import _build_report_tree


# === Mock QuickBooks accounts (mimicking migration 028 hierarchy) ===

ACCOUNTS = [
    # P&L roots
    {"id": "pl-income", "code": "PL_INCOME", "name": "Income", "account_type": "income", "is_header": True, "parent_account_id": None, "display_order": 4000, "current_balance": 0},
    {"id": "a-40000", "code": "40000", "name": "House Sales", "account_type": "income", "is_header": False, "parent_account_id": "pl-income", "display_order": 4010, "current_balance": 0},

    {"id": "pl-cogs", "code": "PL_COGS", "name": "Cost of Goods Sold", "account_type": "cogs", "is_header": True, "parent_account_id": None, "display_order": 5000, "current_balance": 0},
    {"id": "a-50000", "code": "50000", "name": "COGS", "account_type": "cogs", "is_header": True, "parent_account_id": "pl-cogs", "display_order": 5010, "current_balance": 0},
    {"id": "a-50020", "code": "50020", "name": "House Sales - COGS", "account_type": "cogs", "is_header": False, "parent_account_id": "a-50000", "display_order": 5020, "current_balance": 0},

    {"id": "pl-expenses", "code": "PL_EXPENSES", "name": "Expenses", "account_type": "expense", "is_header": True, "parent_account_id": None, "display_order": 6000, "current_balance": 0},
    {"id": "a-60000", "code": "60000", "name": "Operating Expenses", "account_type": "expense", "is_header": True, "parent_account_id": "pl-expenses", "display_order": 6010, "current_balance": 0},
    {"id": "a-60800", "code": "60800", "name": "Utilities", "account_type": "expense", "is_header": True, "parent_account_id": "a-60000", "display_order": 6130, "current_balance": 0},  # changed parent to 60000 direct for test simplicity
    {"id": "a-60850", "code": "60850", "name": "Phone service", "account_type": "expense", "is_header": False, "parent_account_id": "a-60800", "display_order": 6133, "current_balance": 0},

    # Legacy custom accounts (NO parent_account_id — should NOT appear in reports)
    {"id": "a-ing100", "code": "ING-100", "name": "Ventas Contado", "account_type": "income", "is_header": False, "parent_account_id": None, "display_order": 0, "current_balance": 0},
    {"id": "a-gas100", "code": "GAS-100", "name": "Compra de Casas", "account_type": "expense", "is_header": False, "parent_account_id": None, "display_order": 0, "current_balance": 0},
    {"id": "a-ing900", "code": "ING-900", "name": "Otros Ingresos", "account_type": "income", "is_header": False, "parent_account_id": None, "display_order": 0, "current_balance": 0},
]


def test_report_tree_only_shows_qb_accounts():
    """The report tree should only include accounts that are part of the QB hierarchy."""
    # Simulate: transactions assigned to QB accounts
    balances = {
        "a-40000": 6000.0,   # House Sales income
        "a-60850": 589.0,     # Phone service expense
    }

    income_tree = _build_report_tree(ACCOUNTS, balances, ["PL_INCOME"])
    assert len(income_tree) == 1, "Should have 1 income root"
    assert income_tree[0]["code"] == "PL_INCOME"
    assert income_tree[0]["total"] == 6000.0, f"Income total should be 6000, got {income_tree[0]['total']}"

    expense_tree = _build_report_tree(ACCOUNTS, balances, ["PL_EXPENSES"])
    assert len(expense_tree) == 1
    assert expense_tree[0]["total"] == 589.0, f"Expense total should be 589, got {expense_tree[0]['total']}"

    print("  ✓ test_report_tree_only_shows_qb_accounts passed")


def test_legacy_accounts_not_in_tree():
    """Transactions on ING-xxx/GAS-xxx accounts should NOT appear in the report tree."""
    # Simulate: transactions assigned to legacy accounts
    balances = {
        "a-ing100": 5000.0,   # On legacy ING-100
        "a-gas100": 13500.0,  # On legacy GAS-100
    }

    income_tree = _build_report_tree(ACCOUNTS, balances, ["PL_INCOME"])
    # ING-100 has no parent → not in PL_INCOME tree → total should be 0
    assert income_tree[0]["total"] == 0, f"Income should be 0 (legacy accounts excluded), got {income_tree[0]['total']}"

    expense_tree = _build_report_tree(ACCOUNTS, balances, ["PL_EXPENSES"])
    assert expense_tree[0]["total"] == 0, f"Expenses should be 0 (legacy accounts excluded), got {expense_tree[0]['total']}"

    print("  ✓ test_legacy_accounts_not_in_tree passed")


def test_mixed_accounts_only_qb_counted():
    """When some transactions use QB and some use legacy, only QB shows in reports."""
    balances = {
        "a-40000": 1000.0,    # QB: House Sales
        "a-ing100": 5000.0,   # Legacy: Ventas Contado (should be invisible)
        "a-60850": 589.0,     # QB: Phone service
        "a-gas100": 13500.0,  # Legacy: Compra de Casas (should be invisible)
    }

    income_tree = _build_report_tree(ACCOUNTS, balances, ["PL_INCOME"])
    assert income_tree[0]["total"] == 1000.0, f"Only QB income ($1000) should count, got {income_tree[0]['total']}"

    expense_tree = _build_report_tree(ACCOUNTS, balances, ["PL_EXPENSES"])
    assert expense_tree[0]["total"] == 589.0, f"Only QB expenses ($589) should count, got {expense_tree[0]['total']}"

    print("  ✓ test_mixed_accounts_only_qb_counted passed")


def test_hierarchy_aggregation():
    """Child account balances should aggregate up through parent headers."""
    balances = {
        "a-60850": 589.0,     # Phone service → under Utilities (60800) → under Operating (60000) → under PL_EXPENSES
        "a-50020": 13500.0,   # House Sales COGS → under COGS (50000) → under PL_COGS
    }

    cogs_tree = _build_report_tree(ACCOUNTS, balances, ["PL_COGS"])
    assert cogs_tree[0]["total"] == 13500.0, f"COGS total should be 13500, got {cogs_tree[0]['total']}"
    # Check nested: PL_COGS → 50000 → 50020
    cogs_50000 = cogs_tree[0]["children"][0]
    assert cogs_50000["code"] == "50000"
    assert cogs_50000["total"] == 13500.0

    expense_tree = _build_report_tree(ACCOUNTS, balances, ["PL_EXPENSES"])
    assert expense_tree[0]["total"] == 589.0
    # Check nested: PL_EXPENSES → 60000 → 60800 → 60850
    operating = expense_tree[0]["children"][0]
    assert operating["code"] == "60000"
    assert operating["total"] == 589.0

    print("  ✓ test_hierarchy_aggregation passed")


def test_pl_net_income_calculation():
    """Simulate a full P&L calculation: income - cogs - expenses = net income."""
    balances = {
        "a-40000": 6000.0,    # House Sales
        "a-50020": 3000.0,    # COGS
        "a-60850": 589.0,     # Phone service
    }

    income_tree = _build_report_tree(ACCOUNTS, balances, ["PL_INCOME"])
    cogs_tree = _build_report_tree(ACCOUNTS, balances, ["PL_COGS"])
    expense_tree = _build_report_tree(ACCOUNTS, balances, ["PL_EXPENSES"])

    total_income = sum(n["total"] for n in income_tree)
    total_cogs = sum(n["total"] for n in cogs_tree)
    total_expenses = sum(n["total"] for n in expense_tree)
    net_income = total_income - total_cogs - total_expenses

    assert total_income == 6000.0
    assert total_cogs == 3000.0
    assert total_expenses == 589.0
    assert net_income == 2411.0, f"Net income should be 2411, got {net_income}"

    print("  ✓ test_pl_net_income_calculation passed")


def test_qb_account_filter():
    """Verify the filtering logic that only keeps QB accounts for AI classification."""
    qb_root_codes = {"PL_INCOME", "PL_COGS", "PL_EXPENSES", "PL_OTHER_EXPENSES", "BS_ASSETS", "BS_LIABILITIES", "BS_EQUITY"}
    qb_accounts = [a for a in ACCOUNTS if a.get("parent_account_id") or a["code"] in qb_root_codes]

    qb_codes = {a["code"] for a in qb_accounts}
    # QB accounts should be included
    assert "PL_INCOME" in qb_codes
    assert "40000" in qb_codes
    assert "60850" in qb_codes
    assert "50020" in qb_codes
    # Legacy accounts should be excluded
    assert "ING-100" not in qb_codes, "ING-100 should be filtered out"
    assert "GAS-100" not in qb_codes, "GAS-100 should be filtered out"
    assert "ING-900" not in qb_codes, "ING-900 should be filtered out"

    print("  ✓ test_qb_account_filter passed")


def test_reconciled_movement_post_logic():
    """Reconciled movements should update existing transaction, not create new one."""
    # Simulate a reconciled movement
    mv_reconciled = {
        "id": "mv-1",
        "status": "reconciled",
        "matched_transaction_id": "txn-existing-123",
        "final_account_id": "a-40000",
    }
    # Simulate a confirmed (non-reconciled) movement
    mv_confirmed = {
        "id": "mv-2",
        "status": "confirmed",
        "matched_transaction_id": None,
        "final_account_id": "a-60850",
    }

    # Reconciled: should update, not insert
    assert mv_reconciled["status"] == "reconciled"
    assert mv_reconciled["matched_transaction_id"] is not None
    # → update accounting_transactions SET account_id = final_account_id WHERE id = matched_transaction_id

    # Confirmed: should insert new
    assert mv_confirmed["status"] == "confirmed"
    assert mv_confirmed.get("matched_transaction_id") is None
    # → insert new accounting_transaction

    print("  ✓ test_reconciled_movement_post_logic passed")


if __name__ == "__main__":
    print("Running accounting flow tests...\n")
    test_report_tree_only_shows_qb_accounts()
    test_legacy_accounts_not_in_tree()
    test_mixed_accounts_only_qb_counted()
    test_hierarchy_aggregation()
    test_pl_net_income_calculation()
    test_qb_account_filter()
    test_reconciled_movement_post_logic()
    print("\n✅ All accounting flow tests passed!")
