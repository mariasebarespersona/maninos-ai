"""
Team Management API Routes — Roles, Yards & Assignments.

Roles (Feb 2026):
  admin          Full access to all portals
  operations     Buying team (search, buy, renovate, sell)
  treasury       Payments, accounting, commissions
  yard_manager   Manages specific yards, property inventory
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_ROLES = {"admin", "operations", "treasury", "yard_manager",
               "comprador", "renovador", "vendedor"}  # legacy kept


# ============================================================================
# SCHEMAS
# ============================================================================

class YardCreate(BaseModel):
    name: str
    address: Optional[str] = None
    city: str = "Houston"
    state: str = "TX"
    capacity: int = 50
    notes: Optional[str] = None


class YardUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    capacity: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class YardAssign(BaseModel):
    user_id: str
    yard_id: str
    is_primary: bool = False


class UserRoleUpdate(BaseModel):
    role: str
    department: Optional[str] = None


class UserSyncRequest(BaseModel):
    """Sync auth user → custom users table."""
    auth_id: str          # Supabase Auth UUID
    email: str
    name: Optional[str] = None


# ============================================================================
# USERS / ROLES
# ============================================================================

@router.get("/users")
async def list_team_users(
    role: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
):
    """List all team members with optional role filter."""
    query = sb.table("users").select("*")
    if role:
        query = query.eq("role", role)
    query = query.eq("is_active", True).order("name").limit(limit)
    result = query.execute()
    return {"ok": True, "users": result.data or []}


@router.post("/users/sync")
async def sync_auth_user(data: UserSyncRequest):
    """
    Ensure the currently authenticated user has a row in the custom users table.
    Called from the frontend on page load so commissions can reference employees.
    If the user already exists (by email), return them. Otherwise insert a new row.
    """
    # Check if user already exists by email
    existing = sb.table("users").select("*").eq("email", data.email).limit(1).execute()
    if existing.data and len(existing.data) > 0:
        user = existing.data[0]
        # Update name if it was missing
        if data.name and not user.get("name"):
            sb.table("users").update({"name": data.name}).eq("id", user["id"]).execute()
            user["name"] = data.name
        return {"ok": True, "user": user, "created": False}

    # Also check by auth_id (the UUID from Supabase Auth)
    try:
        existing_by_id = sb.table("users").select("*").eq("id", data.auth_id).limit(1).execute()
        if existing_by_id.data and len(existing_by_id.data) > 0:
            user = existing_by_id.data[0]
            return {"ok": True, "user": user, "created": False}
    except Exception:
        pass  # auth_id may not be a valid UUID format

    # Create new user — use the auth_id as the id so they match
    new_user = {
        "id": data.auth_id,
        "email": data.email,
        "name": data.name or data.email.split("@")[0],
        "role": "admin",   # default for first user; can be changed later
        "is_active": True,
    }
    try:
        result = sb.table("users").insert(new_user).execute()
        if result.data:
            logger.info(f"[Team] Synced new user: {data.email}")
            return {"ok": True, "user": result.data[0], "created": True}
    except Exception as e:
        logger.error(f"[Team] Sync error: {e}")
        raise HTTPException(status_code=500, detail=f"Error syncing user: {e}")

    raise HTTPException(status_code=500, detail="Could not sync user")


@router.patch("/users/{user_id}/role")
async def update_user_role(user_id: str, data: UserRoleUpdate):
    """Change a user's role."""
    if data.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Rol inválido: {data.role}")
    update = {"role": data.role}
    if data.department is not None:
        update["department"] = data.department
    result = sb.table("users").update(update).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True, "user": result.data[0]}


# ============================================================================
# YARDS
# ============================================================================

@router.get("/yards")
async def list_yards(active_only: bool = Query(True)):
    """List all yards."""
    query = sb.table("yards").select("*")
    if active_only:
        query = query.eq("is_active", True)
    result = query.order("name").execute()

    # Add property count and assigned users for each yard
    yards = result.data or []
    for yard in yards:
        # Count properties in this yard
        try:
            props = sb.table("properties").select("id", count="exact") \
                .eq("yard_id", yard["id"]).execute()
            yard["property_count"] = len(props.data) if props.data else 0
        except Exception:
            yard["property_count"] = 0

        # Get assigned users
        try:
            assigns = sb.table("yard_assignments") \
                .select("*, users(id, name, role)") \
                .eq("yard_id", yard["id"]).execute()
            yard["assigned_users"] = assigns.data or []
        except Exception:
            yard["assigned_users"] = []

    return {"ok": True, "yards": yards}


@router.post("/yards")
async def create_yard(data: YardCreate):
    """Create a new yard."""
    result = sb.table("yards").insert(data.model_dump()).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creando yard")
    return {"ok": True, "yard": result.data[0]}


@router.patch("/yards/{yard_id}")
async def update_yard(yard_id: str, data: YardUpdate):
    """Update yard details."""
    update = data.model_dump(exclude_none=True)
    if not update:
        raise HTTPException(status_code=400, detail="No data to update")
    result = sb.table("yards").update(update).eq("id", yard_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Yard no encontrado")
    return {"ok": True, "yard": result.data[0]}


@router.delete("/yards/{yard_id}")
async def delete_yard(yard_id: str):
    """Deactivate a yard (soft delete)."""
    result = sb.table("yards").update({"is_active": False}).eq("id", yard_id).execute()
    return {"ok": True, "message": "Yard desactivado"}


# ============================================================================
# YARD ASSIGNMENTS
# ============================================================================

@router.post("/yards/assign")
async def assign_user_to_yard(data: YardAssign):
    """Assign a user to a yard."""
    try:
        result = sb.table("yard_assignments").insert({
            "user_id": data.user_id,
            "yard_id": data.yard_id,
            "is_primary": data.is_primary,
        }).execute()
        return {"ok": True, "assignment": result.data[0] if result.data else None}
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Usuario ya asignado a este yard")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/yards/assign/{assignment_id}")
async def unassign_user_from_yard(assignment_id: str):
    """Remove a user from a yard."""
    sb.table("yard_assignments").delete().eq("id", assignment_id).execute()
    return {"ok": True, "message": "Asignación eliminada"}


# ============================================================================
# ASSIGN PROPERTY TO YARD
# ============================================================================

@router.patch("/properties/{property_id}/yard")
async def assign_property_to_yard(property_id: str, yard_id: str = Query(...)):
    """Assign a property to a yard."""
    result = sb.table("properties").update({"yard_id": yard_id}) \
        .eq("id", property_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Propiedad no encontrada")
    return {"ok": True, "property": result.data[0]}

