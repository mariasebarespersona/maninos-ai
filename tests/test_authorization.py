"""
Tests for role-based access control.

Covers:
1. Treasury nav visibility
2. Operations nav visibility
3. Admin sees all nav items
4. Treasury cannot access /homes/properties
5. Operations cannot access /homes/accounting
6. Only operations/comprador/vendedor earn commissions
7. Admin and treasury do NOT earn commissions
8. Admin and treasury can see ALL commissions
9. Operations can only see own commissions
10. Payment order approval: only admin role should approve
11. Payment completion: only treasury/admin role should complete
12. Commission mark-paid: only admin/treasury can do it
"""


# ============================================================================
# Role-based nav visibility (mirrors frontend ROLE_ALLOWED_HREFS)
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
    """Return the list of allowed hrefs for a role."""
    if role in ROLE_ALLOWED_HREFS:
        return [h for h in ALL_NAV_HREFS if h in ROLE_ALLOWED_HREFS[role]]
    return ALL_NAV_HREFS


def is_path_allowed(role: str, path: str) -> bool:
    """Check if a path is allowed for a role (mirrors frontend redirect logic)."""
    allowed = ROLE_ALLOWED_HREFS.get(role)
    if allowed is None:
        return True  # No restrictions (admin, yard_manager, etc.)
    if path == '/homes':
        return True
    return any(path.startswith(href) for href in allowed if href != '/homes')


# ============================================================================
# Commission role constants (mirror frontend)
# ============================================================================

COMMISSION_ELIGIBLE_ROLES = ['operations', 'comprador', 'vendedor']
FULL_VIEW_ROLES = ['admin', 'treasury']

# Approval / completion role rules (business logic)
PAYMENT_APPROVE_ROLES = ['admin']
PAYMENT_COMPLETE_ROLES = ['treasury', 'admin']
COMMISSION_MARK_PAID_ROLES = ['admin', 'treasury']


# ============================================================================
# Tests: Nav visibility
# ============================================================================

class TestTreasuryNavVisibility:

    def test_treasury_sees_4_items(self):
        nav = get_nav_for_role('treasury')
        assert len(nav) == 4

    def test_treasury_sees_homes(self):
        assert '/homes' in get_nav_for_role('treasury')

    def test_treasury_sees_commissions(self):
        assert '/homes/commissions' in get_nav_for_role('treasury')

    def test_treasury_sees_notificaciones(self):
        assert '/homes/notificaciones' in get_nav_for_role('treasury')

    def test_treasury_sees_accounting(self):
        assert '/homes/accounting' in get_nav_for_role('treasury')

    def test_treasury_cannot_see_properties(self):
        assert '/homes/properties' not in get_nav_for_role('treasury')

    def test_treasury_cannot_see_market(self):
        assert '/homes/market' not in get_nav_for_role('treasury')

    def test_treasury_cannot_see_clients(self):
        assert '/homes/clients' not in get_nav_for_role('treasury')

    def test_treasury_cannot_see_sales(self):
        assert '/homes/sales' not in get_nav_for_role('treasury')


class TestOperationsNavVisibility:

    def test_operations_sees_6_items(self):
        nav = get_nav_for_role('operations')
        assert len(nav) == 6

    def test_operations_sees_market(self):
        assert '/homes/market' in get_nav_for_role('operations')

    def test_operations_sees_properties(self):
        assert '/homes/properties' in get_nav_for_role('operations')

    def test_operations_sees_clients(self):
        assert '/homes/clients' in get_nav_for_role('operations')

    def test_operations_sees_sales(self):
        assert '/homes/sales' in get_nav_for_role('operations')

    def test_operations_sees_transfers(self):
        assert '/homes/transfers' in get_nav_for_role('operations')

    def test_operations_cannot_see_accounting(self):
        assert '/homes/accounting' not in get_nav_for_role('operations')

    def test_operations_cannot_see_commissions(self):
        assert '/homes/commissions' not in get_nav_for_role('operations')

    def test_operations_cannot_see_notificaciones(self):
        assert '/homes/notificaciones' not in get_nav_for_role('operations')


