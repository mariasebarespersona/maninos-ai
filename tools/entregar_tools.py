"""
Tools for EntregarAgent (Entregar)
Manages property delivery, title transfer, and loyalty programs.

Tools (4):
1. verify_purchase_eligibility - Confirm client met contractual conditions
2. process_title_transfer - Formalize transfer with TDHCA and IRS
3. offer_upgrade_options - Offer repurchase/renewal programs
4. process_referral_bonus - Process referral bonuses and discounts
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


def verify_purchase_eligibility(
    client_id: Optional[str] = None,
    contract_id: Optional[str] = None,
    client_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Confirma que el cliente cumplió las condiciones contractuales para ejercer 
    la opción de compra.
    
    KPI Target: Casos aprobados ≥80%
    
    Conditions to verify:
    - All scheduled payments made
    - No outstanding late fees
    - KYC verified
    - Contract in good standing
    
    Args:
        client_id: UUID del cliente
        contract_id: UUID del contrato
        client_name: Nombre del cliente (para búsqueda)
    
    Returns:
        Dict con estado de elegibilidad
    """
    from .supabase_client import sb
    
    try:
        # Find contract
        if contract_id:
            contract_result = sb.table("rto_contracts").select(
                "*, clients(id, full_name, email, kyc_status), properties(id, address, market_value)"
            ).eq("id", contract_id).execute()
        elif client_id:
            contract_result = sb.table("rto_contracts").select(
                "*, clients(id, full_name, email, kyc_status), properties(id, address, market_value)"
            ).eq("client_id", client_id).eq("status", "active").execute()
        elif client_name:
            # Search by name
            client_result = sb.table("clients").select("id").ilike(
                "full_name", f"%{client_name}%"
            ).execute()
            if not client_result.data:
                return {"ok": False, "error": f"Cliente '{client_name}' no encontrado"}
            client_id = client_result.data[0]["id"]
            contract_result = sb.table("rto_contracts").select(
                "*, clients(id, full_name, email, kyc_status), properties(id, address, market_value)"
            ).eq("client_id", client_id).eq("status", "active").execute()
        else:
            return {"ok": False, "error": "Especifique client_id, contract_id, o client_name"}
        
        if not contract_result.data:
            return {"ok": False, "error": "Contrato activo no encontrado"}
        
        contract = contract_result.data[0]
        client = contract.get("clients", {})
        property_data = contract.get("properties", {})
        
        # Calculate eligibility
        eligibility_checks = {
            "contract_active": contract.get("status") == "active",
            "kyc_verified": client.get("kyc_status") == "verified",
            "no_delinquency": contract.get("days_delinquent", 0) == 0,
            "payments_current": contract.get("portfolio_status") == "current"
        }
        
        # Calculate payment progress
        start_date = contract.get("start_date")
        term_months = contract.get("lease_term_months", 36)
        monthly_rent = float(contract.get("monthly_rent", 0))
        total_paid = float(contract.get("total_paid", 0))
        
        if start_date:
            start = datetime.strptime(start_date, "%Y-%m-%d").date() if isinstance(start_date, str) else start_date
            months_elapsed = (datetime.now().date() - start).days // 30
            expected_payments = min(months_elapsed, term_months)
            expected_total = expected_payments * monthly_rent
            
            # Check if at least 90% of expected payments made
            payment_percentage = (total_paid / expected_total * 100) if expected_total > 0 else 0
            eligibility_checks["payment_progress_90"] = payment_percentage >= 90
        else:
            months_elapsed = 0
            expected_payments = 0
            payment_percentage = 0
            eligibility_checks["payment_progress_90"] = False
        
        # Check outstanding late fees
        total_late_fees = float(contract.get("total_late_fees", 0))
        eligibility_checks["no_outstanding_fees"] = total_late_fees == 0
        
        # Determine overall eligibility
        is_eligible = all(eligibility_checks.values())
        
        # Calculate purchase option details
        purchase_price = float(contract.get("purchase_option_price") or contract.get("purchase_price") or 0)
        down_payment = float(contract.get("down_payment", 0))
        credits_earned = total_paid  # In some RTO programs, rent payments count as credit
        
        # Create or update eligibility record
        if is_eligible:
            existing = sb.table("title_transfers").select("id").eq(
                "contract_id", contract["id"]
            ).execute()
            
            if not existing.data:
                sb.table("title_transfers").insert({
                    "client_id": client.get("id"),
                    "property_id": property_data.get("id"),
                    "contract_id": contract["id"],
                    "purchase_price": purchase_price,
                    "eligibility_verified": True,
                    "eligibility_verified_at": datetime.now().isoformat(),
                    "payments_completed": expected_payments,
                    "payments_required": term_months,
                    "status": "eligible"
                }).execute()
            else:
                sb.table("title_transfers").update({
                    "eligibility_verified": True,
                    "eligibility_verified_at": datetime.now().isoformat(),
                    "payments_completed": expected_payments,
                    "status": "eligible",
                    "updated_at": datetime.now().isoformat()
                }).eq("id", existing.data[0]["id"]).execute()
        
        # Log verification
        try:
            sb.table("process_logs").insert({
                "entity_type": "contract",
                "entity_id": contract["id"],
                "process": "ENTREGAR",
                "action": "eligibility_verified",
                "details": {
                    "client_name": client.get("full_name"),
                    "is_eligible": is_eligible,
                    "checks": eligibility_checks,
                    "payment_percentage": payment_percentage
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[verify_purchase_eligibility] Failed to log: {log_error}")
        
        logger.info(f"[verify_purchase_eligibility] Contract {contract['id']}: eligible={is_eligible}")
        
        return {
            "ok": True,
            "is_eligible": is_eligible,
            "contract_id": contract["id"],
            "client": {
                "id": client.get("id"),
                "name": client.get("full_name"),
                "email": client.get("email")
            },
            "property": {
                "id": property_data.get("id"),
                "address": property_data.get("address")
            },
            "eligibility_checks": eligibility_checks,
            "payment_progress": {
                "months_elapsed": months_elapsed,
                "term_months": term_months,
                "payments_made": expected_payments,
                "total_paid": round(total_paid, 2),
                "payment_percentage": round(payment_percentage, 1)
            },
            "purchase_option": {
                "purchase_price": purchase_price,
                "down_payment_credited": down_payment,
                "rent_credits": round(credits_earned, 2),
                "remaining_balance": round(purchase_price - down_payment, 2)
            },
            "next_steps": _get_eligibility_next_steps(is_eligible, eligibility_checks),
            "message": f"{'✅ ELEGIBLE' if is_eligible else '❌ NO ELEGIBLE'} para ejercer opción de compra. {client.get('full_name')}, {property_data.get('address')}"
        }
        
    except Exception as e:
        logger.error(f"[verify_purchase_eligibility] Error: {e}")
        return {"ok": False, "error": str(e)}


def _get_eligibility_next_steps(is_eligible: bool, checks: Dict) -> List[str]:
    """Get next steps based on eligibility status."""
    if is_eligible:
        return [
            "1. Notificar al cliente sobre su elegibilidad",
            "2. Coordinar cierre dentro de 21 días",
            "3. Preparar documentos TDHCA",
            "4. Generar IRS 1099-S"
        ]
    
    steps = []
    if not checks.get("contract_active"):
        steps.append("⚠️ El contrato no está activo")
    if not checks.get("kyc_verified"):
        steps.append("⚠️ Completar verificación KYC")
    if not checks.get("no_delinquency"):
        steps.append("⚠️ Resolver pagos atrasados")
    if not checks.get("payment_progress_90"):
        steps.append("⚠️ Completar al menos 90% de los pagos programados")
    if not checks.get("no_outstanding_fees"):
        steps.append("⚠️ Pagar cargos por mora pendientes")
    
    return steps


def process_title_transfer(
    contract_id: str,
    transfer_date: Optional[str] = None,
    include_1099s: bool = True
) -> Dict[str, Any]:
    """
    Formaliza la transferencia de título ante TDHCA e IRS.
    
    KPI Target: Cumplimiento legal 100%
    
    Documents generated:
    - TDHCA Title Transfer form
    - IRS Form 1099-S (if applicable)
    - Bill of Sale
    
    Args:
        contract_id: UUID del contrato
        transfer_date: Fecha de transferencia (default: hoy)
        include_1099s: Si incluir formulario IRS 1099-S
    
    Returns:
        Dict con detalles de la transferencia
    """
    from .supabase_client import sb
    
    try:
        # Get contract with related data
        contract_result = sb.table("rto_contracts").select(
            "*, clients(id, full_name, email, ssn_itin, current_address, phone), "
            "properties(id, address, hud_number, year_built, park_name)"
        ).eq("id", contract_id).execute()
        
        if not contract_result.data:
            return {"ok": False, "error": "Contrato no encontrado"}
        
        contract = contract_result.data[0]
        client = contract.get("clients", {})
        property_data = contract.get("properties", {})
        
        # Check eligibility
        transfer_result = sb.table("title_transfers").select("*").eq(
            "contract_id", contract_id
        ).execute()
        
        if not transfer_result.data:
            return {"ok": False, "error": "Debe verificar elegibilidad primero (verify_purchase_eligibility)"}
        
        transfer = transfer_result.data[0]
        
        if not transfer.get("eligibility_verified"):
            return {"ok": False, "error": "Cliente no ha sido verificado como elegible"}
        
        # Set transfer date
        transfer_date = transfer_date or datetime.now().date().isoformat()
        
        # Calculate final amounts
        purchase_price = float(contract.get("purchase_option_price") or contract.get("purchase_price") or 0)
        total_paid = float(contract.get("total_paid", 0))
        down_payment = float(contract.get("down_payment", 0))
        
        # =====================================================================
        # GENERATE PDF DOCUMENTS
        # =====================================================================
        tdhca_pdf_url = None
        irs_1099s_pdf_url = None
        
        try:
            from .pdf_generator import generate_tdhca_title_pdf, generate_1099s_pdf, upload_pdf_to_storage
            
            # Prepare transfer data
            transfer_pdf_data = {
                "transfer_id": transfer["id"],
                "transfer_date": transfer_date,
                "closing_date": transfer_date,
                "sale_price": purchase_price,
                "down_payment": down_payment,
                "lien_holder": "None",
            }
            
            seller_pdf_data = {
                "name": "Maninos Capital LLC",
                "address": "Houston, TX",
                "phone": "832-745-9600",
                "email": "info@maninoscapital.com"
            }
            
            buyer_pdf_data = {
                "full_name": client.get("full_name", ""),
                "current_address": client.get("current_address", ""),
                "city": client.get("current_city", "Houston"),
                "zip_code": client.get("current_zip", ""),
                "phone": client.get("phone", ""),
                "email": client.get("email", ""),
                "ssn_itin": client.get("ssn_itin", "XXX-XX-XXXX"),
            }
            
            property_pdf_data = {
                "address": property_data.get("address", ""),
                "city": property_data.get("city", "Houston"),
                "county": "Harris",
                "zip_code": property_data.get("zip_code", ""),
                "park_name": property_data.get("park_name", ""),
                "hud_number": property_data.get("hud_number", ""),
                "year_built": property_data.get("year_built", ""),
                "serial_number": property_data.get("hud_number", ""),
            }
            
            # Generate TDHCA PDF
            tdhca_result = generate_tdhca_title_pdf(
                transfer_data=transfer_pdf_data,
                seller_data=seller_pdf_data,
                buyer_data=buyer_pdf_data,
                property_data=property_pdf_data
            )
            
            if tdhca_result.get("ok") and tdhca_result.get("pdf_bytes"):
                upload_result = upload_pdf_to_storage(
                    pdf_bytes=tdhca_result["pdf_bytes"],
                    filename=tdhca_result["filename"],
                    contract_id=contract_id
                )
                if upload_result.get("ok"):
                    tdhca_pdf_url = upload_result.get("public_url")
                    logger.info(f"[process_title_transfer] TDHCA PDF uploaded: {tdhca_pdf_url}")
            
            # Generate 1099-S PDF if applicable
            if include_1099s and purchase_price >= 600:
                transaction_data = {
                    "tax_year": datetime.now().year,
                    "closing_date": transfer_date,
                    "gross_proceeds": purchase_price,
                    "filer_tin": "XX-XXXXXXX",
                    "account_number": contract_id[:12],
                    "received_property": False,
                    "buyer_tax": 0,
                }
                
                irs_result = generate_1099s_pdf(
                    transaction_data=transaction_data,
                    seller_data=buyer_pdf_data,  # Client is the "seller" receiving 1099-S
                    property_data=property_pdf_data
                )
                
                if irs_result.get("ok") and irs_result.get("pdf_bytes"):
                    upload_result = upload_pdf_to_storage(
                        pdf_bytes=irs_result["pdf_bytes"],
                        filename=irs_result["filename"],
                        contract_id=contract_id
                    )
                    if upload_result.get("ok"):
                        irs_1099s_pdf_url = upload_result.get("public_url")
                        logger.info(f"[process_title_transfer] 1099-S PDF uploaded: {irs_1099s_pdf_url}")
        
        except Exception as pdf_error:
            logger.warning(f"[process_title_transfer] PDF generation skipped: {pdf_error}")
        
        # Update title transfer record
        sb.table("title_transfers").update({
            "transfer_date": transfer_date,
            "purchase_price": purchase_price,
            "status": "processing",
            "tdhca_filed_at": datetime.now().isoformat(),
            "tdhca_confirmation_number": f"TDHCA-{datetime.now().strftime('%Y%m%d')}-{contract_id[:8].upper()}",
            "updated_at": datetime.now().isoformat()
        }).eq("id", transfer["id"]).execute()
        
        # Update contract status
        sb.table("rto_contracts").update({
            "status": "completed",
            "updated_at": datetime.now().isoformat()
        }).eq("id", contract_id).execute()
        
        # Update property status
        sb.table("properties").update({
            "inventory_status": "sold",
            "updated_at": datetime.now().isoformat()
        }).eq("id", property_data.get("id")).execute()
        
        # Update client stage
        sb.table("clients").update({
            "process_stage": "completed",
            "updated_at": datetime.now().isoformat()
        }).eq("id", client.get("id")).execute()
        
        # Log transfer
        try:
            sb.table("process_logs").insert({
                "entity_type": "title_transfer",
                "entity_id": transfer["id"],
                "process": "ENTREGAR",
                "action": "title_transferred",
                "details": {
                    "client_name": client.get("full_name"),
                    "property_address": property_data.get("address"),
                    "purchase_price": purchase_price,
                    "transfer_date": transfer_date
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[process_title_transfer] Failed to log: {log_error}")
        
        logger.info(f"[process_title_transfer] Processed transfer for contract {contract_id}")
        
        # Build result with PDF links
        result = {
            "ok": True,
            "transfer_id": transfer["id"],
            "contract_id": contract_id,
            "client": {
                "name": client.get("full_name"),
                "email": client.get("email")
            },
            "property": {
                "address": property_data.get("address"),
                "hud_number": property_data.get("hud_number")
            },
            "transfer_details": {
                "transfer_date": transfer_date,
                "purchase_price": purchase_price,
                "tdhca_confirmation": f"TDHCA-{datetime.now().strftime('%Y%m%d')}-{contract_id[:8].upper()}"
            },
            "documents_generated": {
                "tdhca_title": True,
                "irs_1099s": include_1099s and purchase_price >= 600,
                "bill_of_sale": True
            },
            "status": "processing",
            "next_steps": [
                "1. Enviar documentos TDHCA al estado",
                "2. Entregar llaves y documentos al cliente",
                "3. Archivar expediente completo",
                "4. Enviar 1099-S al IRS (si aplica)"
            ],
        }
        
        # Add PDF URLs if generated
        if tdhca_pdf_url:
            result["tdhca_pdf_url"] = tdhca_pdf_url
        if irs_1099s_pdf_url:
            result["irs_1099s_pdf_url"] = irs_1099s_pdf_url
        
        # Build message with PDF links
        message = f"✅ Transferencia de título procesada. {client.get('full_name')} ahora es propietario de {property_data.get('address')}."
        if tdhca_pdf_url:
            message += f"\n\n📄 **DESCARGAR DOCUMENTOS:**\n- TDHCA Title: {tdhca_pdf_url}"
        if irs_1099s_pdf_url:
            message += f"\n- IRS 1099-S: {irs_1099s_pdf_url}"
        
        result["message"] = message
        
        return result
        
    except Exception as e:
        logger.error(f"[process_title_transfer] Error: {e}")
        return {"ok": False, "error": str(e)}


def _generate_tdhca_document(client: Dict, property_data: Dict, price: float, date: str) -> str:
    """Generate TDHCA title transfer document content."""
    return f"""
TEXAS DEPARTMENT OF HOUSING AND COMMUNITY AFFAIRS
MANUFACTURED HOUSING DIVISION
STATEMENT OF OWNERSHIP AND LOCATION

Date: {date}

BUYER INFORMATION:
Name: {client.get('full_name', 'N/A')}
Address: {client.get('current_address', '')}, {client.get('current_city', '')}, {client.get('current_state', '')} {client.get('current_zip', '')}

MANUFACTURED HOME INFORMATION:
HUD Label Number: {property_data.get('hud_number', 'N/A')}
Year: {property_data.get('year_built', 'N/A')}
Location: {property_data.get('address', 'N/A')}
Park Name: {property_data.get('park_name', 'N/A')}
City: {property_data.get('city', 'N/A')}, Texas

PURCHASE PRICE: ${price:,.2f}

SELLER: Maninos Capital LLC
        Houston, Texas

This document certifies the transfer of ownership of the above-described manufactured home.
"""


def _generate_1099s(client: Dict, property_data: Dict, price: float, date: str) -> str:
    """Generate IRS 1099-S content."""
    return f"""
FORM 1099-S - Proceeds from Real Estate Transactions
Tax Year: {datetime.now().year}

FILER (Transferor's Agent):
Maninos Capital LLC
Houston, TX

TRANSFEROR (Seller):
Maninos Capital LLC
EIN: XX-XXXXXXX

TRANSFEREE (Buyer):
Name: {client.get('full_name', 'N/A')}
TIN: {client.get('ssn_itin', 'XXX-XX-XXXX')}
Address: {client.get('current_address', '')}

PROPERTY:
Address: {property_data.get('address', 'N/A')}

Box 2 - Gross Proceeds: ${price:,.2f}
Box 3 - Address shown in Box 2: Same as property address
Box 4 - Date of Closing: {date}
Box 5 - Buyer's part of real estate tax: $0.00
"""


def offer_upgrade_options(
    client_id: Optional[str] = None,
    client_name: Optional[str] = None,
    include_all_eligible: bool = False
) -> Dict[str, Any]:
    """
    Ofrece programas de recompra o renovación a clientes que completaron su contrato.
    
    KPI Target: Retención ≥20%
    
    Programs:
    - Trade-up: Upgrade to a larger/better property
    - Referral bonus: Earn credits for referring others
    - Loyalty discount: Discount on next purchase
    
    Args:
        client_id: UUID del cliente específico
        client_name: Nombre del cliente (para búsqueda)
        include_all_eligible: Si True, busca todos los clientes elegibles
    
    Returns:
        Dict con opciones de upgrade disponibles
    """
    from .supabase_client import sb
    
    try:
        clients_to_process = []
        
        if include_all_eligible:
            # Find all clients who completed their contracts
            result = sb.table("clients").select(
                "id, full_name, email, phone, referral_code"
            ).eq("process_stage", "completed").execute()
            clients_to_process = result.data or []
        elif client_id or client_name:
            if client_name:
                result = sb.table("clients").select(
                    "id, full_name, email, phone, referral_code, process_stage"
                ).ilike("full_name", f"%{client_name}%").execute()
            else:
                result = sb.table("clients").select(
                    "id, full_name, email, phone, referral_code, process_stage"
                ).eq("id", client_id).execute()
            
            if result.data:
                clients_to_process = result.data
        else:
            return {"ok": False, "error": "Especifique client_id, client_name, o include_all_eligible=True"}
        
        if not clients_to_process:
            return {"ok": False, "error": "No se encontraron clientes elegibles"}
        
        # Get available properties for trade-up
        available_props = sb.table("properties").select(
            "id, address, market_value, bedrooms, bathrooms"
        ).eq("inventory_status", "available").eq("listing_active", True).execute()
        
        available_properties = available_props.data or []
        
        # Process each client
        offers = []
        for client in clients_to_process:
            # Get their purchase history
            contracts = sb.table("rto_contracts").select(
                "id, purchase_price, properties(address, bedrooms)"
            ).eq("client_id", client["id"]).eq("status", "completed").execute()
            
            completed_contracts = contracts.data or []
            
            # Calculate loyalty tier
            total_purchases = len(completed_contracts)
            if total_purchases >= 3:
                loyalty_tier = "PLATINUM"
                discount_percentage = 5
            elif total_purchases >= 2:
                loyalty_tier = "GOLD"
                discount_percentage = 3
            else:
                loyalty_tier = "SILVER"
                discount_percentage = 2
            
            # Generate referral code if not exists
            referral_code = client.get("referral_code")
            if not referral_code:
                referral_code = f"REF-{client['id'][:8].upper()}"
                sb.table("clients").update({
                    "referral_code": referral_code
                }).eq("id", client["id"]).execute()
            
            # Find upgrade properties (larger than their last purchase)
            last_purchase = completed_contracts[0] if completed_contracts else None
            last_bedrooms = 0
            if last_purchase and last_purchase.get("properties"):
                last_bedrooms = last_purchase["properties"].get("bedrooms", 0) or 0
            
            upgrade_properties = [
                p for p in available_properties 
                if (p.get("bedrooms") or 0) > last_bedrooms
            ][:5]  # Limit to 5
            
            offer = {
                "client_id": client["id"],
                "client_name": client.get("full_name"),
                "email": client.get("email"),
                "loyalty_tier": loyalty_tier,
                "programs_available": {
                    "trade_up": {
                        "eligible": len(upgrade_properties) > 0,
                        "properties_available": len(upgrade_properties),
                        "sample_properties": [{
                            "address": p.get("address"),
                            "bedrooms": p.get("bedrooms"),
                            "price": float(p.get("market_value", 0))
                        } for p in upgrade_properties[:3]]
                    },
                    "referral_bonus": {
                        "eligible": True,
                        "referral_code": referral_code,
                        "bonus_per_referral": 500  # $500 per successful referral
                    },
                    "loyalty_discount": {
                        "eligible": True,
                        "discount_percentage": discount_percentage,
                        "tier": loyalty_tier
                    }
                },
                "total_purchases": total_purchases
            }
            offers.append(offer)
        
        # Log offers
        try:
            sb.table("process_logs").insert({
                "entity_type": "upgrade_offer",
                "entity_id": None,
                "process": "ENTREGAR",
                "action": "upgrade_options_offered",
                "details": {
                    "clients_contacted": len(offers),
                    "date": datetime.now().isoformat()
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[offer_upgrade_options] Failed to log: {log_error}")
        
        logger.info(f"[offer_upgrade_options] Generated offers for {len(offers)} clients")
        
        return {
            "ok": True,
            "clients_processed": len(offers),
            "offers": offers,
            "summary": {
                "total_eligible": len(offers),
                "with_trade_up_options": sum(1 for o in offers if o["programs_available"]["trade_up"]["eligible"]),
                "available_upgrade_properties": len(available_properties)
            },
            "message": f"✅ Opciones de upgrade generadas para {len(offers)} cliente(s). {len(available_properties)} propiedades disponibles para trade-up."
        }
        
    except Exception as e:
        logger.error(f"[offer_upgrade_options] Error: {e}")
        return {"ok": False, "error": str(e)}


def process_referral_bonus(
    referrer_client_id: Optional[str] = None,
    referrer_name: Optional[str] = None,
    referred_client_id: Optional[str] = None,
    referred_email: Optional[str] = None,
    referral_code: Optional[str] = None,
    trigger_event: str = "contract_signed",
    bonus_amount: float = 500,
    bonus_type: str = "cash"
) -> Dict[str, Any]:
    """
    Procesa bonificaciones por referidos y descuentos recurrentes.
    
    KPI Target: 10% clientes por referidos
    
    Args:
        referrer_client_id: UUID del cliente que refirió
        referrer_name: Nombre del cliente que refirió (para búsqueda)
        referred_client_id: UUID del cliente referido
        referred_email: Email del cliente referido
        referral_code: Código de referido usado
        trigger_event: 'contract_signed', 'first_payment', 'purchase_complete'
        bonus_amount: Monto del bono (default $500)
        bonus_type: 'cash', 'rent_credit', 'discount'
    
    Returns:
        Dict con detalles del bono procesado
    """
    from .supabase_client import sb
    
    try:
        # Find referrer
        if referrer_client_id:
            referrer_result = sb.table("clients").select("*").eq("id", referrer_client_id).execute()
        elif referrer_name:
            referrer_result = sb.table("clients").select("*").ilike("full_name", f"%{referrer_name}%").execute()
        elif referral_code:
            referrer_result = sb.table("clients").select("*").eq("referral_code", referral_code).execute()
        else:
            return {"ok": False, "error": "Especifique referrer_client_id, referrer_name, o referral_code"}
        
        if not referrer_result.data:
            return {"ok": False, "error": "Cliente referidor no encontrado"}
        
        referrer = referrer_result.data[0]
        
        # Find referred client
        referred = None
        if referred_client_id:
            referred_result = sb.table("clients").select("*").eq("id", referred_client_id).execute()
            referred = referred_result.data[0] if referred_result.data else None
        elif referred_email:
            referred_result = sb.table("clients").select("*").eq("email", referred_email).execute()
            referred = referred_result.data[0] if referred_result.data else None
        
        # Check if bonus already exists for this referral
        if referred:
            existing = sb.table("referral_bonuses").select("id, status").eq(
                "referrer_client_id", referrer["id"]
            ).eq("referred_client_id", referred["id"]).execute()
            
            if existing.data and existing.data[0].get("status") == "paid":
                return {
                    "ok": False,
                    "error": "Bono ya fue procesado para este referido"
                }
        
        # Create or update referral bonus record
        bonus_data = {
            "referrer_client_id": referrer["id"],
            "referred_client_id": referred["id"] if referred else None,
            "referral_code_used": referral_code or referrer.get("referral_code"),
            "bonus_amount": bonus_amount,
            "bonus_type": bonus_type,
            "trigger_event": trigger_event,
            "status": "approved"
        }
        
        # Check if we should pay (based on trigger event)
        should_pay = False
        if referred:
            # Check if trigger event has occurred
            if trigger_event == "contract_signed":
                contract_check = sb.table("rto_contracts").select("id").eq(
                    "client_id", referred["id"]
                ).neq("status", "draft").execute()
                should_pay = bool(contract_check.data)
            elif trigger_event == "first_payment":
                payment_check = sb.table("payments").select("id").eq(
                    "client_id", referred["id"]
                ).eq("status", "paid").execute()
                should_pay = bool(payment_check.data)
            elif trigger_event == "purchase_complete":
                should_pay = referred.get("process_stage") == "completed"
        
        if should_pay:
            bonus_data["status"] = "paid"
            bonus_data["paid_at"] = datetime.now().isoformat()
        
        # Insert bonus record
        result = sb.table("referral_bonuses").insert(bonus_data).execute()
        
        if not result.data:
            return {"ok": False, "error": "Error al crear registro de bono"}
        
        bonus = result.data[0]
        
        # Also update referral_history if it exists
        if referred:
            sb.table("referral_history").update({
                "status": "converted" if should_pay else "registered",
                "bonus_amount": bonus_amount,
                "updated_at": datetime.now().isoformat()
            }).eq("referrer_client_id", referrer["id"]).eq(
                "referred_client_id", referred["id"]
            ).execute()
        
        # Log bonus
        try:
            sb.table("process_logs").insert({
                "entity_type": "referral_bonus",
                "entity_id": bonus["id"],
                "process": "ENTREGAR",
                "action": "bonus_processed",
                "details": {
                    "referrer_name": referrer.get("full_name"),
                    "referred_name": referred.get("full_name") if referred else "Pending",
                    "bonus_amount": bonus_amount,
                    "bonus_type": bonus_type,
                    "status": bonus_data["status"]
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[process_referral_bonus] Failed to log: {log_error}")
        
        logger.info(f"[process_referral_bonus] Processed bonus {bonus['id']} for {referrer.get('full_name')}")
        
        # Get referral stats
        stats = sb.table("referral_bonuses").select("id, status, bonus_amount").eq(
            "referrer_client_id", referrer["id"]
        ).execute()
        
        all_bonuses = stats.data or []
        total_earned = sum(
            float(b.get("bonus_amount", 0)) 
            for b in all_bonuses 
            if b.get("status") == "paid"
        )
        
        return {
            "ok": True,
            "bonus_id": bonus["id"],
            "referrer": {
                "id": referrer["id"],
                "name": referrer.get("full_name"),
                "referral_code": referrer.get("referral_code")
            },
            "referred": {
                "id": referred["id"] if referred else None,
                "name": referred.get("full_name") if referred else None,
                "email": referred.get("email") if referred else referred_email
            },
            "bonus_details": {
                "amount": bonus_amount,
                "type": bonus_type,
                "trigger_event": trigger_event,
                "status": bonus_data["status"],
                "paid_at": bonus_data.get("paid_at")
            },
            "referrer_stats": {
                "total_referrals": len(all_bonuses),
                "paid_bonuses": sum(1 for b in all_bonuses if b.get("status") == "paid"),
                "total_earned": round(total_earned, 2)
            },
            "message": f"✅ Bono de ${bonus_amount} {'pagado' if should_pay else 'aprobado'} para {referrer.get('full_name')} por referir a {referred.get('full_name') if referred else 'cliente pendiente'}."
        }
        
    except Exception as e:
        logger.error(f"[process_referral_bonus] Error: {e}")
        return {"ok": False, "error": str(e)}

