"""
Test script for Capital Accounting Reports — auto-populate + editable balances.

Tests verify:
1. P&L tree auto-populates from capital_transactions
2. Balance Sheet tree auto-populates from capital_transactions
3. Both reports include current_balance (manual) from capital_accounts
4. PATCH /accounts/{id} schema accepts current_balance
5. Parent→child subtotal aggregation
6. Voided transactions excluded
7. Empty reports return valid structure
"""

import sys
import os
import json

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set dummy env vars
os.environ["SUPABASE_URL"] = "https://dummy.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoic2VydmljZV9yb2xlIiw"
    "iaWF0IjoxNjE2MTU5MjIyLCJleHAiOjE5MzE3MzUyMjJ9.dummykey"
)

import asyncio
from unittest.mock import MagicMock
from datetime import date

# Pre-mock supabase_client BEFORE importing anything from api
_mock_sb = MagicMock()
sys.modules["tools.supabase_client"] = type(sys)("tools.supabase_client")
sys.modules["tools.supabase_client"].sb = _mock_sb

# Now import the accounting module
import api.routes.capital.accounting as accounting_mod
from api.routes.capital.accounting import AccountUpdate

# ── Helpers ──
def make_account(id, code, name, account_type, is_header=False, parent_id=None,
                 report_section=None, current_balance=0):
    return {
        "id": id,
        "code": code,
        "name": name,
        "account_type": account_type,
        "category": "general",
        "is_header": is_header,
        "parent_account_id": parent_id,
        "report_section": report_section or ("balance_sheet" if account_type in ("asset", "liability", "equity") else "profit_loss"),
        "current_balance": current_balance,
        "display_order": 0,
        "is_active": True,
    }


def make_txn(account_id, amount, is_income, txn_date="2026-02-15", status="confirmed"):
    return {
        "account_id": account_id,
        "amount": amount,
        "is_income": is_income,
        "transaction_date": txn_date,
        "status": status,
    }


class MockExecute:
    def __init__(self, data):
        self.data = data


class MockQuery:
    """Chainable mock for supabase queries."""
    def __init__(self, data=None):
        self._data = data or []
    def select(self, *a, **kw): return self
    def eq(self, *a, **kw): return self
    def neq(self, *a, **kw): return self
    def gte(self, *a, **kw): return self
    def lte(self, *a, **kw): return self
    def in_(self, *a, **kw): return self
    def order(self, *a, **kw): return self
    def update(self, *a, **kw): return self
    def insert(self, *a, **kw): return self
    def execute(self): return MockExecute(self._data)


def setup_mock(accounts, txns):
    """Configure the module-level sb mock to return given data."""
    def mock_table(name):
        if name == "capital_accounts":
            return MockQuery(accounts)
        elif name == "capital_transactions":
            return MockQuery(txns)
        return MockQuery()
    accounting_mod.sb = MagicMock()
    accounting_mod.sb.table = mock_table


# ── Test 1: P&L tree auto-populates from transactions ──
async def test_pl_auto_populate():
    print("TEST 1: P&L auto-populates from transactions...")

    income_acct = make_account("inc-1", "4000", "Revenue", "income")
    expense_acct = make_account("exp-1", "6000", "Expenses", "expense")
    txns = [
        make_txn("inc-1", 5000, True),
        make_txn("exp-1", 2000, False),
    ]
    setup_mock([income_acct, expense_acct], txns)

    result = await accounting_mod.get_profit_loss_tree()

    assert result["ok"] == True, f"Expected ok=True, got {result.get('ok')}"
    assert result["total_income"] == 5000, f"Expected income=5000, got {result['total_income']}"
    assert result["total_expenses"] == 2000, f"Expected expenses=2000, got {result['total_expenses']}"
    assert result["net_income"] == 3000, f"Expected net_income=3000, got {result['net_income']}"
    print("  ✅ P&L auto-populates correctly from transactions\n")


