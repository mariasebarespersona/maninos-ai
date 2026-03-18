"""
Test script for Capital KPIs and Customer Options endpoints.

Tests verify:
1. Strategic KPIs endpoint returns all 4 categories with correct structure
2. Each KPI has value, target, status, direction
3. Customer options endpoint returns options for completed/delivered contracts
4. Customer options calculates loyalty discounts and credits correctly
5. KPI calculations (onboarding time, conversion rate, collection rate, etc.)
6. Edge cases: empty data, no contracts, no payments
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
from unittest.mock import MagicMock, patch
from datetime import date, datetime, timedelta

# Pre-mock supabase_client BEFORE importing anything from api
_mock_sb = MagicMock()
sys.modules["tools.supabase_client"] = type(sys)("tools.supabase_client")
sys.modules["tools.supabase_client"].sb = _mock_sb

# Now import the modules
import api.routes.capital.dashboard as dashboard_mod
import api.routes.capital.contracts as contracts_mod

# ── Helpers ──
def make_result(data):
    """Create a mock Supabase query result."""
    obj = MagicMock()
    obj.data = data
    return obj

def make_chainable(data):
    """Create a chainable mock that returns data on .execute()."""
    mock = MagicMock()
    mock.execute.return_value = make_result(data)
    mock.select.return_value = mock
    mock.eq.return_value = mock
    mock.neq.return_value = mock
    mock.in_.return_value = mock
    mock.gte.return_value = mock
    mock.lte.return_value = mock
    mock.lt.return_value = mock
    mock.gt.return_value = mock
    mock.order.return_value = mock
    mock.limit.return_value = mock
    mock.single.return_value = mock
    return mock

today = date.today()
today_str = today.isoformat()
month_start = today.replace(day=1).isoformat()


# ── TEST: Strategic KPIs with sample data ──
def test_strategic_kpis_with_data():
    """Test KPIs endpoint returns all 4 categories with calculated metrics."""

    applications = [
        {"id": "app1", "status": "approved", "created_at": (today - timedelta(days=3)).isoformat()},
        {"id": "app2", "status": "approved", "created_at": (today - timedelta(days=7)).isoformat()},
        {"id": "app3", "status": "submitted", "created_at": today.isoformat()},
        {"id": "app4", "status": "rejected", "created_at": (today - timedelta(days=10)).isoformat()},
    ]

    contracts = [
        {"id": "c1", "client_id": "cl1", "status": "active", "created_at": (today - timedelta(days=2)).isoformat(),
         "signed_at": (today - timedelta(days=1)).isoformat(), "start_date": (today - timedelta(days=1)).isoformat(),
         "purchase_price": "50000"},
        {"id": "c2", "client_id": "cl2", "status": "delivered", "created_at": (today - timedelta(days=30)).isoformat(),
         "signed_at": (today - timedelta(days=28)).isoformat(), "start_date": (today - timedelta(days=28)).isoformat(),
         "purchase_price": "40000"},
        {"id": "c3", "client_id": "cl1", "status": "active", "created_at": (today - timedelta(days=5)).isoformat(),
         "signed_at": (today - timedelta(days=3)).isoformat(), "start_date": (today - timedelta(days=3)).isoformat(),
         "purchase_price": "45000"},
    ]

    clients = [
        {"id": "cl1", "status": "rto_active", "kyc_verified": True},
        {"id": "cl2", "status": "completed", "kyc_verified": True},
        {"id": "cl3", "status": "rto_applicant", "kyc_verified": False},
    ]

    payments_due = [
        {"id": "p1", "amount": "500", "status": "paid", "due_date": today.isoformat(), "paid_date": today.isoformat(), "days_late": 0},
        {"id": "p2", "amount": "500", "status": "pending", "due_date": today.isoformat(), "paid_date": None, "days_late": 0},
    ]

    all_overdue = [
        {"id": "p3", "amount": "500", "status": "late", "due_date": (today - timedelta(days=45)).isoformat(), "days_late": 45, "client_id": "cl3"},
    ]

    investors = [
        {"id": "inv1", "status": "active", "total_invested": "100000", "created_at": (today - timedelta(days=60)).isoformat()},
        {"id": "inv2", "status": "active", "total_invested": "50000", "created_at": (today - timedelta(days=30)).isoformat()},
    ]

    investments = [
        {"id": "i1", "investor_id": "inv1", "amount": "50000", "invested_at": (today - timedelta(days=60)).isoformat()},
        {"id": "i2", "investor_id": "inv1", "amount": "50000", "invested_at": today.strftime("%Y-%m") + "-05"},
        {"id": "i3", "investor_id": "inv2", "amount": "50000", "invested_at": (today - timedelta(days=90)).isoformat()},
    ]

    promissory_notes = [
        {"id": "pn1", "investor_id": "inv1", "annual_rate": "10", "status": "active"},
        {"id": "pn2", "investor_id": "inv2", "annual_rate": "12", "status": "active"},
    ]

    properties = [
        {"id": "prop1", "status": "sold"},
        {"id": "prop2", "status": "sold"},
        {"id": "prop3", "status": "published"},
    ]

    # Map table queries to data
    table_data = {
        "rto_applications": applications,
        "rto_contracts": contracts,
        "clients": clients,
        "rto_payments": [],  # handled by specific queries
        "investors": investors,
        "investments": investments,
        "promissory_notes": promissory_notes,
        "properties": properties,
    }

    call_count = {"rto_payments": 0}

    def mock_table(name):
        if name == "rto_payments":
            # First call = payments_due, second = all_overdue
            call_count["rto_payments"] += 1
            if call_count["rto_payments"] <= 1:
                return make_chainable(payments_due)
            else:
                return make_chainable(all_overdue)
        return make_chainable(table_data.get(name, []))

    _mock_sb.table.side_effect = mock_table

    result = asyncio.run(dashboard_mod.get_strategic_kpis())

    assert result["ok"] is True
    kpis = result["kpis"]

    # Check all 4 categories exist
    assert "client" in kpis
    assert "investor" in kpis
    assert "portfolio" in kpis
    assert "purchase" in kpis

    # Check each category has title and metrics
    for cat_key in ["client", "investor", "portfolio", "purchase"]:
        cat = kpis[cat_key]
        assert "title" in cat
        assert "metrics" in cat
        assert len(cat["metrics"]) == 4

        # Check each metric has required fields
        for metric in cat["metrics"]:
            assert "key" in metric
            assert "label" in metric
            assert "description" in metric
            assert metric.get("value") is not None or metric["key"] == "nps"
            assert "target" in metric
            assert "unit" in metric
            assert "direction" in metric
            assert metric["direction"] in ("higher_is_better", "lower_is_better")
            assert "status" in metric
            assert metric["status"] in ("on_target", "warning", "off_target")

    # Verify specific KPI values
    client_kpis = {m["key"]: m for m in kpis["client"]["metrics"]}

    # Conversion rate: 2 approved / 4 total = 50%
    assert client_kpis["conversion_rate"]["value"] == 50.0

    # KYC: 2 verified / 3 RTO clients = 66.7%
    assert client_kpis["kyc_compliance"]["value"] == 66.7

    # NPS: not yet tracked in DB, should be None
    assert client_kpis["nps"]["value"] is None
    assert client_kpis["nps"]["status"] == "off_target"  # None < 80

    # Investor KPIs
    inv_kpis = {m["key"]: m for m in kpis["investor"]["metrics"]}

    # Cost of capital: avg of 10% and 12% = 11%
    assert inv_kpis["cost_of_capital"]["value"] == 11.0
    assert inv_kpis["cost_of_capital"]["status"] == "on_target"  # <= 12

    # Investor retention: inv1 has 2 investments, inv2 has 1 → 1/2 = 50%
    assert inv_kpis["investor_retention"]["value"] == 50.0

    # Portfolio KPIs
    portfolio_kpis = {m["key"]: m for m in kpis["portfolio"]["metrics"]}

    # Collection rate: $500 paid / $1000 due = 50%
    assert portfolio_kpis["collection_rate"]["value"] == 50.0
    assert portfolio_kpis["collection_rate"]["status"] == "off_target"  # < 80

    # Portfolio occupancy: 2 sold / 3 sellable = 66.7%
    assert portfolio_kpis["portfolio_occupancy"]["value"] == 66.7

    # Purchase KPIs
    purchase_kpis = {m["key"]: m for m in kpis["purchase"]["metrics"]}

    # Purchase completion: 1 delivered / 3 activated = 33.3%
    assert purchase_kpis["purchase_completion"]["value"] == 33.3

    # Customer retention: cl1 has 2 contracts → 1/2 = 50%
    assert purchase_kpis["customer_retention"]["value"] == 50.0
    assert purchase_kpis["customer_retention"]["status"] == "on_target"  # >= 20

    # Referral rate: not yet tracked in DB, should be 0
    assert purchase_kpis["referral_rate"]["value"] == 0
    assert purchase_kpis["referral_rate"]["status"] == "off_target"  # 0 < 5

    print("PASS test_strategic_kpis_with_data")


# ── TEST: KPIs with empty data ──
def test_strategic_kpis_empty():
    """Test KPIs endpoint handles empty data gracefully."""
    _mock_sb.table.side_effect = lambda name: make_chainable([])

    result = asyncio.run(dashboard_mod.get_strategic_kpis())

    assert result["ok"] is True
    kpis = result["kpis"]

    # All categories should exist with 4 metrics each
    for cat_key in ["client", "investor", "portfolio", "purchase"]:
        assert cat_key in kpis
        assert len(kpis[cat_key]["metrics"]) == 4

    # Specific zero/default values
    client_kpis = {m["key"]: m for m in kpis["client"]["metrics"]}
    assert client_kpis["onboarding_time"]["value"] == 0
    assert client_kpis["conversion_rate"]["value"] == 0
    assert client_kpis["kyc_compliance"]["value"] == 100.0  # no clients = 100%

    inv_kpis = {m["key"]: m for m in kpis["investor"]["metrics"]}
    assert inv_kpis["cost_of_capital"]["value"] == 0
    assert inv_kpis["investor_retention"]["value"] == 0

    portfolio_kpis = {m["key"]: m for m in kpis["portfolio"]["metrics"]}
    assert portfolio_kpis["collection_rate"]["value"] == 100.0  # no payments due = 100%
    assert portfolio_kpis["system_uptime"]["value"] == 99.9

    print("PASS test_strategic_kpis_empty")


# ── TEST: Customer Options for delivered contract ──
def test_customer_options_delivered():
    """Test customer options returns correct options for a delivered contract."""
    contract_data = {
        "id": "c1",
        "client_id": "cl1",
        "property_id": "p1",
        "status": "delivered",
        "purchase_price": "50000",
        "monthly_rent": "800",
        "term_months": 36,
        "down_payment": "15000",
        "start_date": (today - timedelta(days=365)).isoformat(),
        "end_date": today.isoformat(),
        "clients": {"id": "cl1", "name": "Juan Perez", "email": "juan@test.com", "phone": "555-1234", "status": "completed"},
        "properties": {"id": "p1", "address": "123 Main St", "city": "Houston", "status": "sold"},
    }

    payments_data = [
        {"id": f"pay{i}", "paid_amount": "800", "status": "paid"}
        for i in range(36)
    ]

    def mock_table(name):
        mock = make_chainable([])
        if name == "rto_contracts":
            mock.single.return_value.execute.return_value = make_result(contract_data)
        elif name == "rto_payments":
            mock = make_chainable(payments_data)
        return mock

    _mock_sb.table.side_effect = mock_table

    result = asyncio.run(contracts_mod.get_customer_options("c1"))

    assert result["ok"] is True
    assert result["is_eligible"] is True
    assert result["contract_status"] == "delivered"

    # Financial summary
    fs = result["financial_summary"]
    assert fs["purchase_price"] == 50000.0
    assert fs["down_payment"] == 15000.0
    assert fs["total_rent_paid"] == 28800.0  # 36 * 800
    assert fs["total_paid"] == 43800.0  # 28800 + 15000

    # Options
    assert len(result["options"]) == 2

    repurchase = result["options"][0]
    assert repurchase["key"] == "repurchase"
    assert repurchase["discount_pct"] == 5
    assert repurchase["estimated_discount"] == 2500.0  # 5% of 50000
    assert repurchase["available"] is True

    upgrade = result["options"][1]
    assert upgrade["key"] == "upgrade"
    assert upgrade["credit_pct"] == 20
    assert upgrade["credit_amount"] == 8760.0  # 20% of 43800
    assert upgrade["available"] is True

    # Loyalty programs
    lp = result["loyalty_programs"]
    assert lp["title"] == "Programas de Lealtad"
    assert len(lp["programs"]) == 3

    referral = lp["programs"][0]
    assert referral["key"] == "referral_bonus"
    assert referral["min_bonus"] == 500
    assert referral["max_bonus"] == 1000

    print("PASS test_customer_options_delivered")


# ── TEST: Customer Options for active contract (not eligible) ──
def test_customer_options_active_not_eligible():
    """Test customer options returns not eligible for active contracts."""
    contract_data = {
        "id": "c2",
        "client_id": "cl2",
        "property_id": "p2",
        "status": "active",
        "purchase_price": "40000",
        "monthly_rent": "700",
        "term_months": 24,
        "down_payment": "12000",
        "start_date": (today - timedelta(days=100)).isoformat(),
        "end_date": (today + timedelta(days=265)).isoformat(),
        "clients": {"id": "cl2", "name": "Maria Lopez", "email": "maria@test.com", "phone": "555-5678", "status": "rto_active"},
        "properties": {"id": "p2", "address": "456 Oak Ave", "city": "Dallas", "status": "sold"},
    }

    def mock_table(name):
        mock = make_chainable([])
        if name == "rto_contracts":
            mock.single.return_value.execute.return_value = make_result(contract_data)
        elif name == "rto_payments":
            mock = make_chainable([{"id": "p1", "paid_amount": "700", "status": "paid"}])
        return mock

    _mock_sb.table.side_effect = mock_table

    result = asyncio.run(contracts_mod.get_customer_options("c2"))

    assert result["ok"] is True
    assert result["is_eligible"] is False
    assert result["contract_status"] == "active"

    # Options should exist but not be available
    for opt in result["options"]:
        assert opt["available"] is False

    print("PASS test_customer_options_active_not_eligible")


# ── TEST: KPI status thresholds ──
def test_kpi_status_thresholds():
    """Test that KPI status (on_target/warning/off_target) is assigned correctly."""
    # Setup data to test specific thresholds
    applications = [
        {"id": f"a{i}", "status": "approved", "created_at": (today - timedelta(days=2)).isoformat()}
        for i in range(7)
    ] + [
        {"id": f"r{i}", "status": "rejected", "created_at": (today - timedelta(days=2)).isoformat()}
        for i in range(3)
    ]
    # 7/10 = 70% conversion → on_target (>= 70)

    _mock_sb.table.side_effect = lambda name: make_chainable(
        applications if name == "rto_applications" else []
    )

    result = asyncio.run(dashboard_mod.get_strategic_kpis())
    assert result["ok"] is True

    client_kpis = {m["key"]: m for m in result["kpis"]["client"]["metrics"]}
    assert client_kpis["conversion_rate"]["value"] == 70.0
    assert client_kpis["conversion_rate"]["status"] == "on_target"

    print("PASS test_kpi_status_thresholds")


# ── Run all tests ──
if __name__ == "__main__":
    test_strategic_kpis_with_data()
    test_strategic_kpis_empty()
    test_customer_options_delivered()
    test_customer_options_active_not_eligible()
    test_kpi_status_thresholds()
    print("\n✅ All KPI & Customer Options tests passed!")
