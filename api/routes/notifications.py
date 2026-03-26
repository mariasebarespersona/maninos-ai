"""
Notifications API — CRUD for the centralized notifications table.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from tools.supabase_client import sb
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def list_notifications(
    category: Optional[str] = Query(None, description="Filter: homes, capital, both"),
    type: Optional[str] = Query(None, description="Filter by type"),
    unread_only: bool = Query(False),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """List notifications, newest first."""
    try:
        query = sb.table("notifications").select("*")

        if category:
            query = query.or_(f"category.eq.{category},category.eq.both")
        if type:
            query = query.eq("type", type)
        if unread_only:
            query = query.eq("is_read", False)

        query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
        result = query.execute()

        return {"ok": True, "notifications": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        logger.error(f"Error listing notifications: {e}")
        return {"ok": True, "notifications": [], "count": 0, "error": str(e)}


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, read_by: Optional[str] = Query(None)):
    """Mark a notification as read."""
    from datetime import datetime
    try:
        result = sb.table("notifications").update({
            "is_read": True,
            "read_at": datetime.utcnow().isoformat(),
            "read_by": read_by,
        }).eq("id", notification_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Notification not found")

        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mark-all-read")
async def mark_all_read(category: Optional[str] = Query(None)):
    """Mark all notifications as read."""
    from datetime import datetime
    try:
        query = sb.table("notifications").update({
            "is_read": True,
            "read_at": datetime.utcnow().isoformat(),
        }).eq("is_read", False)

        if category:
            query = query.or_(f"category.eq.{category},category.eq.both")

        result = query.execute()
        return {"ok": True, "marked": len(result.data or [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/unread-count")
async def unread_count(category: Optional[str] = Query(None)):
    """Get count of unread notifications."""
    try:
        query = sb.table("notifications").select("id", count="exact").eq("is_read", False)
        if category:
            query = query.in_("category", [category, "both"])
        result = query.execute()
        return {"ok": True, "count": result.count or 0}
    except Exception as e:
        return {"ok": True, "count": 0}