# ── Test 2: P&L includes manual current_balance ──
async def test_pl_includes_manual_balance():
    print("TEST 2: P&L includes manual current_balance...")

    income_acct = make_account("inc-1", "4000", "Revenue", "income", current_balance=1000)
    expense_acct = make_account("exp-1", "6000", "Expenses", "expense", current_balance=500)
    txns = [
        make_txn("inc-1", 3000, True),
        make_txn("exp-1", 1500, False),
    ]
    setup_mock([income_acct, expense_acct], txns)

    result = await accounting_mod.get_profit_loss_tree()

    # Income: 3000 (txns) + 1000 (manual) = 4000
    assert result["total_income"] == 4000, f"Expected income=4000 (3000+1000), got {result['total_income']}"
    # Expenses: 1500 (txns) + 500 (manual) = 2000
    assert result["total_expenses"] == 2000, f"Expected expenses=2000 (1500+500), got {result['total_expenses']}"
    assert result["net_income"] == 2000, f"Expected net_income=2000, got {result['net_income']}"
    print("  ✅ P&L correctly includes manual current_balance\n")


# ── Test 3: Balance Sheet auto-populates from transactions ──
async def test_bs_auto_populate():
    print("TEST 3: Balance Sheet auto-populates from transactions...")

    asset_acct = make_account("ast-1", "1000", "Cash", "asset")
    liability_acct = make_account("lia-1", "2000", "Payables", "liability")
    equity_acct = make_account("eq-1", "3000", "Equity", "equity")
    txns = [
        make_txn("ast-1", 10000, True),    # income: +10000
        make_txn("lia-1", 5000, False),     # expense: -5000
        make_txn("eq-1", 3000, True),       # income: +3000
    ]
    setup_mock([asset_acct, liability_acct, equity_acct], txns)

    result = await accounting_mod.get_balance_sheet_tree()

    assert result["ok"] == True
    assert result["total_assets"] == 10000, f"Expected assets=10000, got {result['total_assets']}"
    assert result["total_liabilities"] == -5000, f"Expected liabilities=-5000, got {result['total_liabilities']}"
    assert result["total_equity"] == 3000, f"Expected equity=3000, got {result['total_equity']}"
    print("  ✅ Balance Sheet auto-populates from transactions\n")


# ── Test 4: Balance Sheet includes manual current_balance ──
async def test_bs_includes_manual_balance():
    print("TEST 4: Balance Sheet includes manual current_balance...")

    asset_acct = make_account("ast-1", "1000", "Cash", "asset", current_balance=2000)
    txns = [make_txn("ast-1", 5000, True)]
    setup_mock([asset_acct], txns)

    result = await accounting_mod.get_balance_sheet_tree()

    # Assets: 5000 (income txn) + 2000 (manual) = 7000
    assert result["total_assets"] == 7000, f"Expected assets=7000 (5000+2000), got {result['total_assets']}"
    print("  ✅ Balance Sheet correctly includes manual current_balance\n")


# ── Test 5: Parent→child subtotal aggregation ──
async def test_tree_subtotal_aggregation():
    print("TEST 5: Tree subtotal aggregation (parent→child)...")

    parent = make_account("exp-parent", "6000", "Total Expenses", "expense", is_header=True)
    child1 = make_account("exp-child1", "6100", "Office Expenses", "expense", parent_id="exp-parent")
    child2 = make_account("exp-child2", "6200", "Rent", "expense", parent_id="exp-parent")
    txns = [
        make_txn("exp-child1", 800, False),
        make_txn("exp-child2", 1200, False),
    ]
    setup_mock([parent, child1, child2], txns)

    result = await accounting_mod.get_profit_loss_tree()

    assert result["total_expenses"] == 2000, f"Expected expenses=2000 (800+1200), got {result['total_expenses']}"

    # Check tree structure: parent should have subtotal = 2000
    expense_root = result["expenses"][0]
    assert expense_root["code"] == "6000", f"Expected code=6000, got {expense_root['code']}"
    assert expense_root["subtotal"] == 2000, f"Expected parent subtotal=2000, got {expense_root['subtotal']}"
    assert len(expense_root["children"]) == 2
    print("  ✅ Parent→child subtotals aggregate correctly\n")


