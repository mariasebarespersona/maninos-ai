"""
Moves (Movida) Routes — Track transport/relocation of mobile homes.

Each property can have one or more moves:
  - purchase: from seller location to a Maninos yard
  - sale: from Maninos yard to buyer location
  - yard_transfer: between Maninos yards

Endpoints:
1. GET    /                           → List all moves (with filters)
2. GET    /property/{property_id}     → Moves for a specific property
3. GET    /{move_id}                  → Single move details
4. POST   /                           → Create a new move
5. PATCH  /{move_id}                  → Update move
6. PATCH  /{move_id}/status           → Update move status
7. DELETE /{move_id}                  → Delete a move
8. GET    /summary/stats              → Summary stats (active, upcoming, costs)
"""

import logging
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# SCHEMAS
# ============================================================================

class MoveCreate(BaseModel):
    property_id: str
    move_type: str = "purchase"  # purchase | sale | yard_transfer
    origin_address: Optional[str] = None
    origin_city: Optional[str] = None
    destination_address: Optional[str] = None
    destination_city: Optional[str] = None
    destination_yard: Optional[str] = None  # conroe | houston | dallas
    moving_company: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    estimated_distance_miles: Optional[float] = None
    requires_escort: bool = False
    requires_wide_load_permit: bool = False
    permit_number: Optional[str] = None
    scheduled_date: Optional[str] = None
    quoted_cost: Optional[float] = 0
    deposit_paid: Optional[float] = 0
    notes: Optional[str] = ""
    special_instructions: Optional[str] = ""


class MoveUpdate(BaseModel):
    origin_address: Optional[str] = None
    origin_city: Optional[str] = None
    destination_address: Optional[str] = None
    destination_city: Optional[str] = None
    destination_yard: Optional[str] = None
    moving_company: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    estimated_distance_miles: Optional[float] = None
    requires_escort: Optional[bool] = None
    requires_wide_load_permit: Optional[bool] = None
    permit_number: Optional[str] = None
    scheduled_date: Optional[str] = None
    quoted_cost: Optional[float] = None
    final_cost: Optional[float] = None
    deposit_paid: Optional[float] = None
    payment_status: Optional[str] = None
    notes: Optional[str] = None
    special_instructions: Optional[str] = None


class MoveStatusUpdate(BaseModel):
    status: str  # pending | scheduled | in_transit | completed | cancelled
    actual_pickup_date: Optional[str] = None
    actual_delivery_date: Optional[str] = None
    final_cost: Optional[float] = None
    notes: Optional[str] = None


# ============================================================================
# VALID TRANSITIONS
# ============================================================================

