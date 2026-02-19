"""
Public Clients API - Portal Clientes
Client lookup, data access, and KYC endpoints.
"""

import os
import logging
from datetime import datetime, date, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public/clients", tags=["Public - Clients"])

# KYC: Manual verification — client uploads ID photos + selfie, Capital reviews


def _safe_parse_date(value) -> Optional[date]:
    """
    Safely parse a date value from Supabase (could be DATE 'YYYY-MM-DD',
    TIMESTAMPTZ '2026-02-15T00:00:00+00:00', or None).
    Returns a date object or None.
    """
    if not value:
        return None
    if isinstance(value, date):
        return value
    s = str(value).strip()
    # Try date-only first
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S.%f%z"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    # Last resort: take first 10 chars
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except Exception:
        logger.warning(f"Could not parse date: {value}")
        return None


@router.get("/lookup")
async def lookup_client(email: str = Query(..., description="Client email")):
    """
    Look up a client by email for login purposes.
    """
    try:
        result = sb.table("clients") \
            .select("id, name, email, phone, terreno, status") \
            .eq("email", email.lower()) \
            .single() \
            .execute()
        
        if not result.data:
            return {"ok": False, "error": "Client not found"}
        
        return {
            "ok": True,
            "client": result.data
        }
        
    except Exception as e:
        logger.error(f"Error looking up client: {e}")
        return {"ok": False, "error": "Client not found"}


@router.get("/{client_id}/purchases")
async def get_client_purchases(client_id: str):
    """
    Get all purchases for a client, including RTO info.
    """
    try:
        result = sb.table("sales") \
            .select("""
                id,
                property_id,
                sale_price,
                sale_type,
                status,
                payment_method,
                rto_contract_id,
                rto_monthly_payment,
                rto_term_months,
                rto_notes,
                created_at,
                completed_at,
                properties(address, city, state, photos),
                title_transfers(id, status, transfer_date)
            """) \
            .eq("client_id", client_id) \
            .order("created_at", desc=True) \
            .execute()
        
        return {
            "ok": True,
            "purchases": result.data
        }
        
    except Exception as e:
        logger.error(f"Error getting client purchases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/rto-contract/{sale_id}")
