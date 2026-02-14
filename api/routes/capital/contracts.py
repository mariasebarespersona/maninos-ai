"""
Capital Contracts - RTO Contract management
Phase 3: Incorporar (generate, sign, activate contracts)
"""

import os
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from tools.supabase_client import sb
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/contracts", tags=["Capital - Contracts"])


# =============================================================================
# SCHEMAS
# =============================================================================

class ContractCreate(BaseModel):
    """Create an RTO contract from an approved application."""
    application_id: str
    monthly_rent: float
    purchase_price: float
    down_payment: float = 0
    term_months: int
    start_date: str  # YYYY-MM-DD
    payment_due_day: int = 15
    late_fee_per_day: float = 15.0
    grace_period_days: int = 5
    notes: Optional[str] = None


class ContractUpdate(BaseModel):
    """Update contract fields before activation."""
    monthly_rent: Optional[float] = None
    purchase_price: Optional[float] = None
    down_payment: Optional[float] = None
    term_months: Optional[int] = None
    start_date: Optional[str] = None
    payment_due_day: Optional[int] = None
    late_fee_per_day: Optional[float] = None
    grace_period_days: Optional[int] = None
    notes: Optional[str] = None


class ContractActivate(BaseModel):
    """Activate a contract (mark as signed)."""
    signed_by_client: str
    signed_by_company: str = "Maninos Capital LLC"


class DTIRequest(BaseModel):
    """Calculate DTI for a client."""
    client_id: str
    monthly_rent: float  # Proposed RTO rent
    other_monthly_debts: float = 0


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/")
async def list_contracts(status: Optional[str] = None):
    """List all RTO contracts."""
    try:
        query = sb.table("rto_contracts") \
            .select("*, clients(id, name, email, phone), properties(id, address, city, state, photos)")
        
        if status:
            query = query.eq("status", status)
        
        result = query.order("created_at", desc=True).execute()
        return {"ok": True, "contracts": result.data or []}
    except Exception as e:
        logger.error(f"Error listing contracts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{contract_id}")
