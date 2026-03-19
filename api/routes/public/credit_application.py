"""
Public Credit Application API - Portal Clientes
Allows RTO clients to fill out their credit application after KYC verification.
"""

import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public/credit-application", tags=["Public - Credit Application"])


# =============================================================================
# SCHEMAS
# =============================================================================

class CreditApplicationData(BaseModel):
    """All credit application fields — all optional for partial saves."""
    # S1: Personal Info
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    ssn_last4: Optional[str] = None
    marital_status: Optional[str] = None
    dependents_count: Optional[int] = None
    dependents_ages: Optional[str] = None
    id_number: Optional[str] = None
    id_state: Optional[str] = None

    # S2: Residence History
    residence_history: Optional[List[dict]] = None

    # S3: Employment
    employer_name: Optional[str] = None
    employer_address: Optional[str] = None
    employer_phone: Optional[str] = None
    occupation: Optional[str] = None
    employment_type: Optional[str] = None
    monthly_income: Optional[float] = None
    time_at_job_years: Optional[int] = None
    time_at_job_months: Optional[int] = None
    previous_employer: Optional[str] = None
    previous_employer_duration: Optional[str] = None

    # S4: Other Income
    other_income_sources: Optional[List[dict]] = None

    # S5: Properties Owned
    owns_properties: Optional[bool] = None
    properties_owned: Optional[List[dict]] = None

    # S6: Debts
    debts: Optional[List[dict]] = None
    monthly_rent: Optional[float] = None
    monthly_utilities: Optional[float] = None
    monthly_child_support_paid: Optional[float] = None
    monthly_other_expenses: Optional[float] = None

    # S7: References
    personal_references: Optional[List[dict]] = None

    # S8: Legal History
    has_bankruptcy: Optional[bool] = None
    has_foreclosure: Optional[bool] = None
    has_eviction: Optional[bool] = None
    has_judgments: Optional[bool] = None
    has_federal_debt: Optional[bool] = None
    legal_details: Optional[str] = None

    # S9: Emergency Contact
    emergency_name: Optional[str] = None
    emergency_phone: Optional[str] = None
    emergency_relationship: Optional[str] = None
    emergency_address: Optional[str] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/{client_id}/{rto_application_id}")
async def get_credit_application(client_id: str, rto_application_id: str):
    """
    Get or create a credit application for an RTO application.
    If none exists, creates a draft pre-filled with client info.
    """
    try:
        result = sb.table("credit_applications") \
            .select("*") \
            .eq("rto_application_id", rto_application_id) \
            .eq("client_id", client_id) \
            .execute()

        if result.data:
            return {"ok": True, "credit_application": result.data[0]}

        # Pre-fill from client data
        client_result = sb.table("clients") \
            .select("name, email") \
            .eq("id", client_id) \
            .execute()

        prefill_name = client_result.data[0].get("name") if client_result.data else None

        insert_result = sb.table("credit_applications") \
            .insert({
                "rto_application_id": rto_application_id,
                "client_id": client_id,
                "status": "draft",
                "full_name": prefill_name,
            }) \
            .execute()

        logger.info(f"[credit_app] Created draft for rto={rto_application_id}, client={client_id}")
        return {"ok": True, "credit_application": insert_result.data[0]}

    except Exception as e:
        logger.error(f"Error getting/creating credit application: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{client_id}/{rto_application_id}")
async def update_credit_application(client_id: str, rto_application_id: str, data: CreditApplicationData):
    """Update a credit application with partial or full data."""
    try:
        update_data = data.model_dump(exclude_none=True)
        update_data["updated_at"] = datetime.utcnow().isoformat()

        result = sb.table("credit_applications") \
            .update(update_data) \
            .eq("rto_application_id", rto_application_id) \
            .eq("client_id", client_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Credit application not found")

        logger.info(f"[credit_app] Updated for rto={rto_application_id}, fields={list(update_data.keys())}")
        return {"ok": True, "credit_application": result.data[0]}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating credit application: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/{rto_application_id}/submit")
async def submit_credit_application(client_id: str, rto_application_id: str):
    """Submit the credit application for review."""
    try:
        result = sb.table("credit_applications") \
            .select("*") \
            .eq("rto_application_id", rto_application_id) \
            .eq("client_id", client_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Credit application not found")

        app = result.data[0]

        # Validate minimum required fields
        errors = []
        if not app.get("full_name"):
            errors.append("Nombre completo es requerido")
        if not app.get("monthly_income"):
            errors.append("Ingreso mensual es requerido")
        residence_history = app.get("residence_history") or []
        if len(residence_history) < 1:
            errors.append("Al menos 1 dirección es requerida")
        personal_references = app.get("personal_references") or []
        if len(personal_references) < 3:
            errors.append("Se requieren 3 referencias personales")

        if errors:
            raise HTTPException(status_code=400, detail={"errors": errors})

        sb.table("credit_applications") \
            .update({
                "status": "submitted",
                "submitted_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }) \
            .eq("rto_application_id", rto_application_id) \
            .eq("client_id", client_id) \
            .execute()

        logger.info(f"[credit_app] Submitted for rto={rto_application_id}, client={client_id}")
        return {"ok": True, "message": "Solicitud enviada correctamente"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting credit application: {e}")
        raise HTTPException(status_code=500, detail=str(e))
