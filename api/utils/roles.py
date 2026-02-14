"""
Role-Based Access Control utility.

Roles (Feb 2026 — Maninos D1):
  admin          Full access to all portals
  operations     Buying team: search, buy, renovate, sell
  treasury       Payments, accounting, commissions
  yard_manager   Manages specific yards, property inventory

Permission matrix:
  Route group              | admin | operations | treasury | yard_manager
  ─────────────────────────┼───────┼────────────┼──────────┼─────────────
  Market listings / scrape  | ✓     | ✓          |          | ✓
  Properties CRUD           | ✓     | ✓          |          | ✓ (own yard)
  Sales (create/close)      | ✓     | ✓          | ✓        |
  Payments (Stripe/manual)  | ✓     |            | ✓        |
  Capital (RTO analysis)    | ✓     |            | ✓        |
  Commissions report        | ✓     |            | ✓        |
  Team management           | ✓     |            |          |
  Yards management          | ✓     |            |          | ✓
"""

from typing import Set

# Permissions per role
ROLE_PERMISSIONS: dict[str, Set[str]] = {
    "admin": {
        "market", "properties", "sales", "payments",
        "capital", "commissions", "team", "yards",
        "documents", "emails", "agents", "ai",
    },
    "operations": {
        "market", "properties", "sales", "yards",
        "documents", "agents",
    },
    "treasury": {
        "sales", "payments", "capital", "commissions",
        "documents", "emails",
    },
    "yard_manager": {
        "market", "properties", "yards",
        "documents",
    },
    # Legacy mappings
    "comprador": {"market", "properties"},
    "renovador": {"properties"},
    "vendedor": {"properties", "sales"},
}


def has_permission(role: str, permission: str) -> bool:
    """Check if a role has a specific permission."""
    return permission in ROLE_PERMISSIONS.get(role, set())


def get_allowed_roles(permission: str) -> list[str]:
    """Get all roles that have a specific permission."""
    return [r for r, perms in ROLE_PERMISSIONS.items() if permission in perms]


def check_role(user_role: str, required_permission: str) -> tuple[bool, str]:
    """
    Check if user role has the required permission.

    Returns: (allowed, error_message)
    """
    if has_permission(user_role, required_permission):
        return True, ""

    allowed_roles = get_allowed_roles(required_permission)
    return False, (
        f"Acceso denegado. Tu rol '{user_role}' no tiene permiso '{required_permission}'. "
        f"Roles permitidos: {', '.join(allowed_roles)}"
    )