async def get_contract(contract_id: str):
    """Get full contract details with payment history."""
    try:
        # Use explicit FK hint to avoid ambiguous sales relationship
        # (rto_contracts.sale_id -> sales, but sales.rto_contract_id -> rto_contracts)
        contract_result = sb.table("rto_contracts") \
            .select("*, clients(*), properties(*), sales!sale_id(*)") \
            .eq("id", contract_id) \
            .execute()
        
        if not contract_result.data:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")
        
        contract = type('obj', (), {'data': contract_result.data[0]})()
        
        # Get payment schedule
        payments = sb.table("rto_payments") \
            .select("*") \
            .eq("rto_contract_id", contract_id) \
            .order("payment_number") \
            .execute()
        
        # Calculate progress
        payments_data = payments.data or []
        paid_count = sum(1 for p in payments_data if p["status"] == "paid")
        total_paid = sum(float(p.get("paid_amount", 0)) for p in payments_data if p["status"] == "paid")
        total_expected = sum(float(p.get("amount", 0)) for p in payments_data)
        
        return {
            "ok": True,
            "contract": contract.data,
            "payments": payments_data,
            "progress": {
                "payments_made": paid_count,
                "total_payments": len(payments_data),
                "total_paid": total_paid,
                "total_expected": total_expected,
                "percentage": round((paid_count / len(payments_data) * 100), 1) if payments_data else 0
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting contract {contract_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
async def create_contract(data: ContractCreate):
    """
    Create an RTO contract from an approved application.
    This is the Incorporar step after approval.
    """
    try:
        # Get application
        app_result = sb.table("rto_applications") \
            .select("*, clients(*), properties(*), sales!sale_id(*)") \
            .eq("id", data.application_id) \
            .single() \
            .execute()
        
        if not app_result.data:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        
        application = app_result.data
        
        if application["status"] != "approved":
            raise HTTPException(
                status_code=400,
                detail="La solicitud debe estar aprobada para crear un contrato"
            )
        
        # Check for existing contract
        existing = sb.table("rto_contracts") \
            .select("id") \
            .eq("sale_id", application["sale_id"]) \
            .execute()
        
        if existing.data:
            raise HTTPException(
                status_code=400,
                detail="Ya existe un contrato para esta venta"
            )
        
        # Calculate end date
        start = datetime.strptime(data.start_date, "%Y-%m-%d").date()
        end = start + relativedelta(months=data.term_months)
        
        # Create contract
        contract_data = {
            "sale_id": application["sale_id"],
            "property_id": application["property_id"],
            "client_id": application["client_id"],
            "monthly_rent": data.monthly_rent,
            "purchase_price": data.purchase_price,
            "down_payment": data.down_payment,
            "term_months": data.term_months,
            "start_date": data.start_date,
            "end_date": end.isoformat(),
            "payment_due_day": data.payment_due_day,
            "late_fee_per_day": data.late_fee_per_day,
            "grace_period_days": data.grace_period_days,
            "hud_number": application["properties"].get("hud_number"),
            "property_year": application["properties"].get("year"),
            "status": "draft",
            "notes": data.notes,
            "created_by": "admin",
        }
        
        result = sb.table("rto_contracts").insert(contract_data).execute()
        contract_id = result.data[0]["id"]
        
        # Link contract to sale
        sb.table("sales").update({
            "rto_contract_id": contract_id,
            "rto_monthly_payment": data.monthly_rent,
            "rto_term_months": data.term_months,
            "rto_down_payment": data.down_payment,
        }).eq("id", application["sale_id"]).execute()
        
        return {
            "ok": True,
            "contract_id": contract_id,
            "message": "Contrato RTO creado en borrador. Revisa y activa cuando esté firmado."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating contract: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{contract_id}")
async def update_contract(contract_id: str, data: ContractUpdate):
    """Update contract terms (only while in draft/pending_signature)."""
    try:
        contract = sb.table("rto_contracts") \
            .select("status") \
            .eq("id", contract_id) \
            .single() \
            .execute()
        
        if not contract.data:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")
        
        if contract.data["status"] not in ("draft", "pending_signature"):
            raise HTTPException(
                status_code=400,
                detail="Solo se puede editar contratos en borrador o pendientes de firma"
            )
        
        update = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        
        if "start_date" in update and "term_months" not in update:
            # Recalculate end date
            start = datetime.strptime(update["start_date"], "%Y-%m-%d").date()
            c = sb.table("rto_contracts").select("term_months").eq("id", contract_id).single().execute()
            end = start + relativedelta(months=c.data["term_months"])
            update["end_date"] = end.isoformat()
        elif "term_months" in update:
            c = sb.table("rto_contracts").select("start_date").eq("id", contract_id).single().execute()
            start = datetime.strptime(c.data["start_date"], "%Y-%m-%d").date()
            end = start + relativedelta(months=update["term_months"])
            update["end_date"] = end.isoformat()
        
        if update:
            sb.table("rto_contracts").update(update).eq("id", contract_id).execute()
        
        return {"ok": True, "message": "Contrato actualizado"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating contract {contract_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{contract_id}/activate")
async def activate_contract(contract_id: str, data: ContractActivate):
    """
    Activate a contract after signing.
    Generates the full payment schedule.
    """
    try:
        contract = sb.table("rto_contracts") \
            .select("*") \
            .eq("id", contract_id) \
            .single() \
            .execute()
        
        if not contract.data:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")
        
        c = contract.data
        
        if c["status"] not in ("draft", "pending_signature"):
            raise HTTPException(
                status_code=400,
                detail=f"El contrato no se puede activar (estado actual: {c['status']})"
            )
        
        # Update contract to active
        sb.table("rto_contracts").update({
            "status": "active",
            "signed_at": datetime.utcnow().isoformat(),
            "signed_by_client": data.signed_by_client,
            "signed_by_company": data.signed_by_company,
        }).eq("id", contract_id).execute()
        
        # Generate payment schedule
        start = datetime.strptime(c["start_date"], "%Y-%m-%d").date()
        payments_to_insert = []
        
        for i in range(c["term_months"]):
            payment_date = start + relativedelta(months=i)
            # Set to the due day
            try:
                due = payment_date.replace(day=c["payment_due_day"])
            except ValueError:
                # If month doesn't have that day, use last day
                next_month = payment_date + relativedelta(months=1)
                due = next_month.replace(day=1) - timedelta(days=1)
            
            # Determine initial status
            today = date.today()
            if due < today:
                status = "late"
            elif due == today or (due - today).days <= 5:
                status = "pending"
            else:
                status = "scheduled"
            
            payments_to_insert.append({
                "rto_contract_id": contract_id,
                "client_id": c["client_id"],
                "payment_number": i + 1,
                "amount": float(c["monthly_rent"]),
                "due_date": due.isoformat(),
                "status": status,
            })
        
        # Bulk insert payments
        if payments_to_insert:
            sb.table("rto_payments").insert(payments_to_insert).execute()
        
        # =========================================================
        # Generate RTO Contract PDF and upload to storage
        # =========================================================
        contract_pdf_url = None
        try:
            from api.services.pdf_service import generate_rto_contract
            
            # Get client and property data for PDF
            client_data = sb.table("clients").select("name").eq("id", c["client_id"]).single().execute()
            property_data = sb.table("properties").select("address, hud_number, year").eq("id", c["property_id"]).single().execute()
            
            tenant_name = client_data.data.get("name", "N/A") if client_data.data else "N/A"
            prop = property_data.data or {}
            
            pdf_bytes = generate_rto_contract(
                tenant_name=tenant_name,
                property_address=prop.get("address", "N/A"),
                hud_number=prop.get("hud_number"),
                property_year=prop.get("year"),
                lease_term_months=c["term_months"],
                monthly_rent=float(c["monthly_rent"]),
                down_payment=float(c.get("down_payment", 0)),
                purchase_price=float(c["purchase_price"]),
                start_date=datetime.strptime(c["start_date"], "%Y-%m-%d"),
                end_date=datetime.strptime(c["end_date"], "%Y-%m-%d") if c.get("end_date") else None,
                payment_due_day=c.get("payment_due_day", 15),
                late_fee_per_day=float(c.get("late_fee_per_day", 15)),
                grace_period_days=c.get("grace_period_days", 5),
            )
            
            # Upload to Supabase Storage
            bucket = "transaction-documents"
            storage_path = f"rto-contracts/{contract_id}/RTO_Contract_{contract_id[:8]}.pdf"
            
            sb.storage.from_(bucket).upload(
                storage_path,
                pdf_bytes,
                {"content-type": "application/pdf"},
            )
            
            contract_pdf_url = sb.storage.from_(bucket).get_public_url(storage_path)
            if contract_pdf_url and contract_pdf_url.endswith("?"):
                contract_pdf_url = contract_pdf_url[:-1]
            
            # Save PDF URL in contract
            sb.table("rto_contracts").update({
                "contract_pdf_url": contract_pdf_url,
            }).eq("id", contract_id).execute()
            
            logger.info(f"RTO contract PDF generated: {contract_pdf_url}")
            
        except Exception as pdf_err:
            logger.warning(f"Could not generate contract PDF: {pdf_err}")
        
        # Update sale status to rto_active
        sb.table("sales").update({
            "status": "rto_active"
        }).eq("id", c["sale_id"]).execute()
        
        # Update client status
        sb.table("clients").update({
            "status": "rto_active"
        }).eq("id", c["client_id"]).execute()
        
        return {
            "ok": True,
            "message": f"Contrato activado. {len(payments_to_insert)} pagos generados." + 
                       (" PDF del contrato generado." if contract_pdf_url else ""),
            "payments_created": len(payments_to_insert),
            "contract_pdf_url": contract_pdf_url,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error activating contract {contract_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{contract_id}/deliver")
async def deliver_title(contract_id: str):
    """
    Phase 5: Entregar - Transfer title to client after all payments completed.
    Creates title transfer, generates documents, updates statuses, emails client.
    """
    try:
        # Get contract with relations
        contract_result = sb.table("rto_contracts") \
            .select("*, clients(*), properties(*), sales!sale_id(*)") \
            .eq("id", contract_id) \
            .execute()

        if not contract_result.data:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")

        c = contract_result.data[0]

        if c["status"] != "completed":
            raise HTTPException(
                status_code=400,
                detail=f"El contrato debe estar completado para entregar. Estado actual: {c['status']}"
            )

        # Check all payments are really paid
        remaining = sb.table("rto_payments") \
            .select("id") \
            .eq("rto_contract_id", contract_id) \
            .in_("status", ["scheduled", "pending", "late"]) \
            .execute()

        if remaining.data:
            raise HTTPException(
                status_code=400,
                detail=f"Aún hay {len(remaining.data)} pagos pendientes"
            )

        # Create title transfer: Maninos Capital → Client
        existing = sb.table("title_transfers") \
            .select("id") \
            .eq("property_id", c["property_id"]) \
            .eq("to_name", c["clients"]["name"]) \
            .eq("transfer_type", "sale") \
            .execute()

        transfer_id = None
        if existing.data:
            transfer_id = existing.data[0]["id"]
        else:
            transfer_result = sb.table("title_transfers").insert({
                "property_id": c["property_id"],
                "sale_id": c["sale_id"],
                "transfer_type": "sale",
                "from_name": "Maninos Capital LLC",
                "to_name": c["clients"]["name"],
                "status": "completed",
                "completed_at": datetime.utcnow().isoformat(),
                "notes": f"Entrega RTO - Contrato {contract_id[:8]}... completado"
            }).execute()
            transfer_id = transfer_result.data[0]["id"]

        # Generate documents
        try:
            from api.services.document_service import document_service
            docs = await document_service.generate_and_upload_documents(
                transfer_id=transfer_id,
                property_data=c["properties"],
                seller_name="Maninos Capital LLC",
                buyer_name=c["clients"]["name"],
                sale_price=c["purchase_price"],
            )
            logger.info(f"Documents generated for delivery: {docs}")
        except Exception as doc_err:
            logger.warning(f"Could not generate documents: {doc_err}")

        # Update contract status to delivered
        sb.table("rto_contracts").update({
            "status": "delivered",
            "delivered_at": datetime.utcnow().isoformat(),
        }).eq("id", contract_id).execute()

        # Update sale status to completed
        sb.table("sales").update({
            "status": "completed"
        }).eq("id", c["sale_id"]).execute()

        # Update property status
        sb.table("properties").update({
            "status": "sold"
        }).eq("id", c["property_id"]).execute()

        # Update client status
        sb.table("clients").update({
            "status": "rto_completed"
        }).eq("id", c["client_id"]).execute()

        # Send email to client
        try:
            from api.services.email_service import email_service
            await email_service.send_email(
                to_email=c["clients"]["email"],
                subject="🎉 ¡Felicidades! Tu casa ya es tuya - Maninos Capital",
                html=f"""
                <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                    <h1 style="color: #1a2744; font-size: 28px;">¡Felicidades, {c['clients']['name']}!</h1>
                    <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
                        Has completado todos los pagos de tu contrato Rent-to-Own.
                        <strong>Tu casa ya es oficialmente tuya.</strong>
                    </p>
                    <div style="background: #f7f3ed; border-radius: 8px; padding: 20px; margin: 24px 0;">
                        <p style="margin: 0;"><strong>Propiedad:</strong> {c['properties'].get('address', 'N/A')}</p>
                        <p style="margin: 8px 0 0;"><strong>Título transferido a:</strong> {c['clients']['name']}</p>
                    </div>
                    <p style="color: #4a5568; font-size: 16px;">
                        Ingresa a tu cuenta para ver y descargar tus documentos (Bill of Sale y Título).
                    </p>
                    <a href="{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/clientes/mi-cuenta"
                       style="display: inline-block; background: #b8960c; color: white; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 16px;">
                        Ver Mi Cuenta
                    </a>
                </div>
                """
            )
        except Exception as email_err:
            logger.warning(f"Could not send delivery email: {email_err}")

        return {
            "ok": True,
            "message": "🎉 Título entregado exitosamente. El cliente ha sido notificado.",
            "transfer_id": transfer_id,
            "contract_status": "delivered",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error delivering title for contract {contract_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{contract_id}/pdf")
async def download_contract_pdf(contract_id: str):
    """
    Download/regenerate the RTO contract PDF.
    If the PDF was already generated, re-generates a fresh copy.
    """
    try:
        contract_result = sb.table("rto_contracts") \
            .select("*, clients(name), properties(address, hud_number, year)") \
            .eq("id", contract_id) \
            .execute()
        
        if not contract_result.data:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")
        
        c = contract_result.data[0]
        
        from api.services.pdf_service import generate_rto_contract
        
        pdf_bytes = generate_rto_contract(
            tenant_name=c["clients"].get("name", "N/A") if c.get("clients") else "N/A",
            property_address=c["properties"].get("address", "N/A") if c.get("properties") else "N/A",
            hud_number=c["properties"].get("hud_number") if c.get("properties") else None,
            property_year=c["properties"].get("year") if c.get("properties") else None,
            lease_term_months=c["term_months"],
            monthly_rent=float(c["monthly_rent"]),
            down_payment=float(c.get("down_payment", 0)),
            purchase_price=float(c["purchase_price"]),
            start_date=datetime.strptime(c["start_date"], "%Y-%m-%d"),
            end_date=datetime.strptime(c["end_date"], "%Y-%m-%d") if c.get("end_date") else None,
            payment_due_day=c.get("payment_due_day", 15),
            late_fee_per_day=float(c.get("late_fee_per_day", 15)),
            grace_period_days=c.get("grace_period_days", 5),
        )
        
        client_name = (c["clients"].get("name", "contract") if c.get("clients") else "contract").replace(" ", "_")
        filename = f"RTO_Contract_{client_name}_{contract_id[:8]}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating contract PDF: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/calculate-dti")
async def calculate_dti(data: DTIRequest):
    """
    Calculate Debt-to-Income ratio for a client.
    Rule: DTI ≤ 43% to qualify.
    """
    try:
        client = sb.table("clients") \
            .select("name, monthly_income, other_income_amount, other_income_source") \
            .eq("id", data.client_id) \
            .single() \
            .execute()
        
        if not client.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")
        
        c = client.data
        monthly_income = float(c.get("monthly_income") or 0)
        other_income = float(c.get("other_income_amount") or 0) if c.get("other_income_source") else 0
        total_income = monthly_income + other_income
        
        if total_income <= 0:
            return {
                "ok": True,
                "dti": None,
                "qualifies": False,
                "message": "No hay información de ingresos del cliente",
                "details": {
                    "monthly_income": monthly_income,
                    "other_income": other_income,
                    "total_income": total_income,
                    "total_monthly_debts": data.monthly_rent + data.other_monthly_debts,
                }
            }
        
        total_debts = data.monthly_rent + data.other_monthly_debts
        dti = (total_debts / total_income) * 100
        
        return {
            "ok": True,
            "dti": round(dti, 1),
            "qualifies": dti <= 43,
            "message": f"DTI: {dti:.1f}% {'✅ Califica' if dti <= 43 else '❌ No califica (máx 43%)'}",
            "details": {
                "monthly_income": monthly_income,
                "other_income": other_income,
                "total_income": total_income,
                "proposed_rent": data.monthly_rent,
                "other_debts": data.other_monthly_debts,
                "total_monthly_debts": total_debts,
                "threshold": 43,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating DTI: {e}")
        raise HTTPException(status_code=500, detail=str(e))