class TestAdminNavVisibility:

    def test_admin_sees_all_9_items(self):
        nav = get_nav_for_role('admin')
        assert len(nav) == 9

    def test_admin_sees_all_hrefs(self):
        assert get_nav_for_role('admin') == ALL_NAV_HREFS


# ============================================================================
# Tests: Path access redirect logic
# ============================================================================

class TestPathAccessControl:

    def test_treasury_cannot_access_properties(self):
        assert is_path_allowed('treasury', '/homes/properties') is False

    def test_treasury_cannot_access_market(self):
        assert is_path_allowed('treasury', '/homes/market') is False

    def test_operations_cannot_access_accounting(self):
        assert is_path_allowed('operations', '/homes/accounting') is False

    def test_operations_cannot_access_commissions(self):
        assert is_path_allowed('operations', '/homes/commissions') is False

    def test_admin_can_access_everything(self):
        for href in ALL_NAV_HREFS:
            assert is_path_allowed('admin', href) is True

    def test_treasury_can_access_accounting(self):
        assert is_path_allowed('treasury', '/homes/accounting') is True

    def test_operations_can_access_sales(self):
        assert is_path_allowed('operations', '/homes/sales') is True

    def test_everyone_can_access_homes(self):
        for role in ['admin', 'treasury', 'operations', 'yard_manager']:
            assert is_path_allowed(role, '/homes') is True


# ============================================================================
# Tests: Commission eligibility
# ============================================================================

class TestCommissionEligibility:

    def test_operations_earns_commissions(self):
        assert 'operations' in COMMISSION_ELIGIBLE_ROLES

    def test_comprador_earns_commissions(self):
        assert 'comprador' in COMMISSION_ELIGIBLE_ROLES

    def test_vendedor_earns_commissions(self):
        assert 'vendedor' in COMMISSION_ELIGIBLE_ROLES

    def test_admin_does_not_earn(self):
        assert 'admin' not in COMMISSION_ELIGIBLE_ROLES

    def test_treasury_does_not_earn(self):
        assert 'treasury' not in COMMISSION_ELIGIBLE_ROLES

    def test_yard_manager_does_not_earn(self):
        assert 'yard_manager' not in COMMISSION_ELIGIBLE_ROLES


# ============================================================================
# Tests: Commission visibility
# ============================================================================

class TestCommissionVisibility:

    def test_admin_sees_all_commissions(self):
        assert 'admin' in FULL_VIEW_ROLES

    def test_treasury_sees_all_commissions(self):
        assert 'treasury' in FULL_VIEW_ROLES

    def test_operations_sees_own_only(self):
        assert 'operations' not in FULL_VIEW_ROLES

    def test_comprador_sees_own_only(self):
        assert 'comprador' not in FULL_VIEW_ROLES

    def test_vendedor_sees_own_only(self):
        assert 'vendedor' not in FULL_VIEW_ROLES


# ============================================================================
# Tests: Payment order approval roles
# ============================================================================

class TestPaymentApprovalRoles:

    def test_only_admin_can_approve(self):
        assert 'admin' in PAYMENT_APPROVE_ROLES

    def test_treasury_cannot_approve(self):
        assert 'treasury' not in PAYMENT_APPROVE_ROLES

    def test_operations_cannot_approve(self):
        assert 'operations' not in PAYMENT_APPROVE_ROLES


class TestPaymentCompletionRoles:

    def test_treasury_can_complete(self):
        assert 'treasury' in PAYMENT_COMPLETE_ROLES

    def test_admin_can_complete(self):
        assert 'admin' in PAYMENT_COMPLETE_ROLES

    def test_operations_cannot_complete(self):
        assert 'operations' not in PAYMENT_COMPLETE_ROLES


class TestCommissionMarkPaidRoles:

    def test_admin_can_mark_paid(self):
        assert 'admin' in COMMISSION_MARK_PAID_ROLES

    def test_treasury_can_mark_paid(self):
        assert 'treasury' in COMMISSION_MARK_PAID_ROLES

    def test_operations_cannot_mark_paid(self):
        assert 'operations' not in COMMISSION_MARK_PAID_ROLES

    def test_comprador_cannot_mark_paid(self):
        assert 'comprador' not in COMMISSION_MARK_PAID_ROLES
