"""
Tests for the commission payments system.

Tests cover:
1. Commission calculation logic
2. Commission payment auto-creation on sale
3. Mark commission as paid + accounting integration
4. Employee management (create, activate/deactivate)
"""

import pytest
from decimal import Decimal
from api.utils.commissions import calculate_commission, COMMISSION_CASH, COMMISSION_RTO, SPLIT_RATIO


# ============================================================================
# Commission Calculation Tests
# ============================================================================

class TestCalculateCommission:
    """Test the core commission calculation logic."""

    def test_cash_sale_single_employee(self):
        """Same person finds and sells → 100% of $1,500."""
        result = calculate_commission("contado", "emp1", "emp1")
        assert result["commission_amount"] == COMMISSION_CASH
        assert result["commission_found_by"] == COMMISSION_CASH
        assert result["commission_sold_by"] == Decimal("0")

    def test_cash_sale_two_employees(self):
        """Different people → 50/50 of $1,500."""
        result = calculate_commission("contado", "emp1", "emp2")
        assert result["commission_amount"] == COMMISSION_CASH
        assert result["commission_found_by"] == Decimal("750.00")
        assert result["commission_sold_by"] == Decimal("750.00")

    def test_rto_sale_single_employee(self):
        """Same person finds and sells RTO → 100% of $1,000."""
        result = calculate_commission("rto", "emp1", "emp1")
        assert result["commission_amount"] == COMMISSION_RTO
        assert result["commission_found_by"] == COMMISSION_RTO
        assert result["commission_sold_by"] == Decimal("0")

    def test_rto_sale_two_employees(self):
        """Different people RTO → 50/50 of $1,000."""
        result = calculate_commission("rto", "emp1", "emp2")
        assert result["commission_amount"] == COMMISSION_RTO
        assert result["commission_found_by"] == Decimal("500.00")
        assert result["commission_sold_by"] == Decimal("500.00")

    def test_only_found_by(self):
        """Only found_by assigned → 100% to found_by."""
        result = calculate_commission("contado", "emp1", None)
        assert result["commission_found_by"] == COMMISSION_CASH
        assert result["commission_sold_by"] == Decimal("0")

    def test_only_sold_by(self):
        """Only sold_by assigned → 100% to sold_by."""
        result = calculate_commission("contado", None, "emp2")
        assert result["commission_found_by"] == Decimal("0")
        assert result["commission_sold_by"] == COMMISSION_CASH

    def test_no_employees(self):
        """No employees → total still calculated, but $0 to each."""
        result = calculate_commission("contado", None, None)
        assert result["commission_amount"] == COMMISSION_CASH
        assert result["commission_found_by"] == Decimal("0")
        assert result["commission_sold_by"] == Decimal("0")

    def test_unknown_sale_type(self):
        """Unknown sale type → $0 commission."""
        result = calculate_commission("unknown", "emp1", "emp2")
        assert result["commission_amount"] == Decimal("0")

    def test_cash_alias(self):
        """'cash' should work same as 'contado'."""
        result = calculate_commission("cash", "emp1", "emp1")
        assert result["commission_amount"] == COMMISSION_CASH

    def test_rent_to_own_alias(self):
        """'rent_to_own' should work same as 'rto'."""
        result = calculate_commission("rent_to_own", "emp1", "emp1")
        assert result["commission_amount"] == COMMISSION_RTO