VALID_STATUS_TRANSITIONS = {
    "pending": ["scheduled", "cancelled"],
    "scheduled": ["in_transit", "cancelled", "pending"],
    "in_transit": ["completed", "cancelled"],
    "completed": [],  # final
    "cancelled": ["pending"],  # can reactivate
}


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/summary/stats")
async def get_move_stats():
    """Summary statistics for moves dashboard."""
    try:
        all_moves = sb.table("moves").select("*").execute()
    except Exception as e:
        logger.error(f"[moves] DB error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    moves = all_moves.data or []
    today = date.today().isoformat()

    active = [m for m in moves if m["status"] in ("scheduled", "in_transit")]
    upcoming = [m for m in moves if m.get("scheduled_date") and m["scheduled_date"] >= today and m["status"] == "scheduled"]
    completed = [m for m in moves if m["status"] == "completed"]
    total_cost = sum(float(m.get("final_cost") or m.get("quoted_cost") or 0) for m in completed)
    pending_cost = sum(float(m.get("quoted_cost") or 0) for m in active)

    return {
        "total_moves": len(moves),
        "active": len(active),
        "upcoming": len(upcoming),
        "completed": len(completed),
        "cancelled": len([m for m in moves if m["status"] == "cancelled"]),
        "total_cost_completed": round(total_cost, 2),
        "pending_cost": round(pending_cost, 2),
    }


@router.get("/property/{property_id}")
async def get_moves_for_property(property_id: str):
    """Get all moves for a specific property."""
    try:
        result = sb.table("moves").select("*").eq(
            "property_id", property_id
        ).order("created_at", desc=True).execute()
    except Exception as e:
        logger.error(f"[moves] DB error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return result.data or []


@router.get("/{move_id}")
async def get_move(move_id: str):
    """Get a single move by ID."""
    try:
        result = sb.table("moves").select("*").eq("id", move_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not result.data:
        raise HTTPException(status_code=404, detail="Move not found")

    return result.data[0]


@router.get("/")
async def list_moves(
    status: Optional[str] = Query(None),
    move_type: Optional[str] = Query(None),
    yard: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List all moves with optional filters."""
    try:
        query = sb.table("moves").select("*, properties(id, address, city, status)")

        if status:
            query = query.eq("status", status)
        if move_type:
            query = query.eq("move_type", move_type)
        if yard:
            query = query.eq("destination_yard", yard)

        result = query.order("created_at", desc=True).limit(limit).execute()
    except Exception as e:
        logger.error(f"[moves] DB error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return result.data or []


@router.post("/")
async def create_move(data: MoveCreate):
    """Create a new move for a property."""
    # Verify property exists
    try:
        prop = sb.table("properties").select("id, address, city").eq("id", data.property_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")

    # Auto-fill origin from property if not provided
    prop_data = prop.data[0]
    insert_data = data.model_dump(exclude_none=True)

    if not insert_data.get("origin_address") and data.move_type == "purchase":
        insert_data["origin_address"] = prop_data.get("address", "")
        insert_data["origin_city"] = prop_data.get("city", "")

    if not insert_data.get("destination_address") and data.move_type == "sale":
        insert_data["origin_city"] = prop_data.get("city", "")

    try:
        result = sb.table("moves").insert(insert_data).execute()
    except Exception as e:
        logger.error(f"[moves] Insert error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    logger.info(f"[moves] Created move for property {data.property_id}: {data.move_type}")
    return result.data[0] if result.data else {"success": True}


@router.patch("/{move_id}")
async def update_move(move_id: str, data: MoveUpdate):
    """Update move details."""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.utcnow().isoformat()

    try:
        result = sb.table("moves").update(update_data).eq("id", move_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not result.data:
        raise HTTPException(status_code=404, detail="Move not found")

    return result.data[0]


@router.patch("/{move_id}/status")
async def update_move_status(move_id: str, data: MoveStatusUpdate):
    """Update move status with validation."""
    # Get current move
    try:
        current = sb.table("moves").select("status").eq("id", move_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not current.data:
        raise HTTPException(status_code=404, detail="Move not found")

    current_status = current.data[0]["status"]
    new_status = data.status

    # Validate transition
    valid_next = VALID_STATUS_TRANSITIONS.get(current_status, [])
    if new_status not in valid_next:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition from '{current_status}' to '{new_status}'. Valid: {valid_next}"
        )

    update_data: dict = {
        "status": new_status,
        "updated_at": datetime.utcnow().isoformat(),
    }

    if data.actual_pickup_date:
        update_data["actual_pickup_date"] = data.actual_pickup_date
    if data.actual_delivery_date:
        update_data["actual_delivery_date"] = data.actual_delivery_date
    if data.final_cost is not None:
        update_data["final_cost"] = data.final_cost
    if data.notes:
        update_data["notes"] = data.notes

    # Auto-set payment status on completion
    if new_status == "completed" and data.final_cost:
        update_data["payment_status"] = "paid"

    try:
        result = sb.table("moves").update(update_data).eq("id", move_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Auto-create accounting transaction when a move is completed with a cost
    if new_status == "completed":
        try:
            move_row = result.data[0] if result.data else {}
            cost = float(move_row.get("final_cost") or move_row.get("quoted_cost") or 0)
            if cost > 0:
                _create_move_accounting_transaction(move_row, cost)
        except Exception as e:
            logger.warning(f"[moves] Could not create accounting txn for {move_id}: {e}")

    logger.info(f"[moves] Status {move_id}: {current_status} → {new_status}")
    return result.data[0] if result.data else {"success": True}


@router.delete("/{move_id}")
async def delete_move(move_id: str):
    """Delete a move."""
    try:
        result = sb.table("moves").delete().eq("id", move_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not result.data:
        raise HTTPException(status_code=404, detail="Move not found")

    return {"success": True, "deleted": move_id}


# ============================================================================
# HELPERS
# ============================================================================

def _create_move_accounting_transaction(move: dict, cost: float):
    """Create an accounting transaction for a completed move."""
    import uuid

    # Try to find the 'transporte' account
    account_id = None
    try:
        accts = sb.table("accounting_accounts").select("id").eq("category", "transporte").limit(1).execute()
        if accts.data:
            account_id = accts.data[0]["id"]
    except Exception:
        pass

    txn_number = f"TXN-M-{uuid.uuid4().hex[:8].upper()}"
    prop_id = move.get("property_id")
    dest = move.get("destination_city") or move.get("destination_yard") or ""
    origin = move.get("origin_city") or ""

    txn_data = {
        "transaction_number": txn_number,
        "transaction_date": (move.get("actual_delivery_date") or move.get("scheduled_date") or date.today().isoformat())[:10],
        "transaction_type": "moving_transport",
        "amount": cost,
        "is_income": False,
        "account_id": account_id,
        "entity_type": "move",
        "entity_id": move.get("id"),
        "property_id": prop_id,
        "counterparty_name": move.get("moving_company") or "Transporte",
        "counterparty_type": "vendor",
        "description": f"Movida: {origin} → {dest}" + (f" ({move.get('move_type', '')})" if move.get('move_type') else ""),
        "notes": f"Conductor: {move.get('driver_name', '—')} · Distancia: {move.get('estimated_distance_miles', '—')} mi",
        "status": "confirmed",
    }
    txn_data = {k: v for k, v in txn_data.items() if v is not None}

    result = sb.table("accounting_transactions").insert(txn_data).execute()
    if result.data:
        logger.info(f"[moves] Created accounting txn {txn_number} for move {move.get('id')}: ${cost}")
    return result

