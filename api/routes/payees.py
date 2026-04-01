"""
Payees API — CRUD for saved payees (wire transfer recipients).
Used by the "Beneficiario existente" selector in property purchase flow.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from tools.supabase_client import sb
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class PayeeCreate(BaseModel):
    name: str
    bank_name: Optional[str] = None
    routing_number: Optional[str] = None
    account_number: Optional[str] = None
    account_type: Optional[str] = "checking"
    address: Optional[str] = None
    bank_address: Optional[str] = None
    memo: Optional[str] = None


@router.get("")
async def list_payees():
    """List all saved payees."""
    try:
        result = sb.table("payees").select("*").order("name").execute()
        # Mask account numbers for security
        payees = []
        for p in (result.data or []):
            masked = {**p}
            if p.get("account_number"):
                masked["account_number_masked"] = "****" + p["account_number"][-4:]
            payees.append(masked)
        return {"ok": True, "data": payees}
    except Exception as e:
        logger.error(f"[payees] Error listing: {e}")
        return {"ok": True, "data": []}


@router.post("")
async def create_payee(data: PayeeCreate):
    """Create a new payee."""
    try:
        result = sb.table("payees").insert({
            "name": data.name,
            "bank_name": data.bank_name,
            "routing_number": data.routing_number,
            "account_number": data.account_number,
            "account_type": data.account_type,
            "address": data.address,
            "bank_address": data.bank_address,
            "memo": data.memo,
        }).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create payee")
        return {"ok": True, "data": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[payees] Error creating: {e}")
        raise HTTPException(status_code=500, detail=str(e))
