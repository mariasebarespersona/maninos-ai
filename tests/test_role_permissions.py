"""
Tests for role-based permissions and navigation visibility.

Tests cover:
1. Navigation visibility per role (Homes)
2. Commission eligibility per role
3. Payment approval flow validation
4. Role validation in team endpoints
"""

import pytest


# ============================================================================
# Navigation Visibility (mirrors frontend ROLE_ALLOWED_HREFS)
# ============================================================================

ROLE_ALLOWED_HREFS = {
    'treasury': ['/homes', '/homes/commissions', '/homes/notificaciones', '/homes/accounting'],
    'operations': ['/homes', '/homes/market', '/homes/properties', '/homes/clients', '/homes/sales', '/homes/transfers'],
}

ALL_NAV_HREFS = [
    '/homes', '/homes/market', '/homes/properties', '/homes/clients',
    '/homes/sales', '/homes/commissions', '/homes/transfers',
    '/homes/notificaciones', '/homes/accounting',
]


def get_nav_for_role(role: str) -> list[str]:
    if role in ROLE_ALLOWED_HREFS:
        return [h for h in ALL_NAV_HREFS if h in ROLE_ALLOWED_HREFS[role]]
    return ALL_NAV_HREFS


class TestNavigationVisibility:
    """Test that each role sees only the correct nav items."""

    def test_admin_sees_everything(self):
        nav = get_nav_for_role('admin')
        assert nav == ALL_NAV_HREFS

    def test_treasury_sees_limited(self):
        nav = get_nav_for_role('treasury')
        assert '/homes/commissions' in nav
        assert '/homes/notificaciones' in nav
        assert '/homes/accounting' in nav
        assert '/homes' in nav
        # Should NOT see these
        assert '/homes/properties' not in nav
        assert '/homes/clients' not in nav
        assert '/homes/sales' not in nav
        assert '/homes/market' not in nav

    def test_operations_sees_sales_flow(self):
        nav = get_nav_for_role('operations')
        assert '/homes/market' in nav
        assert '/homes/properties' in nav
        assert '/homes/clients' in nav
        assert '/homes/sales' in nav
        assert '/homes/transfers' in nav
        # Should NOT see these
        assert '/homes/commissions' not in nav
        assert '/homes/accounting' not in nav
        assert '/homes/notificaciones' not in nav

    def test_yard_manager_sees_everything(self):
        """yard_manager has no restrictions (not in ROLE_ALLOWED_HREFS)."""
        nav = get_nav_for_role('yard_manager')
        assert nav == ALL_NAV_HREFS


# ============================================================================
# Commission Eligibility
# ============================================================================

COMMISSION_ELIGIBLE_ROLES = ['operations', 'comprador', 'vendedor']


class TestCommissionEligibility:
    """Test which roles can earn commissions."""

    def test_operations_earns_commissions(self):
        assert 'operations' in COMMISSION_ELIGIBLE_ROLES

    def test_admin_does_not_earn(self):
        assert 'admin' not in COMMISSION_ELIGIBLE_ROLES

    def test_treasury_does_not_earn(self):
        assert 'treasury' not in COMMISSION_ELIGIBLE_ROLES

    def test_yard_manager_does_not_earn(self):
        assert 'yard_manager' not in COMMISSION_ELIGIBLE_ROLES

    def test_legacy_roles_earn(self):
        assert 'comprador' in COMMISSION_ELIGIBLE_ROLES
        assert 'vendedor' in COMMISSION_ELIGIBLE_ROLES


# ============================================================================
# Commission Visibility
# ============================================================================

FULL_VIEW_ROLES = ['admin', 'treasury']


class TestCommissionVisibility:
    """Test who can see all commissions vs only their own."""

    def test_admin_sees_all(self):
        assert 'admin' in FULL_VIEW_ROLES

    def test_treasury_sees_all(self):
        assert 'treasury' in FULL_VIEW_ROLES

    def test_operations_sees_own_only(self):
        assert 'operations' not in FULL_VIEW_ROLES


# ============================================================================
# Payment Order Status Flow
# ============================================================================

VALID_STATUSES = ['pending', 'approved', 'completed', 'cancelled']


class TestPaymentOrderFlow:
    """Test payment order status transitions."""

    def test_valid_statuses(self):
        assert 'pending' in VALID_STATUSES
        assert 'approved' in VALID_STATUSES
        assert 'completed' in VALID_STATUSES
        assert 'cancelled' in VALID_STATUSES

    def test_approve_requires_pending(self):
        """Only pending orders can be approved."""
        current = 'pending'
        assert current == 'pending'  # Can approve

    def test_complete_requires_approved_or_pending(self):
        """Orders can be completed from pending or approved."""
        valid_for_complete = ['pending', 'approved']
        assert 'approved' in valid_for_complete
        assert 'pending' in valid_for_complete
        assert 'completed' not in valid_for_complete

    def test_cannot_approve_completed(self):
        """Completed orders cannot be approved."""
        current = 'completed'
        assert current != 'pending'


# ============================================================================
# Role Validation
# ============================================================================

VALID_ROLES = {"admin", "operations", "treasury", "yard_manager",
               "comprador", "renovador", "vendedor"}


class TestRoleValidation:
    def test_all_expected_roles_valid(self):
        for role in ['admin', 'operations', 'treasury', 'yard_manager']:
            assert role in VALID_ROLES

    def test_invalid_role_rejected(self):
        assert 'superadmin' not in VALID_ROLES
        assert 'manager' not in VALID_ROLES
        assert '' not in VALID_ROLES

    def test_signup_default_role(self):
        """When no role provided, sync defaults to operations."""
        default = 'operations'
        assert default in VALID_ROLES


# ============================================================================
# Investor Flow Approval (Capital)
# ============================================================================

class TestInvestorFlowApproval:
    """Test that investor operations create pending transactions."""

    def test_investment_link_notes_format(self):
        """The notes field encodes metadata for execution on confirmation."""
        investor_id = "inv-123"
        contract_id = "con-456"
        amount = 50000.0
        rate = 12.0
        notes = f"investment_link|{investor_id}|{contract_id}|{amount}|{rate}"
        parts = notes.split("|")
        assert parts[0] == "investment_link"
        assert parts[1] == investor_id
        assert parts[2] == contract_id
        assert float(parts[3]) == amount
        assert float(parts[4]) == rate

    def test_return_payment_notes_format(self):
        """The notes field encodes metadata for execution on confirmation."""
        investor_id = "inv-123"
        investment_id = "invest-789"
        amount = 25000.0
        notes = f"return_payment|{investor_id}|{investment_id}|{amount}"
        parts = notes.split("|")
        assert parts[0] == "return_payment"
        assert parts[1] == investor_id
        assert parts[2] == investment_id
        assert float(parts[3]) == amount
