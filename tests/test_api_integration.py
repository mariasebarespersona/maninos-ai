"""
Integration tests for API endpoints using FastAPI TestClient.
Mocks Supabase via conftest.py to test endpoint logic without a real database.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


# ============================================================================
# Chainable mock for Supabase query builder
# ============================================================================

class MockQueryBuilder:
    """Simulates Supabase PostgREST chainable API."""

    def __init__(self, data=None, count=0):
        self._data = data if data is not None else []
        self._count = count

    def select(self, *a, **kw): return self
    def insert(self, data):
        if isinstance(data, list):
            self._data = [{"id": f"mock-{i}", **d} for i, d in enumerate(data)]
        else:
            self._data = [{"id": "mock-001", **data}]
        return self
    def update(self, data):
        self._data = [{"id": "mock-001", **data}]
        return self
    def delete(self): return self
    def eq(self, *a): return self
    def neq(self, *a): return self
    def in_(self, *a): return self
    def like(self, *a): return self
    def is_(self, *a): return self
    def gte(self, *a): return self
    def lt(self, *a): return self
    def lte(self, *a): return self
    def order(self, *a, **kw): return self
    def limit(self, *a): return self
    def range(self, *a): return self
    def single(self): return self

    def execute(self):
        result = MagicMock()
        result.data = self._data
        result.count = self._count
        return result


def _mock_table(name):
    return MockQueryBuilder()


# ============================================================================
# Setup: patch sb.table and import app
# ============================================================================

with patch("tools.supabase_client.sb") as mock_sb:
    mock_sb.table = _mock_table

    with patch("api.services.scheduler_service.init_scheduler"), \
         patch("api.services.scheduler_service.shutdown_scheduler"):
        from api.main import app

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def patch_sb():
    with patch("tools.supabase_client.sb") as sb:
        sb.table = _mock_table
        yield sb


# ============================================================================
# HEALTH CHECK
# ============================================================================

class TestHealthCheck:
    def test_health_returns_200(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] in ("healthy", "ok")


# ============================================================================
# TEAM ENDPOINTS
# ============================================================================

class TestTeamEndpoints:
    def test_list_users_returns_ok(self):
        res = client.get("/api/team/users")
        assert res.status_code == 200
        assert "users" in res.json()

    def test_create_employee_validates_required_fields(self):
        # Missing name
        res = client.post("/api/team/users", json={"email": "t@t.com"})
        assert res.status_code == 422

    def test_create_employee_rejects_invalid_role(self):
        res = client.post("/api/team/users", json={
            "name": "Test", "email": "t@t.com", "role": "superadmin"
        })
        assert res.status_code == 400

    def test_sync_user_creates_or_returns(self):
        res = client.post("/api/team/users/sync", json={
            "auth_id": "auth-123", "email": "t@t.com", "name": "Test", "role": "operations"
        })
        assert res.status_code == 200
        assert res.json()["ok"] is True

    def test_list_users_with_include_inactive(self):
        res = client.get("/api/team/users?include_inactive=true")
        assert res.status_code == 200


# ============================================================================
# PAYMENT ORDERS
# ============================================================================

class TestPaymentOrders:
    def test_list_returns_ok(self):
        res = client.get("/api/payment-orders")
        assert res.status_code == 200
        assert res.json()["ok"] is True

    def test_filter_by_status(self):
        for status in ["pending", "approved", "completed"]:
            res = client.get(f"/api/payment-orders?status={status}")
            assert res.status_code == 200

    def test_create_validates_payee_name(self):
        res = client.post("/api/payment-orders", json={
            "property_id": "p-1", "amount": 25000
        })
        assert res.status_code == 422  # payee_name required

    def test_create_success(self):
        res = client.post("/api/payment-orders", json={
            "property_id": "p-1",
            "payee_name": "Vendor",
            "amount": 25000,
        })
        assert res.status_code == 200
        assert res.json()["ok"] is True

    def test_stats_endpoint(self):
        res = client.get("/api/payment-orders/stats")
        assert res.status_code == 200
        assert "data" in res.json()


# ============================================================================
# COMMISSION PAYMENTS (route ordering test)
# ============================================================================

class TestCommissionPayments:
    def test_list_not_captured_by_sale_id_route(self):
        """Regression: /commission-payments was once matched as /{sale_id}."""
        res = client.get("/api/sales/commission-payments")
        assert res.status_code == 200
        data = res.json()
        assert "ok" in data
        assert "payments" in data

    def test_list_with_month_filter(self):
        res = client.get("/api/sales/commission-payments?month=3&year=2026")
        assert res.status_code == 200

    def test_list_with_employee_filter(self):
        res = client.get("/api/sales/commission-payments?employee_id=emp-123")
        assert res.status_code == 200

    def test_commission_report_not_captured_by_sale_id(self):
        res = client.get("/api/sales/commissions/report?month=3&year=2026")
        assert res.status_code == 200
        data = res.json()
        assert "employees" in data


# ============================================================================
# SALES TRANSFERS
# ============================================================================

class TestSalesTransfers:
    def test_pending_transfers(self):
        res = client.get("/api/sales/pending-transfers")
        assert res.status_code == 200

    def test_confirmed_transfers(self):
        res = client.get("/api/sales/confirmed-transfers")
        assert res.status_code == 200


# ============================================================================
# CAPITAL ENDPOINTS
# ============================================================================

class TestCapitalPayments:
    def test_client_reported(self):
        res = client.get("/api/capital/payments/client-reported")
        assert res.status_code == 200

    def test_dp_client_reported(self):
        res = client.get("/api/capital/payments/down-payment/client-reported")
        assert res.status_code == 200

    def test_pending_confirmations(self):
        res = client.get("/api/capital/payments/pending-confirmations")
        assert res.status_code == 200


class TestCapitalFlows:
    def test_list_flows(self):
        res = client.get("/api/capital/flows")
        assert res.status_code == 200

    def test_flow_summary(self):
        res = client.get("/api/capital/flows/summary")
        assert res.status_code == 200

    def test_record_flow_validates_type(self):
        res = client.post("/api/capital/flows/record", json={
            "flow_type": "invalid_type", "amount": 1000
        })
        assert res.status_code == 400


# ============================================================================
# SCHEMA VALIDATION (Pydantic)
# ============================================================================

class TestSchemaValidation:
    def test_payment_order_schema(self):
        """Verify the create schema requires amount and payee_name."""
        from api.routes.payment_orders import PaymentOrderCreate
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            PaymentOrderCreate(property_id="p1")  # missing payee_name, amount

        # Valid
        order = PaymentOrderCreate(
            property_id="p1", payee_name="Vendor", amount=1000
        )
        assert order.amount == 1000
        assert order.method == "transferencia"  # default

    def test_commission_calculation_schema(self):
        """Verify commission utility returns correct types."""
        from api.utils.commissions import calculate_commission
        from decimal import Decimal

        result = calculate_commission("contado", "emp1", "emp2")
        assert isinstance(result["commission_amount"], Decimal)
        assert isinstance(result["commission_found_by"], Decimal)
