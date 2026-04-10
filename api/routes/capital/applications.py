"""
Capital Applications - Review and manage RTO applications
Phase 2: Adquirir
"""

from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb
from api.utils.future_value_predictor import predict_future_value
import logging
import math

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/applications", tags=["Capital - Applications"])


# =============================================================================
# SCHEMAS
# =============================================================================

class ApplicationReview(BaseModel):
    """Review an RTO application."""
    status: str  # 'approved', 'rejected', 'needs_info', 'under_review'
    review_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    rejection_reason: Optional[str] = None  # 'identity', 'capacity', 'other'
    # If approving, optionally set financial terms
    monthly_rent: Optional[float] = None
    term_months: Optional[int] = None
    down_payment: Optional[float] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("")
async def list_applications(status: Optional[str] = None):
    """List all RTO applications, optionally filtered by status."""
    try:
        query = sb.table("rto_applications") \
            .select("*, clients(id, name, email, phone, kyc_verified, kyc_status), properties(id, address, city, state, sale_price, photos), sales(id, sale_price, status)")
        
        if status:
            query = query.eq("status", status)
        
        result = query.order("created_at", desc=True).execute()
        return {"ok": True, "applications": result.data or []}
    except Exception as e:
        logger.error(f"Error listing applications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{application_id}")