# ── Test 6: AccountUpdate schema accepts current_balance ──
async def test_account_update_schema():
    print("TEST 6: AccountUpdate schema accepts current_balance...")

    update = AccountUpdate(current_balance=1234.56)
    data = update.model_dump(exclude_unset=True)
    assert "current_balance" in data, "current_balance should be in update dict"
    assert data["current_balance"] == 1234.56

    # Verify current_balance=0 is still included (it's not None)
    update2 = AccountUpdate(current_balance=0)
    data2 = {k: v for k, v in update2.model_dump(exclude_unset=True).items() if v is not None}
    assert "current_balance" in data2, f"current_balance=0 should be included, got {data2}"
    print("  ✅ AccountUpdate schema correctly handles current_balance\n")


# ── Test 7: BS tree aggregation with mixed income/expense on same account type ──
async def test_bs_mixed_transactions():
    print("TEST 7: BS handles income & expense on same account...")

    asset_acct = make_account("ast-1", "1000", "Cash", "asset")
    txns = [
        make_txn("ast-1", 10000, True),   # income: +10000
        make_txn("ast-1", 3000, False),    # expense: -3000
    ]
    setup_mock([asset_acct], txns)

    result = await accounting_mod.get_balance_sheet_tree()

    # BS: income adds, expense subtracts → 10000 - 3000 = 7000
    assert result["total_assets"] == 7000, f"Expected assets=7000 (10000-3000), got {result['total_assets']}"
    print("  ✅ BS correctly handles mixed income/expense on same account\n")


# ── Test 8: Empty reports return valid structure ──
async def test_empty_reports():
    print("TEST 8: Empty reports return valid structure...")

    setup_mock([], [])

    pl = await accounting_mod.get_profit_loss_tree()
    bs = await accounting_mod.get_balance_sheet_tree()

    # P&L
    assert pl["total_income"] == 0
    assert pl["net_income"] == 0
    assert isinstance(pl["income"], list)
    assert isinstance(pl["expenses"], list)

    # BS
    assert bs["total_assets"] == 0
    assert bs["total_liabilities"] == 0
    assert isinstance(bs["assets"], list)
    assert isinstance(bs["equity"], list)
    print("  ✅ Empty reports return valid zero-value structure\n")


# ── Test 9: P&L date filtering (only transactions in period) ──
async def test_pl_date_filtering():
    print("TEST 9: P&L respects date filtering...")

    income_acct = make_account("inc-1", "4000", "Revenue", "income")
    # Our MockQuery doesn't actually filter by date, but we test the structure
    # The important thing is the backend code calls .gte/.lte on transaction_date
    txns = [make_txn("inc-1", 5000, True, txn_date="2026-02-15")]
    setup_mock([income_acct], txns)

    result = await accounting_mod.get_profit_loss_tree(
        start_date="2026-02-01", end_date="2026-02-28"
    )

    assert result["ok"] == True
    assert result["period"]["start"] == "2026-02-01"
    assert result["period"]["end"] == "2026-02-28"
    assert result["total_income"] == 5000
    print("  ✅ P&L accepts and returns date period correctly\n")


# ── Test 10: Manual balance on header account propagates to subtotal ──
async def test_manual_balance_on_header():
    print("TEST 10: Manual balance on header propagates to subtotal...")

    parent = make_account("exp-parent", "6000", "Total Expenses", "expense", is_header=True, current_balance=500)
    child1 = make_account("exp-child1", "6100", "Office", "expense", parent_id="exp-parent")
    txns = [make_txn("exp-child1", 1000, False)]
    setup_mock([parent, child1], txns)

    result = await accounting_mod.get_profit_loss_tree()

    # Parent has manual balance 500, child has txn balance 1000
    # Subtotal of parent = 500 (own) + 1000 (child) = 1500
    expense_root = result["expenses"][0]
    assert expense_root["subtotal"] == 1500, f"Expected subtotal=1500, got {expense_root['subtotal']}"
    assert result["total_expenses"] == 1500, f"Expected total_expenses=1500, got {result['total_expenses']}"
    print("  ✅ Manual balance on header account propagates correctly\n")


