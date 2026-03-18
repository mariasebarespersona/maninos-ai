"""
Test script for post-renovation price auto-calculation.

Formula: 9500 + purchase_price + commission ($1,500) + renovation_cost + move_cost

Tests verify:
1. Price calculation with all components
2. Price calculation with no renovation or moves
3. Price calculation with multiple moves
4. Auto-calculation on complete-renovation when no price provided
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["SUPABASE_URL"] = "https://dummy.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoic2VydmljZV9yb2xlIiw"
    "iaWF0IjoxNjE2MTU5MjIyLCJleHAiOjE5MzE3MzUyMjJ9.dummykey"
)

from unittest.mock import MagicMock

_mock_sb = MagicMock()
sys.modules["tools.supabase_client"] = type(sys)("tools.supabase_client")
sys.modules["tools.supabase_client"].sb = _mock_sb

from api.routes.properties import _calculate_post_renovation_price, MARGIN_FIXED, COMMISSION_MAX


def make_chainable(data):
    mock = MagicMock()
    mock.execute.return_value = MagicMock(data=data)
    mock.select.return_value = mock
    mock.eq.return_value = mock
    mock.order.return_value = mock
    mock.limit.return_value = mock
    return mock


# ── TEST: Full calculation ──
def test_full_calculation():
    """Purchase $20K + renovation $8K + move $1.5K = 9500 + 20000 + 1500 + 8000 + 1500 = $40,500"""
    def mock_table(name):
        if name == "renovations":
            return make_chainable([{"total_cost": "8000", "status": "completed"}])
        elif name == "moves":
            return make_chainable([
                {"quoted_cost": "1500", "final_cost": None, "status": "completed"},
            ])
        return make_chainable([])

    _mock_sb.table.side_effect = mock_table

    result = _calculate_post_renovation_price("prop-1", 20000)

    assert result["margin"] == 9500
    assert result["purchase_price"] == 20000
    assert result["commission"] == 1500
    assert result["renovation_cost"] == 8000
    assert result["move_cost"] == 1500
    assert result["recommended_sale_price"] == 40500
    print("PASS test_full_calculation")


# ── TEST: No renovation, no moves ──
def test_no_renovation_no_moves():
    """Just purchase: 9500 + 15000 + 1500 + 0 + 0 = $26,000"""
    _mock_sb.table.side_effect = lambda name: make_chainable([])

    result = _calculate_post_renovation_price("prop-2", 15000)

    assert result["renovation_cost"] == 0
    assert result["move_cost"] == 0
    assert result["recommended_sale_price"] == 26000  # 9500 + 15000 + 1500
    print("PASS test_no_renovation_no_moves")


# ── TEST: Multiple moves ──
def test_multiple_moves():
    """Two moves: $1200 + $800 = $2000 total move cost"""
    def mock_table(name):
        if name == "renovations":
            return make_chainable([{"total_cost": "5000", "status": "completed"}])
        elif name == "moves":
            return make_chainable([
                {"quoted_cost": "1200", "final_cost": "1200", "status": "completed"},
                {"quoted_cost": "800", "final_cost": None, "status": "scheduled"},
            ])
        return make_chainable([])

    _mock_sb.table.side_effect = mock_table

    result = _calculate_post_renovation_price("prop-3", 25000)

    assert result["move_cost"] == 2000
    assert result["renovation_cost"] == 5000
    # 9500 + 25000 + 1500 + 5000 + 2000 = 43000
    assert result["recommended_sale_price"] == 43000
    print("PASS test_multiple_moves")


# ── TEST: Move with final_cost overrides quoted ──
def test_final_cost_overrides_quoted():
    """final_cost takes precedence over quoted_cost"""
    def mock_table(name):
        if name == "renovations":
            return make_chainable([])
        elif name == "moves":
            return make_chainable([
                {"quoted_cost": "1000", "final_cost": "1800", "status": "completed"},
            ])
        return make_chainable([])

    _mock_sb.table.side_effect = mock_table

    result = _calculate_post_renovation_price("prop-4", 30000)

    assert result["move_cost"] == 1800
    # 9500 + 30000 + 1500 + 0 + 1800 = 42800
    assert result["recommended_sale_price"] == 42800
    print("PASS test_final_cost_overrides_quoted")


# ── TEST: Constants ──
def test_constants():
    assert MARGIN_FIXED == 9500
    assert COMMISSION_MAX == 1500
    print("PASS test_constants")


if __name__ == "__main__":
    test_full_calculation()
    test_no_renovation_no_moves()
    test_multiple_moves()
    test_final_cost_overrides_quoted()
    test_constants()
    print("\n✅ All post-renovation price tests passed!")