async def get_application(application_id: str):
    """Get detailed application info."""
    try:
        result = sb.table("rto_applications") \
            .select("*, clients(*), properties(*), sales!rto_applications_sale_id_fkey(*)") \
            .eq("id", application_id) \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        
        return {"ok": True, "application": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting application {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{application_id}/review")
@router.post("/{application_id}/review")
async def review_application(application_id: str, review: ApplicationReview):
    """
    Review an RTO application.
    - If approved: updates sales status, can optionally set contract terms.
    - If rejected: updates application and sales status.
    """
    try:
        # Get application
        app_result = sb.table("rto_applications") \
            .select("*, sales(*), properties(*), clients(*)") \
            .eq("id", application_id) \
            .single() \
            .execute()
        
        if not app_result.data:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        
        application = app_result.data
        
        # Validate status transition
        valid_statuses = ["approved", "rejected", "needs_info", "under_review"]
        if review.status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Estado inválido. Usa: {', '.join(valid_statuses)}"
            )
        
        # Update application
        update_data = {
            "status": review.status,
            "reviewed_at": datetime.utcnow().isoformat(),
            "review_notes": review.review_notes,
            "reviewed_by": review.reviewed_by or "admin",
        }
        
        sb.table("rto_applications") \
            .update(update_data) \
            .eq("id", application_id) \
            .execute()
        
        # Side effects based on decision
        if review.status == "approved":
            # Get property info for contract
            prop_result = sb.table("properties") \
                .select("sale_price, hud_number, year") \
                .eq("id", application["property_id"]) \
                .execute()
            prop_data = prop_result.data[0] if prop_result.data else {}
            
            sale_price = float(prop_data.get("sale_price") or 0)
            monthly_rent = review.monthly_rent or 0
            term_months = review.term_months or 36
            down_payment = review.down_payment or 0

            # Validate minimum 30% down payment
            if sale_price > 0 and down_payment < sale_price * 0.30:
                min_dp = round(sale_price * 0.30, 2)
                raise HTTPException(
                    status_code=400,
                    detail=f"El enganche mínimo es 30% del precio de venta (${min_dp:,.2f})"
                )
            
            # Update sale status to rto_approved
            sb.table("sales").update({
                "status": "rto_approved",
                "rto_monthly_payment": monthly_rent,
                "rto_term_months": term_months,
                "rto_down_payment": down_payment,
            }).eq("id", application["sale_id"]).execute()

            # Calculate the remaining amount Capital will pay to Homes
            remaining = round(sale_price - down_payment, 2) if sale_price > 0 else 0

            # Update financed fields on the sale (payment pending — separate step)
            try:
                sb.table("sales").update({
                    "financed_down_payment": down_payment,
                    "financed_remaining": remaining,
                    "capital_payment_status": "pending",
                }).eq("id", application["sale_id"]).execute()
            except Exception as e:
                logger.warning(f"[capital] Could not update financed fields on sale: {e}")

            # Notify both portals
            try:
                from api.services.notification_service import create_notification
                client_name = application.get("clients", {}).get("name", "") if isinstance(application.get("clients"), dict) else ""
                prop_addr = application.get("properties", {}).get("address", "") if isinstance(application.get("properties"), dict) else ""
                create_notification(
                    type="capital_payment",
                    title=f"RTO Aprobado: {prop_addr}",
                    message=(
                        f"Capital aprobó RTO para {client_name}.\n"
                        f"Enganche: ${down_payment:,.0f} (cliente → Homes)\n"
                        f"Capital paga: ${remaining:,.0f} a Homes\n"
                        f"Contrato: ${monthly_rent:,.0f}/mes × {term_months} meses"
                    ),
                    category="both",
                    property_id=application.get("property_id"),
                    related_entity_type="sale",
                    related_entity_id=application.get("sale_id"),
                    amount=remaining,
                    priority="urgent",
                    action_required=False,
                    created_by="capital",
                )
            except Exception:
                pass
            
            # Update client status to rto_active
            sb.table("clients").update({
                "status": "rto_active"
            }).eq("id", application["client_id"]).execute()
            
            # Create RTO contract automatically
            start = date.today()
            end = start + relativedelta(months=term_months)
            
            existing_contract = sb.table("rto_contracts") \
                .select("id") \
                .eq("sale_id", application["sale_id"]) \
                .execute()
            
            if not existing_contract.data:
                contract_data = {
                    "sale_id": application["sale_id"],
                    "property_id": application["property_id"],
                    "client_id": application["client_id"],
                    "monthly_rent": monthly_rent,
                    "purchase_price": sale_price,
                    "down_payment": down_payment,
                    "term_months": term_months,
                    "start_date": start.isoformat(),
                    "end_date": end.isoformat(),
                    "hud_number": prop_data.get("hud_number"),
                    "property_year": prop_data.get("year"),
                    "status": "draft",
                    "notes": f"Contrato generado automáticamente al aprobar solicitud {application_id}",
                }
                contract_insert = sb.table("rto_contracts").insert(contract_data).execute()
                new_contract_id = contract_insert.data[0]["id"] if contract_insert.data else None
                logger.info(f"[capital] RTO contract created for application {application_id}, contract_id={new_contract_id}")
                
                # Link the contract to the sale so the client portal can find it
                if new_contract_id:
                    sb.table("sales").update({
                        "rto_contract_id": new_contract_id,
                    }).eq("id", application["sale_id"]).execute()
                    logger.info(f"[capital] Sale {application['sale_id']} linked to rto_contract {new_contract_id}")

                    # Auto-sign by Maninos and set to pending_signature
                    sb.table("rto_contracts").update({
                        "status": "pending_signature",
                        "signed_by_company": "Sebastian Zambrano, Maninos Capital LLC",
                    }).eq("id", new_contract_id).execute()

                    # Send signing email to client (in background thread to avoid timeout)
                    import threading
                    def _send_signing_email():
                        try:
                            from api.services.email_service import _base_template
                            from tools.email_tool import send_email
                            import os

                            client_data = application.get("clients") or {}
                            prop_data = application.get("properties") or {}
                            app_url = os.getenv("APP_URL") or os.getenv("FRONTEND_URL") or "http://localhost:3000"
                            sign_link = f"{app_url}/clientes/mi-cuenta/firmar-contrato/{new_contract_id}"

                            content = f"""
                            <div class="header">
                                <h1>Tu Contrato RTO está Listo</h1>
                                <p>Firma tu contrato para comenzar</p>
                            </div>
                            <div class="body">
                                <p>Hola <strong>{client_data.get('name', '')}</strong>,</p>
                                <p>Tu solicitud de Rent-to-Own ha sido aprobada. Tu contrato está listo para firmar.</p>
                                <div class="highlight">
                                    <p><strong>Propiedad:</strong> {prop_data.get('address', '')}</p>
                                    <p><strong>Mensualidad:</strong> ${review.monthly_rent:,.0f}/mes</p>
                                    <p><strong>Plazo:</strong> {review.term_months} meses</p>
                                    <p><strong>Enganche:</strong> ${review.down_payment:,.0f}</p>
                                </div>
                                <p style="text-align: center; margin-top: 24px;">
                                    <a href="{sign_link}" class="btn">Firmar Contrato</a>
                                </p>
                            </div>
                            """
                            send_email(
                                to=[client_data.get('email', '')],
                                subject="Tu contrato RTO está listo para firmar",
                                html=_base_template(content),
                            )
                            logger.info(f"[capital] Signing email sent to {client_data.get('email')} for contract {new_contract_id}")
                        except Exception as email_err:
                            logger.warning(f"[capital] Failed to send signing email: {email_err}")
                    threading.Thread(target=_send_signing_email, daemon=True).start()
            else:
                # Contract already exists — make sure it's linked to the sale
                existing_cid = existing_contract.data[0]["id"]
                sb.table("sales").update({
                    "rto_contract_id": existing_cid,
                }).eq("id", application["sale_id"]).execute()
            
            # Create title transfer: Maninos Homes → Maninos Homes
            # (Capital acquires the property — docs come in Capital's name)
            existing_transfer = sb.table("title_transfers") \
                .select("id") \
                .eq("property_id", application["property_id"]) \
                .eq("to_name", "Maninos Homes LLC") \
                .eq("transfer_type", "sale") \
                .execute()
            
            if not existing_transfer.data:
                # Look for existing purchase transfer (Seller → Homes) to carry over documents
                purchase_transfer = sb.table("title_transfers") \
                    .select("documents_checklist") \
                    .eq("property_id", application["property_id"]) \
                    .eq("transfer_type", "purchase") \
                    .execute()
                
                # Build documents checklist, copying any existing docs from purchase
                docs_checklist = {
                    "bill_of_sale": False,
                    "titulo": False,
                    "title_application": False,
                    "tax_receipt": False,
                    "id_copies": False,
                    "lien_release": False,
                    "notarized_forms": False,
                }
                
                if purchase_transfer.data:
                    purchase_docs = purchase_transfer.data[0].get("documents_checklist", {})
                    for doc_key in ["bill_of_sale", "titulo", "title_application", "tax_receipt", "id_copies", "lien_release", "notarized_forms"]:
                        src = purchase_docs.get(doc_key)
                        if src and isinstance(src, dict) and src.get("file_url"):
                            # Copy the file URL from the purchase transfer
                            docs_checklist[doc_key] = {
                                "checked": True,
                                "file_url": src["file_url"],
                                "uploaded_at": src.get("uploaded_at"),
                                "copied_from": "purchase_transfer",
                            }
                            logger.info(f"[capital] Copied {doc_key} from purchase transfer for property {application['property_id']}")
                        elif src and isinstance(src, bool) and src:
                            docs_checklist[doc_key] = True
                
                sb.table("title_transfers").insert({
                    "property_id": application["property_id"],
                    "sale_id": application["sale_id"],
                    "transfer_type": "sale",
                    "from_name": "Maninos Homes LLC",
                    "to_name": "Maninos Homes LLC",
                    "status": "pending",
                    "documents_checklist": docs_checklist,
                    "notes": f"Adquisición RTO - Capital adquiere propiedad de Homes. Solicitud {application_id}"
                }).execute()
                logger.info(f"[capital] Title transfer Homes→Capital created for property {application['property_id']}")
        
        elif review.status == "rejected":
            # Build rejection message for client
            reason_labels = {
                "identity": "No se pudo verificar la identidad del solicitante",
                "capacity": "La capacidad de pago no cumple los requisitos",
                "other": review.review_notes or "Sin notas",
            }
            rejection_reason = review.rejection_reason or "other"
            reason_text = reason_labels.get(rejection_reason, review.review_notes or "Sin notas")
            full_notes = f"Solicitud denegada — {reason_text}"
            if review.review_notes and rejection_reason != "other":
                full_notes += f". Notas: {review.review_notes}"

            # Update sale status back and re-publish property
            sb.table("sales").update({
                "status": "cancelled",
                "rto_notes": full_notes,
            }).eq("id", application["sale_id"]).execute()
            
            # Re-publish property so others can buy it
            sb.table("properties").update({
                "status": "published"
            }).eq("id", application["property_id"]).execute()
            
            # Reset client status and KYC
            sb.table("clients").update({
                "status": "lead",
                "kyc_requested": False,
                "kyc_verified": False,
                "kyc_status": "unverified",
                "kyc_session_id": None,
                "kyc_failure_reason": None,
            }).eq("id", application["client_id"]).execute()
            
            logger.info(f"[capital] Application {application_id} rejected ({rejection_reason}): property {application['property_id']} re-published")
        
        return {
            "ok": True,
            "message": f"Solicitud {review.status}",
            "application_id": application_id,
            "new_status": review.status
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reviewing application {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{application_id}/credit-application")
async def get_credit_application(application_id: str):
    """Get the credit application filled by the client."""
    try:
        result = sb.table("credit_applications") \
            .select("*") \
            .eq("rto_application_id", application_id) \
            .execute()

        if not result.data:
            return {"ok": True, "credit_application": None}

        return {"ok": True, "credit_application": result.data[0]}
    except Exception as e:
        logger.error(f"Error getting credit application: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{application_id}/rto-calculation")
async def rto_calculation(application_id: str):
    """
    Calculate RTO payment scenarios for an application.
    Uses simple interest at 24% annual, rounds payments up to nearest $5.
    Returns recommended term, all scenarios, risk assessment, and Maninos ROI.
    """
    try:
        # 1. Fetch RTO application with related data
        app_result = sb.table("rto_applications") \
            .select("*, clients(*), properties(*), sales(*)") \
            .eq("id", application_id) \
            .single() \
            .execute()

        if not app_result.data:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")

        application = app_result.data
        prop = application.get("properties") or {}
        client = application.get("clients") or {}

        sale_price = float(prop.get("sale_price") or 0)
        purchase_price = float(prop.get("purchase_price") or 0)
        property_id = application.get("property_id")

        if sale_price <= 0:
            raise HTTPException(status_code=400, detail="La propiedad no tiene precio de venta")

        # 2. Fetch credit application
        credit_result = sb.table("credit_applications") \
            .select("*") \
            .eq("rto_application_id", application_id) \
            .execute()

        credit_app = credit_result.data[0] if credit_result.data else {}

        # 3. Fetch renovation cost
        renovation_cost = 0.0
        if property_id:
            reno_result = sb.table("renovations") \
                .select("total_cost") \
                .eq("property_id", property_id) \
                .execute()
            if reno_result.data:
                renovation_cost = float(reno_result.data[0].get("total_cost") or 0)

        total_investment = purchase_price + renovation_cost

        # 4. Client financials from credit_application
        monthly_income = float(credit_app.get("monthly_income") or 0)
        other_income_sources = credit_app.get("other_income_sources") or []
        other_income = sum(float(s.get("monthly_amount") or 0) for s in other_income_sources)
        total_income = monthly_income + other_income

        monthly_rent = float(credit_app.get("monthly_rent") or 0)
        monthly_utilities = float(credit_app.get("monthly_utilities") or 0)
        monthly_child_support = float(credit_app.get("monthly_child_support_paid") or 0)
        monthly_other_expenses = float(credit_app.get("monthly_other_expenses") or 0)
        debts = credit_app.get("debts") or []
        debts_total = sum(float(d.get("monthly_payment") or 0) for d in debts)

        total_expenses = monthly_rent + monthly_utilities + monthly_child_support + monthly_other_expenses + debts_total
        disposable_income = total_income - total_expenses
        payment_capacity_40pct = disposable_income * 0.40 if disposable_income > 0 else 0

        # 5. Down payment
        down_payment = float(application.get("desired_down_payment") or 0)
        if down_payment <= 0:
            down_payment = round(sale_price * 0.30, 2)
        down_payment_pct = round(down_payment / sale_price * 100, 1) if sale_price > 0 else 0

        finance_amount = sale_price - down_payment
        annual_rate = 0.24

        # 6. Predict future value
        fv_result = predict_future_value(
            sale_price=sale_price,
            term_months=application.get("desired_term_months") or 36,
            sqft=prop.get("sqft"),
            bedrooms=prop.get("bedrooms"),
            bathrooms=prop.get("bathrooms"),
            home_type=prop.get("type"),
        )

        # 7. Calculate scenarios for [24, 36, 48, 60] months
        term_options = [24, 36, 48, 60]
        scenarios = []
        recommended = None

        for term in term_options:
            total_interest = finance_amount * annual_rate * (term / 12)
            total_to_pay = finance_amount + total_interest
            monthly_payment = math.ceil(total_to_pay / term / 5) * 5  # round up to $5

            total_client_pays = down_payment + (monthly_payment * term)
            roi_maninos = ((total_client_pays - total_investment) / total_investment * 100) if total_investment > 0 else 0

            # Future value at end of this specific term
            fv_at_term = predict_future_value(
                sale_price=sale_price,
                term_months=term,
                sqft=prop.get("sqft"),
                bedrooms=prop.get("bedrooms"),
                bathrooms=prop.get("bathrooms"),
                home_type=prop.get("type"),
            )

            affordable = monthly_payment <= payment_capacity_40pct if payment_capacity_40pct > 0 else False
            dti_ratio = round(monthly_payment / total_income * 100, 1) if total_income > 0 else 0

            rent_difference = monthly_payment - monthly_rent
            rent_change_pct = round(rent_difference / monthly_rent * 100, 1) if monthly_rent > 0 else 0

            scenario = {
                "term_months": term,
                "monthly_payment": monthly_payment,
                "finance_amount": round(finance_amount, 2),
                "total_interest": round(total_interest, 2),
                "total_client_pays": round(total_client_pays, 2),
                "roi_maninos_pct": round(roi_maninos, 1),
                "future_value_at_end": fv_at_term["future_value"],
                "vs_current_rent": {
                    "difference": round(rent_difference, 2),
                    "change_pct": rent_change_pct,
                },
                "affordable": affordable,
                "dti_ratio": dti_ratio,
            }
            scenarios.append(scenario)

            # Find optimal: first affordable term, or the one closest to 40% capacity
            if recommended is None and affordable:
                recommended = {
                    "term_months": term,
                    "down_payment": round(down_payment, 2),
                    "down_payment_pct": down_payment_pct,
                    "monthly_payment": monthly_payment,
                    "total_client_pays": round(total_client_pays, 2),
                    "roi_maninos_pct": round(roi_maninos, 1),
                    "reason": f"Pago mensual ${monthly_payment} esta dentro del 40% del ingreso disponible (${payment_capacity_40pct:,.0f})",
                }

        # If no affordable scenario, recommend the longest term (lowest payment)
        if recommended is None and scenarios:
            longest = scenarios[-1]
            recommended = {
                "term_months": longest["term_months"],
                "down_payment": round(down_payment, 2),
                "down_payment_pct": down_payment_pct,
                "monthly_payment": longest["monthly_payment"],
                "total_client_pays": longest["total_client_pays"],
                "roi_maninos_pct": longest["roi_maninos_pct"],
                "reason": f"Ningún plazo es asequible al 40% del ingreso disponible. Se recomienda {longest['term_months']} meses por tener el pago más bajo (${longest['monthly_payment']})",
            }

        # 8. Risk assessment
        recommended_payment = recommended["monthly_payment"] if recommended else 0
        dti_ratio = round(recommended_payment / total_income * 100, 1) if total_income > 0 else 100

        risk_factors = []
        if dti_ratio > 50:
            risk_factors.append(f"DTI alto: {dti_ratio}% (limite recomendado 40%)")
        if disposable_income < recommended_payment:
            risk_factors.append(f"Ingreso disponible (${disposable_income:,.0f}) menor que pago mensual (${recommended_payment})")
        if down_payment_pct < 30:
            risk_factors.append(f"Enganche bajo: {down_payment_pct}% (minimo recomendado 30%)")
        if not credit_app:
            risk_factors.append("No se encontro aplicacion de credito — datos financieros incompletos")
        if total_income <= 0:
            risk_factors.append("No se reportaron ingresos")

        if len(risk_factors) == 0:
            risk_level = "low"
            risk_recommendation = "proceed"
        elif len(risk_factors) <= 2 and dti_ratio <= 50:
            risk_level = "medium"
            risk_recommendation = "caution"
        else:
            risk_level = "high"
            risk_recommendation = "reject"

        risk = {
            "level": risk_level,
            "factors": risk_factors,
            "dti_ratio": dti_ratio,
            "recommendation": risk_recommendation,
        }

        # 9. Smart Pricing — anchor to client's current rent
        # Logic: if the client pays $1,200 rent and formula says $900,
        # we can charge up to ~$1,080 (90% of rent) and the client
        # still feels like they're saving vs renting.
        smart_pricing = None
        if monthly_rent > 0 and recommended:
            base_payment = recommended["monthly_payment"]
            rec_term = recommended["term_months"]

            # Smart payment = 90% of current rent (client "saves" 10%)
            # But never below base (we don't lose money)
            # And never above 45% of total income (DTI safe)
            # And total client pays never exceeds 2x sale price (fair cap)
            smart_raw = monthly_rent * 0.90
            max_by_income = total_income * 0.45 if total_income > 0 else smart_raw
            # Cap: total payments (down + monthly * term) <= 2x sale price
            max_total = sale_price * 2.0
            max_by_fair_cap = (max_total - down_payment) / rec_term if rec_term > 0 else smart_raw
            smart_payment = math.ceil(min(max(smart_raw, base_payment), max_by_income, max_by_fair_cap) / 5) * 5

            if smart_payment > base_payment:
                extra_per_month = smart_payment - base_payment
                extra_total = extra_per_month * rec_term
                smart_total_client_pays = down_payment + (smart_payment * rec_term)
                smart_roi = ((smart_total_client_pays - total_investment) / total_investment * 100) if total_investment > 0 else 0
                smart_dti = round(smart_payment / total_income * 100, 1) if total_income > 0 else 0

                # How much client "saves" vs current rent
                savings_vs_rent = monthly_rent - smart_payment
                savings_pct = round(savings_vs_rent / monthly_rent * 100, 1) if monthly_rent > 0 else 0

                smart_pricing = {
                    "base_payment": base_payment,
                    "smart_payment": smart_payment,
                    "current_rent": monthly_rent,
                    "extra_per_month": extra_per_month,
                    "extra_total_over_term": round(extra_total, 2),
                    "smart_total_client_pays": round(smart_total_client_pays, 2),
                    "smart_roi_pct": round(smart_roi, 1),
                    "smart_dti": smart_dti,
                    "client_saves_vs_rent": round(savings_vs_rent, 2),
                    "client_saves_pct": savings_pct,
                    "term_months": rec_term,
                    "explanation": (
                        f"El cliente paga ${monthly_rent:,.0f}/mes de renta. "
                        f"La formula estándar da ${base_payment:,.0f}/mes. "
                        f"Con precio inteligente: ${smart_payment:,.0f}/mes "
                        f"(el cliente ahorra {savings_pct:.0f}% vs su renta actual "
                        f"y Maninos gana ${extra_total:,.0f} extra en {rec_term} meses)."
                    ),
                }

        # 10. Maninos summary
        rec_total_client_pays = recommended["total_client_pays"] if recommended else 0
        net_profit = rec_total_client_pays - total_investment
        roi_pct = round(net_profit / total_investment * 100, 1) if total_investment > 0 else 0
        financing_return = rec_total_client_pays - sale_price if recommended else 0
        asset_return = sale_price - total_investment

        maninos_summary = {
            "total_investment": round(total_investment, 2),
            "total_income_recommended": round(rec_total_client_pays, 2),
            "net_profit": round(net_profit, 2),
            "roi_pct": roi_pct,
            "financing_return": round(financing_return, 2),
            "asset_return": round(asset_return, 2),
        }

        # Future value block for recommended term
        rec_term = recommended["term_months"] if recommended else 36
        fv_rec = predict_future_value(
            sale_price=sale_price,
            term_months=rec_term,
            sqft=prop.get("sqft"),
            bedrooms=prop.get("bedrooms"),
            bathrooms=prop.get("bathrooms"),
            home_type=prop.get("type"),
        )

        return {
            "ok": True,
            "calculation": {
                "property": {
                    "address": prop.get("address"),
                    "sale_price": sale_price,
                    "purchase_price": purchase_price,
                    "renovation_cost": renovation_cost,
                    "total_investment": round(total_investment, 2),
                    "sqft": prop.get("sqft"),
                    "bedrooms": prop.get("bedrooms"),
                    "type": prop.get("type"),
                },
                "client": {
                    "name": client.get("name"),
                    "monthly_income": monthly_income,
                    "other_income": other_income,
                    "total_income": total_income,
                    "current_rent": monthly_rent,
                    "total_expenses": round(total_expenses, 2),
                    "disposable_income": round(disposable_income, 2),
                    "payment_capacity_40pct": round(payment_capacity_40pct, 2),
                },
                "future_value": {
                    "current_market_value": fv_rec["current_market_value"],
                    "at_end_of_recommended_term": fv_rec["future_value"],
                    "depreciation_rate_annual": fv_rec["annual_depreciation_rate"],
                    "total_depreciation_pct": fv_rec["total_depreciation_pct"],
                    "confidence": fv_rec["confidence"],
                    "similar_houses": fv_rec["similar_houses"],
                },
                "recommended": recommended,
                "smart_pricing": smart_pricing,
                "scenarios": scenarios,
                "risk": risk,
                "maninos_summary": maninos_summary,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating RTO for application {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{application_id}/pay-homes")
async def pay_homes(application_id: str):
    """
    Capital confirms payment to Homes for the financed portion.
    This is a manual step after approving the RTO application.
    Records the payment in both Homes and Capital accounting.
    """
    try:
        app_result = sb.table("rto_applications") \
            .select("*, sales(*), properties(id, address), clients(id, name)") \
            .eq("id", application_id) \
            .single() \
            .execute()

        if not app_result.data:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")

        application = app_result.data
        sale = application.get("sales") or {}

        if application["status"] != "approved":
            raise HTTPException(status_code=400, detail="La solicitud debe estar aprobada primero")

        if sale.get("capital_payment_status") == "paid":
            raise HTTPException(status_code=400, detail="El pago a Homes ya fue registrado")

        remaining = float(sale.get("financed_remaining") or 0)
        if remaining <= 0:
            remaining = float(sale.get("sale_price", 0)) - float(sale.get("financed_down_payment") or sale.get("rto_down_payment") or 0)

        if remaining <= 0:
            raise HTTPException(status_code=400, detail="No hay monto pendiente de pagar a Homes")

        prop = application.get("properties") or {}
        client = application.get("clients") or {}
        prop_addr = prop.get("address", "Propiedad")
        client_name = client.get("name", "Cliente")

        # 1. Update sale: capital_payment_status → paid
        sb.table("sales").update({
            "capital_payment_status": "paid",
            "capital_payment_date": datetime.utcnow().isoformat(),
        }).eq("id", application["sale_id"]).execute()

        # 2. Homes accounting: income from Capital
        sb.table("accounting_transactions").insert({
            "property_id": application.get("property_id"),
            "transaction_type": "capital_purchase",
            "category": "income",
            "is_income": True,
            "amount": remaining,
            "description": f"Capital paga porción financiada — {prop_addr}",
            "counterparty_name": "Maninos Capital LLC",
            "entity_type": "sale",
            "entity_id": application.get("sale_id"),
            "status": "confirmed",
            "date": datetime.utcnow().date().isoformat(),
        }).execute()

        # 3. Capital accounting: outflow to Homes
        sb.table("capital_transactions").insert({
            "property_id": application.get("property_id"),
            "txn_type": "acquisition",
            "is_income": False,
            "amount": remaining,
            "description": f"Pago a Homes por financiamiento — {prop_addr}",
            "counterparty": "Maninos Homes LLC",
            "status": "confirmed",
            "date": datetime.utcnow().date().isoformat(),
        }).execute()

        # 4. Notify Homes
        try:
            sb.table("notifications").insert({
                "type": "capital_payment_confirmed",
                "title": f"Capital pagó ${remaining:,.0f} — {prop_addr}",
                "message": (
                    f"Capital ha confirmado el pago de ${remaining:,.0f} a Homes por la venta financiada de {prop_addr}.\n"
                    f"Cliente: {client_name}\n"
                    f"Este ingreso ya está registrado en contabilidad."
                ),
                "category": "homes",
                "priority": "normal",
                "property_id": application.get("property_id"),
                "sale_id": application.get("sale_id"),
            }).execute()
        except Exception:
            pass

        logger.info(f"[capital] Payment ${remaining:,.2f} to Homes confirmed for application {application_id}")

        return {
            "ok": True,
            "amount": remaining,
            "message": f"Pago de ${remaining:,.0f} a Homes registrado exitosamente",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing pay-homes for {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