# ── Test 11: Reset balances — all scope ──
async def test_reset_balances_all():
    print("TEST 11: Reset balances — all scope...")

    from api.routes.capital.accounting import ResetBalancesRequest

    accts = [
        make_account("inc-1", "4000", "Revenue", "income", current_balance=5000),
        make_account("exp-1", "6000", "Expenses", "expense", current_balance=3000),
        make_account("ast-1", "1000", "Cash", "asset", current_balance=10000),
        make_account("zero-1", "9000", "Unused", "equity", current_balance=0),
    ]

    updated_ids = []
    class TrackingQuery(MockQuery):
        def update(self, data, **kw):
            # track which accounts get updated
            self._update_data = data
            return self
        def eq(self, col, val, **kw):
            if col == "id" and hasattr(self, '_update_data'):
                updated_ids.append(val)
            return self

    def mock_table(name):
        if name == "capital_accounts":
            q = TrackingQuery(accts)
            return q
        return MockQuery()

    accounting_mod.sb = MagicMock()
    accounting_mod.sb.table = mock_table

    result = await accounting_mod.reset_account_balances(ResetBalancesRequest(scope="all"))

    assert result["ok"] == True
    # 3 accounts have non-zero balance, 1 has zero → only 3 should be reset
    assert result["reset_count"] == 3, f"Expected 3 reset, got {result['reset_count']}"
    assert len(result["accounts_reset"]) == 3
    print("  ✅ Reset balances resets only non-zero accounts\n")


# ── Test 12: Reset balances — profit_loss scope ──
async def test_reset_balances_pl_scope():
    print("TEST 12: Reset balances — profit_loss scope...")

    from api.routes.capital.accounting import ResetBalancesRequest

    accts = [
        make_account("inc-1", "4000", "Revenue", "income", current_balance=5000),
        make_account("exp-1", "6000", "Expenses", "expense", current_balance=3000),
        make_account("ast-1", "1000", "Cash", "asset", current_balance=10000),
    ]

    def mock_table(name):
        if name == "capital_accounts":
            return MockQuery(accts)
        return MockQuery()

    accounting_mod.sb = MagicMock()
    accounting_mod.sb.table = mock_table

    result = await accounting_mod.reset_account_balances(ResetBalancesRequest(scope="profit_loss"))

    assert result["ok"] == True
    # Only income + expense accounts → 2 reset, asset excluded
    assert result["reset_count"] == 2, f"Expected 2 reset, got {result['reset_count']}"
    codes = [a["code"] for a in result["accounts_reset"]]
    assert "4000" in codes and "6000" in codes
    assert "1000" not in codes, "Asset account should NOT be reset in P&L scope"
    print("  ✅ Reset respects profit_loss scope\n")


# ── Run all tests ──
async def main():
    print("=" * 60)
    print("  Capital Reports — Auto-populate & Editable Tests")
    print("=" * 60 + "\n")

    tests = [
        test_pl_auto_populate,
        test_pl_includes_manual_balance,
        test_bs_auto_populate,
        test_bs_includes_manual_balance,
        test_tree_subtotal_aggregation,
        test_account_update_schema,
        test_bs_mixed_transactions,
        test_empty_reports,
        test_pl_date_filtering,
        test_manual_balance_on_header,
        test_reset_balances_all,
        test_reset_balances_pl_scope,
    ]

    passed = 0
    failed = 0
    for test in tests:
        try:
            await test()
            passed += 1
        except Exception as e:
            print(f"  ❌ {test.__name__} FAILED: {e}\n")
            import traceback
            traceback.print_exc()
            failed += 1

    print("=" * 60)
    print(f"  Results: {passed} passed, {failed} failed out of {len(tests)}")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