async def get_client_rto_contract(client_id: str, sale_id: str):
    """
    Get RTO contract details and payment schedule for a client.
    """
    try:
        # Verify the sale belongs to this client
        sale_result = sb.table("sales") \
            .select("id, client_id, rto_contract_id, sale_type") \
            .eq("id", sale_id) \
            .eq("client_id", client_id) \
            .execute()
        
        if not sale_result.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        
        sale_data = sale_result.data[0]
        
        if sale_data.get("sale_type") != "rto":
            raise HTTPException(status_code=400, detail="Esta compra no es Rent-to-Own")
        
        contract_id = sale_data.get("rto_contract_id")
        
        # ── FALLBACK: if rto_contract_id is NULL on the sale, try to find
        # the contract through rto_contracts.sale_id (self-healing) ──
        if not contract_id:
            logger.warning(f"[RTO] sale {sale_id} has no rto_contract_id — trying fallback via rto_contracts.sale_id")
            fallback = sb.table("rto_contracts") \
                .select("id") \
                .eq("sale_id", sale_id) \
                .execute()
            if fallback.data:
                contract_id = fallback.data[0]["id"]
                # Self-heal: update the sale so this doesn't happen again
                try:
                    sb.table("sales").update({
                        "rto_contract_id": contract_id,
                    }).eq("id", sale_id).execute()
                    logger.info(f"[RTO] Self-healed: sale {sale_id} now linked to contract {contract_id}")
                except Exception as heal_err:
                    logger.warning(f"[RTO] Could not self-heal sale {sale_id}: {heal_err}")
        
        # ── FALLBACK 2: try to find by property_id + client_id ──
        if not contract_id:
            property_id = sale_data.get("property_id")
            if property_id:
                fallback2 = sb.table("rto_contracts") \
                    .select("id") \
                    .eq("property_id", property_id) \
                    .eq("client_id", client_id) \
                    .execute()
                if fallback2.data:
                    contract_id = fallback2.data[0]["id"]
                    try:
                        sb.table("sales").update({
                            "rto_contract_id": contract_id,
                        }).eq("id", sale_id).execute()
                        logger.info(f"[RTO] Self-healed (fallback2): sale {sale_id} → contract {contract_id}")
                    except Exception as heal_err:
                        logger.warning(f"[RTO] Could not self-heal sale {sale_id}: {heal_err}")
        
        if not contract_id:
            return {
                "ok": True,
                "contract": None,
                "payments": [],
                "progress": None,
                "message": "Tu solicitud RTO está en revisión. Te notificaremos cuando el contrato esté listo."
            }
        
        # Get contract details
        contract = sb.table("rto_contracts") \
            .select("*, properties(address, city, state, photos, square_feet)") \
            .eq("id", contract_id) \
            .single() \
            .execute()
        
        if not contract.data:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")
        
        c = contract.data
        
        # Get payments
        payments = sb.table("rto_payments") \
            .select("id, payment_number, amount, due_date, paid_date, paid_amount, payment_method, status") \
            .eq("rto_contract_id", contract_id) \
            .order("payment_number") \
            .execute()
        
        payments_data = payments.data or []
        paid = [p for p in payments_data if p["status"] == "paid"]
        total_paid = sum(float(p.get("paid_amount", 0)) for p in paid)
        total_expected = sum(float(p.get("amount", 0)) for p in payments_data)
        
        # Only return safe info to client (no internal notes)
        safe_contract = {
            "id": c["id"],
            "monthly_rent": c["monthly_rent"],
            "purchase_price": c["purchase_price"],
            "down_payment": c["down_payment"],
            "term_months": c["term_months"],
            "start_date": c["start_date"],
            "end_date": c["end_date"],
            "payment_due_day": c.get("payment_due_day", 15),
            "status": c["status"],
            "properties": c.get("properties"),
            "contract_pdf_url": c.get("contract_pdf_url"),
        }
        
        return {
            "ok": True,
            "contract": safe_contract,
            "payments": payments_data,
            "progress": {
                "payments_made": len(paid),
                "total_payments": len(payments_data),
                "total_paid": total_paid,
                "total_expected": total_expected,
                "remaining_balance": total_expected - total_paid,
                "percentage": round((len(paid) / len(payments_data) * 100), 1) if payments_data else 0,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting RTO contract for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _extract_docs_from_checklist(checklist: dict, transfer_type: str, transfer_id: str) -> list:
    """Extract documents from title_transfers.documents_checklist JSONB."""
    docs = []
    if not checklist:
        return docs
    
    doc_labels = {
        "bill_of_sale": "Bill of Sale",
        "title_application": "Título de Propiedad",
        "id_copies": "Copias de Identificación",
        "tax_receipt": "Recibo de Impuestos",
        "lien_release": "Lien Release",
        "notarized_forms": "Formularios Notarizados",
    }
    
    for doc_key, doc_info in checklist.items():
        if isinstance(doc_info, dict) and doc_info.get("checked") and doc_info.get("file_url"):
            docs.append({
                "id": f"{transfer_id}_{doc_key}",
                "doc_type": doc_key,
                "doc_label": doc_labels.get(doc_key, doc_key),
                "file_url": doc_info["file_url"],
                "file_name": doc_info["file_url"].split("/")[-1] if doc_info.get("file_url") else None,
                "uploaded_at": doc_info.get("uploaded_at"),
                "source": transfer_type,
            })
    
    return docs


@router.get("/{client_id}/documents")
async def get_client_documents(client_id: str):
    """
    Get all documents for a client's purchases.
    Documents come from title_transfers.documents_checklist (JSONB).
    For each sale we return:
      - Sale title_transfer docs (type=sale, linked to this sale)
      - Purchase title_transfer docs (type=purchase, same property) — e.g. Bill of Sale from when Maninos bought
    """
    try:
        # Get all paid/completed sales for this client with property info
        # Cash flow: pending → paid → completed
        # RTO flow: rto_pending → rto_approved → rto_active → completed
        sales_result = sb.table("sales") \
            .select("id, property_id, sale_price, sale_type, status, completed_at") \
            .eq("client_id", client_id) \
            .in_("status", ["paid", "completed"]) \
            .execute()
        
        sales_with_docs = []
        
        for sale in sales_result.data or []:
            property_id = sale["property_id"]
            sale_id = sale["id"]
            
            # Fetch property address separately to avoid join issues
            prop_result = sb.table("properties") \
                .select("address, city, state") \
                .eq("id", property_id) \
                .single() \
                .execute()
            
            prop = prop_result.data or {}
            property_address = prop.get("address", "Dirección no disponible")
            property_city = prop.get("city", "")
            property_state = prop.get("state", "TX")
            
            # Get ALL title_transfers for this property
            transfers_result = sb.table("title_transfers") \
                .select("id, transfer_type, status, documents_checklist, notes") \
                .eq("property_id", property_id) \
                .execute()
            
            all_docs = []
            title_status = "pending"
            
            for transfer in transfers_result.data or []:
                # Sale transfer linked to this specific sale
                if transfer["transfer_type"] == "sale" and transfer.get("id"):
                    # Check if this sale transfer belongs to this sale
                    sale_transfer = sb.table("title_transfers") \
                        .select("id, status, documents_checklist") \
                        .eq("property_id", property_id) \
                        .eq("transfer_type", "sale") \
                        .eq("sale_id", sale_id) \
                        .execute()
                    
                    if sale_transfer.data:
                        t = sale_transfer.data[0]
                        title_status = t.get("status", "pending")
                        docs = _extract_docs_from_checklist(
                            t.get("documents_checklist", {}),
                            "sale",
                            t["id"]
                        )
                        all_docs.extend(docs)
                    break
                
            # Also get purchase documents for this property (Maninos' original purchase)
            purchase_transfers = sb.table("title_transfers") \
                .select("id, documents_checklist") \
                .eq("property_id", property_id) \
                .eq("transfer_type", "purchase") \
                .execute()
            
            for pt in purchase_transfers.data or []:
                checklist = pt.get("documents_checklist", {})
                if checklist:
                    # Only include bill_of_sale and title from purchase
                    for key in ["bill_of_sale", "title_application"]:
                        info = checklist.get(key, {})
                        if isinstance(info, dict) and info.get("checked") and info.get("file_url"):
                            # Avoid duplicates
                            exists = any(d["doc_type"] == key and d["source"] == "purchase" for d in all_docs)
                            if not exists:
                                all_docs.append({
                                    "id": f"{pt['id']}_{key}",
                                    "doc_type": key,
                                    "doc_label": "Bill of Sale (Compra)" if key == "bill_of_sale" else "Título (Compra Original)",
                                    "file_url": info["file_url"],
                                    "file_name": info["file_url"].split("/")[-1],
                                    "uploaded_at": info.get("uploaded_at"),
                                    "source": "purchase",
                                })
            
            sales_with_docs.append({
                "id": sale_id,
                "property_address": property_address,
                "property_city": property_city,
                "property_state": property_state,
                "sale_price": sale["sale_price"],
                "completed_at": sale["completed_at"],
                "title_status": title_status,
                "documents": all_docs,
            })
        
        return {
            "ok": True,
            "sales": sales_with_docs,
        }
        
    except Exception as e:
        logger.error(f"Error getting client documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CLIENT PAYMENTS + ALERTS — called from the client portal
# =============================================================================

@router.get("/{client_id}/payments")
async def get_client_payments(client_id: str):
    """
    Get all payment history, upcoming payments, and alerts for a client.
    Aggregates data across all active RTO contracts.
    """
    try:
        # 1. Get all active/completed RTO contracts for this client
        contracts_result = sb.table("rto_contracts") \
            .select("id, status, purchase_price, down_payment, monthly_rent, term_months, start_date, end_date, payment_due_day, properties(address, city, state)") \
            .eq("client_id", client_id) \
            .in_("status", ["active", "completed"]) \
            .order("start_date", desc=True) \
            .execute()

        contracts = contracts_result.data or []

        if not contracts:
            return {
                "ok": True,
                "has_rto": False,
                "payments": [],
                "alerts": [],
                "summary": None,
            }

        # 2. Fetch all payments across all contracts
        contract_ids = [c["id"] for c in contracts]
        all_payments = []

        for cid in contract_ids:
            pmt_result = sb.table("rto_payments") \
                .select("id, payment_number, amount, due_date, paid_date, paid_amount, payment_method, payment_reference, status, late_fee_amount, rto_contract_id, client_payment_method, client_reported_at") \
                .eq("rto_contract_id", cid) \
                .order("payment_number") \
                .execute()
            all_payments.extend(pmt_result.data or [])

        # 3. Build contract lookup for property info
        contract_map = {}
        for c in contracts:
            prop = c.get("properties") or {}
            contract_map[c["id"]] = {
                "contract_id": c["id"],
                "property_address": prop.get("address", ""),
                "property_city": prop.get("city", ""),
                "monthly_rent": c.get("monthly_rent", 0),
                "purchase_price": c.get("purchase_price", 0),
                "down_payment": c.get("down_payment", 0),
                "term_months": c.get("term_months", 0),
                "payment_due_day": c.get("payment_due_day", 15),
            }

        # 4. Enrich payments with property info and categorize
        today = date.today()
        paid_payments = []
        upcoming_payments = []
        overdue_payments = []
        alerts = []

        for p in all_payments:
            cid = p.get("rto_contract_id")
            cinfo = contract_map.get(cid, {})
            enriched = {
                **p,
                "property_address": cinfo.get("property_address", ""),
                "property_city": cinfo.get("property_city", ""),
            }

            if p["status"] == "paid":
                paid_payments.append(enriched)
            elif p["status"] == "client_reported":
                # Client said they paid — treat as upcoming (awaiting confirmation)
                upcoming_payments.append(enriched)
            elif p["status"] in ("scheduled", "pending"):
                due = _safe_parse_date(p.get("due_date"))
                if due and due < today:
                    overdue_payments.append(enriched)
                else:
                    upcoming_payments.append(enriched)
            elif p["status"] == "late":
                overdue_payments.append(enriched)
            elif p["status"] == "partial":
                # Partial counts as upcoming (needs more money)
                upcoming_payments.append(enriched)

        # 5. Generate alerts
        if overdue_payments:
            total_overdue = sum(float(p.get("amount", 0)) - float(p.get("paid_amount", 0) or 0) for p in overdue_payments)
            alerts.append({
                "type": "overdue",
                "severity": "error",
                "title": f"Tienes {len(overdue_payments)} pago(s) vencido(s)",
                "message": f"Monto pendiente: ${total_overdue:,.2f}. Contacta a Maninos para evitar cargos por mora.",
            })

        # Next payment due alert
        upcoming_sorted = sorted(upcoming_payments, key=lambda x: x.get("due_date", "9999"))
        if upcoming_sorted:
            next_pmt = upcoming_sorted[0]
            due_str = next_pmt.get("due_date", "")
            if due_str:
                due_date = _safe_parse_date(due_str)
                days_until = (due_date - today).days if due_date else None
                if days_until is not None and 0 <= days_until <= 7:
                    alerts.append({
                        "type": "upcoming",
                        "severity": "warning",
                        "title": "Tu próximo pago es pronto",
                        "message": f"Pago #{next_pmt.get('payment_number', '?')} de ${float(next_pmt.get('amount', 0)):,.2f} vence el {due_str}."
                            + (f" ({days_until} día(s))" if days_until > 0 else " (¡Hoy!)"),
                    })

        # 6. Summary
        total_paid_amount = sum(float(p.get("paid_amount", 0) or 0) for p in paid_payments)
        total_expected = sum(float(p.get("amount", 0)) for p in all_payments)
        total_late_fees = sum(float(p.get("late_fee_amount", 0) or 0) for p in all_payments)

        summary = {
            "total_payments": len(all_payments),
            "payments_made": len(paid_payments),
            "payments_upcoming": len(upcoming_payments),
            "payments_overdue": len(overdue_payments),
            "total_paid": total_paid_amount,
            "total_expected": total_expected,
            "remaining_balance": total_expected - total_paid_amount,
            "total_late_fees": total_late_fees,
            "percentage_complete": round((len(paid_payments) / len(all_payments) * 100), 1) if all_payments else 0,
        }

        # Sort all payments: overdue first, then upcoming, then paid (most recent first)
        sorted_payments = (
            sorted(overdue_payments, key=lambda x: x.get("due_date", "")) +
            sorted(upcoming_payments, key=lambda x: x.get("due_date", "")) +
            sorted(paid_payments, key=lambda x: x.get("paid_date", ""), reverse=True)
        )

        return {
            "ok": True,
            "has_rto": True,
            "payments": sorted_payments,
            "alerts": alerts,
            "summary": summary,
        }

    except Exception as e:
        logger.error(f"Error getting payments for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CLIENT ACCOUNT STATEMENT (Estado de Cuenta)
# =============================================================================

@router.get("/{client_id}/account-statement")
async def get_client_account_statement(client_id: str):
    """
    Full account statement for a client.
    Shows all contracts, balances, payment history, and payment health.
    Visible to both the client portal and Capital (for RTO approval decisions).
    """
    try:
        # 1. Get client info
        client_res = sb.table("clients") \
            .select("id, name, email, phone, status, kyc_verified") \
            .eq("id", client_id) \
            .single() \
            .execute()

        if not client_res.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        client_info = client_res.data

        # 2. Get all sales for this client
        sales_res = sb.table("sales") \
            .select("id, property_id, sale_price, sale_type, status, rto_contract_id, created_at, completed_at, properties(address, city, state)") \
            .eq("client_id", client_id) \
            .order("created_at", desc=True) \
            .execute()

        sales = sales_res.data or []

        # 3. Get all RTO contracts
        contracts_res = sb.table("rto_contracts") \
            .select("id, status, purchase_price, down_payment, monthly_rent, term_months, start_date, end_date, late_fee_per_day, grace_period_days, properties(address, city, state)") \
            .eq("client_id", client_id) \
            .order("start_date", desc=True) \
            .execute()

        contracts = contracts_res.data or []

        # 4. For each contract, get all payments and compute summary
        contract_statements = []
        total_owed_all = 0
        total_paid_all = 0
        total_late_fees_all = 0
        total_overdue_all = 0
        on_time_payments = 0
        late_payments = 0

        for c in contracts:
            pmt_res = sb.table("rto_payments") \
                .select("id, payment_number, amount, due_date, paid_date, paid_amount, status, late_fee_amount, payment_method") \
                .eq("rto_contract_id", c["id"]) \
                .order("payment_number") \
                .execute()

            payments = pmt_res.data or []
            today = date.today()
            paid_pmts = [p for p in payments if p["status"] == "paid"]
            overdue_pmts = []
            for p in payments:
                if p["status"] in ("late", "scheduled", "pending"):
                    due_d = _safe_parse_date(p.get("due_date"))
                    if due_d and due_d < today:
                        overdue_pmts.append(p)

            total_expected = sum(float(p.get("amount", 0) or 0) for p in payments)
            total_paid = sum(float(p.get("paid_amount", 0) or 0) for p in paid_pmts)
            total_late_fees = sum(float(p.get("late_fee_amount", 0) or 0) for p in payments)
            total_overdue = sum(float(p.get("amount", 0) or 0) - float(p.get("paid_amount", 0) or 0) for p in overdue_pmts)

            # Count on-time vs late (robust date parsing)
            for p in paid_pmts:
                paid_d = _safe_parse_date(p.get("paid_date"))
                due_d = _safe_parse_date(p.get("due_date"))
                if paid_d and due_d:
                    grace = c.get("grace_period_days") or 5
                    if paid_d <= due_d + timedelta(days=int(grace)):
                        on_time_payments += 1
                    else:
                        late_payments += 1

            prop = c.get("properties") or {}
            contract_statements.append({
                "contract_id": c["id"],
                "status": c["status"],
                "property_address": prop.get("address", ""),
                "property_city": prop.get("city", ""),
                "purchase_price": c.get("purchase_price", 0),
                "down_payment": c.get("down_payment", 0),
                "monthly_rent": c.get("monthly_rent", 0),
                "term_months": c.get("term_months", 0),
                "start_date": c.get("start_date"),
                "end_date": c.get("end_date"),
                "total_expected": total_expected,
                "total_paid": total_paid,
                "remaining_balance": total_expected - total_paid,
                "total_late_fees": total_late_fees,
                "total_overdue": total_overdue,
                "payments_made": len(paid_pmts),
                "payments_total": len(payments),
                "payments_overdue": len(overdue_pmts),
                "completion_pct": round((len(paid_pmts) / len(payments) * 100), 1) if payments else 0,
            })

            total_owed_all += total_expected
            total_paid_all += total_paid
            total_late_fees_all += total_late_fees
            total_overdue_all += total_overdue

        # 5. Payment health score (for Capital's RTO approval)
        total_all_payments = on_time_payments + late_payments
        on_time_rate = round(on_time_payments / total_all_payments * 100, 1) if total_all_payments > 0 else 100
        health = "excellent" if on_time_rate >= 95 else "good" if on_time_rate >= 80 else "fair" if on_time_rate >= 60 else "poor"

        return {
            "ok": True,
            "client": {
                "id": client_info["id"],
                "name": client_info["name"],
                "email": client_info["email"],
                "phone": client_info.get("phone"),
                "kyc_verified": client_info.get("kyc_verified", False),
            },
            "summary": {
                "total_contracts": len(contracts),
                "active_contracts": len([c for c in contracts if c["status"] == "active"]),
                "total_purchases": len(sales),
                "total_owed": total_owed_all,
                "total_paid": total_paid_all,
                "remaining_balance": total_owed_all - total_paid_all,
                "total_late_fees": total_late_fees_all,
                "total_overdue": total_overdue_all,
            },
            "payment_health": {
                "on_time_payments": on_time_payments,
                "late_payments": late_payments,
                "on_time_rate": on_time_rate,
                "health_score": health,
            },
            "contracts": contract_statements,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting account statement for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CLIENT PAYMENT REPORTING — called from the client portal
# =============================================================================

class ClientReportPayment(BaseModel):
    """Client reports they've made a payment (cash at office or bank transfer)."""
    payment_method: str  # 'cash_office' or 'bank_transfer'
    notes: Optional[str] = None


@router.post("/{client_id}/payments/{payment_id}/report")
async def client_report_payment(client_id: str, payment_id: str, data: ClientReportPayment):
    """
    Client reports that they've paid a specific scheduled/pending/late payment.
    Sets status to 'client_reported' — Capital must confirm before it becomes 'paid'.
    
    Payment methods:
    - cash_office: Client paid cash at a Maninos office
    - bank_transfer: Client made a bank transfer using Maninos bank details
    """
    try:
        # 1. Verify the payment exists and belongs to this client
        payment_result = sb.table("rto_payments") \
            .select("id, status, amount, payment_number, rto_contract_id, client_id") \
            .eq("id", payment_id) \
            .eq("client_id", client_id) \
            .single() \
            .execute()

        if not payment_result.data:
            raise HTTPException(status_code=404, detail="Pago no encontrado")

        p = payment_result.data

        # 2. Validate status — only allow reporting on payable statuses
        payable_statuses = ("scheduled", "pending", "late", "partial")
        if p["status"] not in payable_statuses:
            if p["status"] == "paid":
                return {"ok": False, "error": "Este pago ya fue registrado como pagado."}
            if p["status"] == "client_reported":
                return {"ok": False, "error": "Ya reportaste este pago. Espera la confirmación de Maninos."}
            return {"ok": False, "error": f"Este pago no se puede reportar (estado: {p['status']})."}

        # 3. Validate payment method
        if data.payment_method not in ("cash_office", "bank_transfer"):
            raise HTTPException(status_code=400, detail="Método de pago inválido. Usa 'cash_office' o 'bank_transfer'.")

        # 4. Update the payment to 'client_reported'
        now = datetime.utcnow().isoformat()
        update_data = {
            "status": "client_reported",
            "client_payment_method": data.payment_method,
            "client_payment_notes": data.notes,
            "client_reported_at": now,
            "updated_at": now,
        }

        sb.table("rto_payments").update(update_data).eq("id", payment_id).execute()

        method_label = "Efectivo en oficina" if data.payment_method == "cash_office" else "Transferencia bancaria"
        logger.info(f"[Client Payment Report] Client {client_id} reported payment {payment_id} via {data.payment_method}")

        return {
            "ok": True,
            "message": f"¡Pago #{p['payment_number']} reportado! Método: {method_label}. Maninos confirmará tu pago pronto.",
            "payment_id": payment_id,
            "new_status": "client_reported",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reporting payment {payment_id} for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CLIENT KYC — Manual verification (client uploads ID photos + selfie)
# =============================================================================

class ClientKYCSubmit(BaseModel):
    """Client submits document URLs after uploading to storage."""
    id_front_url: str
    id_back_url: Optional[str] = None
    selfie_url: str
    id_type: str = "drivers_license"  # drivers_license, passport, state_id


@router.get("/{client_id}/kyc-status")
async def get_client_kyc_status(client_id: str):
    """
    Client checks their own KYC status.
    Shows whether Capital has requested verification and current status.
    """
    try:
        result = sb.table("clients") \
            .select("id, name, kyc_verified, kyc_verified_at, kyc_status, kyc_requested, kyc_requested_at, kyc_failure_reason, kyc_documents") \
            .eq("id", client_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        c = result.data[0]
        docs = c.get("kyc_documents") or {}

        return {
            "ok": True,
            "kyc_verified": c.get("kyc_verified", False),
            "kyc_status": c.get("kyc_status", "unverified"),
            "kyc_verified_at": c.get("kyc_verified_at"),
            "kyc_requested": c.get("kyc_requested", False),
            "kyc_requested_at": c.get("kyc_requested_at"),
            "kyc_failure_reason": c.get("kyc_failure_reason"),
            "has_documents": bool(docs.get("id_front_url")),
            "kyc_documents": docs,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting KYC status for {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/kyc-submit")
async def client_submit_kyc_documents(client_id: str, data: ClientKYCSubmit):
    """
    Client submits KYC document URLs after uploading files to storage.
    Sets status to 'pending_review' — Capital must review and approve/reject.
    """
    try:
        client_result = sb.table("clients") \
            .select("id, name, kyc_verified, kyc_status") \
            .eq("id", client_id) \
            .execute()

        if not client_result.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        client = client_result.data[0]

        if client.get("kyc_verified"):
            return {
                "ok": True,
                "already_verified": True,
                "message": "Tu identidad ya está verificada."
            }

        # Validate required fields
        if not data.id_front_url or not data.selfie_url:
            raise HTTPException(status_code=400, detail="Se requiere foto del ID y selfie.")

        now = datetime.utcnow().isoformat()

        # Store document URLs in the kyc_documents JSONB column
        kyc_docs = {
            "id_front_url": data.id_front_url,
            "id_back_url": data.id_back_url,
            "selfie_url": data.selfie_url,
            "id_type": data.id_type,
            "submitted_at": now,
        }

        sb.table("clients").update({
            "kyc_documents": kyc_docs,
            "kyc_status": "pending_review",
            "kyc_failure_reason": None,
        }).eq("id", client_id).execute()

        logger.info(f"[KYC] Client {client_id} ({client.get('name')}) submitted KYC documents for review")

        return {
            "ok": True,
            "message": "¡Documentos enviados! Maninos Capital revisará tu identidad pronto.",
            "status": "pending_review",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting KYC for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

