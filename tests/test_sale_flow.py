"""
Tests for the sale creation -> commission auto-generation flow.

Covers:
1. Creating a sale with found_by + sold_by generates 2 commission_payments rows
2. Creating a sale with same person for both generates 1 commission_payment row
3. Creating a sale with no employees generates 0 commission_payments
4. Commission amounts are correct ($1,500 contado / $1,000 RTO, 50/50 split)
5. The _create_commission_payments helper works correctly with sale data
"""

from unittest.mock import patch, MagicMock
from decimal import Decimal

from api.utils.commissions import (
    calculate_commission,
    COMMISSION_CASH,
    COMMISSION_RTO,
    SPLIT_RATIO,
)


# ============================================================================
# _create_commission_payments helper tests (mocking Supabase)
# ============================================================================

def _build_chain_mock(return_data=None):
    """Build a fluent chain mock for sb.table(...).insert(...).execute()."""
    mock_sb = MagicMock()
    exec_result = MagicMock()
    exec_result.data = return_data or [{"id": "cp-1"}]
    mock_sb.table.return_value.insert.return_value.execute.return_value = exec_result
    return mock_sb


class TestCreateCommissionPaymentsTwoEmployees:
    """found_by != sold_by -> 2 commission_payments rows."""

    def test_two_rows_inserted_for_contado(self):
        mock_sb = _build_chain_mock()
        sale = {
            "id": "sale-1",
            "found_by_employee_id": "emp-A",
            "sold_by_employee_id": "emp-B",
            "commission_found_by": 750.0,
            "commission_sold_by": 750.0,
        }

        with patch("api.routes.sales.sb", mock_sb):
            from api.routes.sales import _create_commission_payments
            _create_commission_payments(sale)

        # Two insert calls on commission_payments
        calls = mock_sb.table.return_value.insert.call_args_list
        assert len(calls) == 2
        row0 = calls[0][0][0]
        row1 = calls[1][0][0]
        assert row0["employee_id"] == "emp-A"
        assert row0["role"] == "found_by"
        assert row0["amount"] == 750.0
        assert row1["employee_id"] == "emp-B"
        assert row1["role"] == "sold_by"
        assert row1["amount"] == 750.0

    def test_two_rows_inserted_for_rto(self):
        mock_sb = _build_chain_mock()
        sale = {
            "id": "sale-2",
            "found_by_employee_id": "emp-A",
            "sold_by_employee_id": "emp-B",
            "commission_found_by": 500.0,
            "commission_sold_by": 500.0,
        }

        with patch("api.routes.sales.sb", mock_sb):
            from api.routes.sales import _create_commission_payments
            _create_commission_payments(sale)

        calls = mock_sb.table.return_value.insert.call_args_list
        assert len(calls) == 2
        assert calls[0][0][0]["amount"] == 500.0
        assert calls[1][0][0]["amount"] == 500.0


class TestCreateCommissionPaymentsSamePerson:
    """found_by == sold_by -> 1 commission_payment row (found_by only)."""

    def test_one_row_when_same_person_contado(self):
        mock_sb = _build_chain_mock()
        sale = {
            "id": "sale-3",
            "found_by_employee_id": "emp-A",
            "sold_by_employee_id": "emp-A",
            "commission_found_by": 1500.0,
            "commission_sold_by": 0.0,
        }

        with patch("api.routes.sales.sb", mock_sb):
            from api.routes.sales import _create_commission_payments
            _create_commission_payments(sale)

        calls = mock_sb.table.return_value.insert.call_args_list
        assert len(calls) == 1
        row = calls[0][0][0]
        assert row["employee_id"] == "emp-A"
        assert row["role"] == "found_by"
        assert row["amount"] == 1500.0

    def test_one_row_when_same_person_rto(self):
        mock_sb = _build_chain_mock()
        sale = {
            "id": "sale-4",
            "found_by_employee_id": "emp-A",
            "sold_by_employee_id": "emp-A",
            "commission_found_by": 1000.0,
            "commission_sold_by": 0.0,
        }

        with patch("api.routes.sales.sb", mock_sb):
            from api.routes.sales import _create_commission_payments
            _create_commission_payments(sale)

        calls = mock_sb.table.return_value.insert.call_args_list
        assert len(calls) == 1
        assert calls[0][0][0]["amount"] == 1000.0


class TestCreateCommissionPaymentsNoEmployees:
    """No employees -> 0 commission_payments rows."""

    def test_zero_rows_when_no_employees(self):
        mock_sb = _build_chain_mock()
        sale = {
            "id": "sale-5",
            "found_by_employee_id": None,
            "sold_by_employee_id": None,
            "commission_found_by": 0.0,
            "commission_sold_by": 0.0,
        }

        with patch("api.routes.sales.sb", mock_sb):
            from api.routes.sales import _create_commission_payments
            _create_commission_payments(sale)

        calls = mock_sb.table.return_value.insert.call_args_list
        assert len(calls) == 0


class TestCommissionAmountsCorrect:
    """Verify commission amounts via calculate_commission utility."""

    def test_contado_total_is_1500(self):
        result = calculate_commission("contado", "emp1", "emp2")
        assert result["commission_amount"] == Decimal("1500.00")

    def test_rto_total_is_1000(self):
        result = calculate_commission("rto", "emp1", "emp2")
        assert result["commission_amount"] == Decimal("1000.00")

    def test_contado_5050_split(self):
        result = calculate_commission("contado", "emp1", "emp2")
        assert result["commission_found_by"] == Decimal("750.00")
        assert result["commission_sold_by"] == Decimal("750.00")

    def test_rto_5050_split(self):
        result = calculate_commission("rto", "emp1", "emp2")
        assert result["commission_found_by"] == Decimal("500.00")
        assert result["commission_sold_by"] == Decimal("500.00")

    def test_same_person_gets_full_contado(self):
        result = calculate_commission("contado", "emp1", "emp1")
        assert result["commission_found_by"] == Decimal("1500.00")
        assert result["commission_sold_by"] == Decimal("0")

    def test_same_person_gets_full_rto(self):
        result = calculate_commission("rto", "emp1", "emp1")
        assert result["commission_found_by"] == Decimal("1000.00")
        assert result["commission_sold_by"] == Decimal("0")


class TestCreateCommissionPaymentsIntegration:
    """End-to-end _create_commission_payments with realistic sale data."""

    def test_status_is_always_pending(self):
        mock_sb = _build_chain_mock()
        sale = {
            "id": "sale-6",
            "found_by_employee_id": "emp-A",
            "sold_by_employee_id": "emp-B",
            "commission_found_by": 750.0,
            "commission_sold_by": 750.0,
        }

        with patch("api.routes.sales.sb", mock_sb):
            from api.routes.sales import _create_commission_payments
            _create_commission_payments(sale)

        calls = mock_sb.table.return_value.insert.call_args_list
        for call in calls:
            row = call[0][0]
            assert row["status"] == "pending"

    def test_sale_id_is_propagated(self):
        mock_sb = _build_chain_mock()
        sale = {
            "id": "sale-99",
            "found_by_employee_id": "emp-A",
            "sold_by_employee_id": "emp-B",
            "commission_found_by": 750.0,
            "commission_sold_by": 750.0,
        }

        with patch("api.routes.sales.sb", mock_sb):
            from api.routes.sales import _create_commission_payments
            _create_commission_payments(sale)

        calls = mock_sb.table.return_value.insert.call_args_list
        for call in calls:
            row = call[0][0]
            assert row["sale_id"] == "sale-99"
