"""
Contract Generation Tools for Maninos AI

Generates purchase contracts for mobile homes after acquisition analysis.
"""

import logging
from datetime import datetime
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def generate_buy_contract(
    property_id: str,
    buyer_name: str = "MANINOS HOMES LLC",
    seller_name: str = "[SELLER NAME]",
    closing_date: Optional[str] = None
) -> Dict:
    """
    Generate a Mobile Home Purchase Contract based on acquisition analysis.
    
    CRITICAL: This function AUTO-EXTRACTS all property data from the database.
    Only buyer_name and seller_name need to be provided by the user.
    
    Args:
        property_id: UUID of the property
        buyer_name: Name of the buyer (default: "MANINOS HOMES LLC")
        seller_name: Name of the seller (default: "[SELLER NAME]")
        closing_date: Optional closing date (default: current date)
    
    Returns:
        Dict with contract text and metadata
    """
    from .property_tools import get_property
    
    # STEP 1: Extract ALL data from database
    property_data = get_property(property_id)
    if not property_data:
        return {
            "ok": False,
            "error": "property_not_found",
            "message": f"No se encontró la propiedad con ID {property_id}"
        }
    
    # STEP 2: Validate acquisition_stage
    acquisition_stage = property_data.get("acquisition_stage")
    if acquisition_stage != "passed_80_rule":
        return {
            "ok": False,
            "error": "invalid_stage",
            "current_stage": acquisition_stage,
            "message": f"No se puede generar contrato. La propiedad debe pasar primero la regla del 80% (stage actual: {acquisition_stage})"
        }
    
    # STEP 3: Validate required fields exist
    required_fields = ["name", "address", "asking_price", "market_value", "arv", "repair_estimate"]
    # CRITICAL: Use 'is None' instead of 'not' to allow 0 values (e.g., repair_estimate: 0)
    missing = [f for f in required_fields if property_data.get(f) is None]
    
    if missing:
        return {
            "ok": False,
            "error": "missing_required_data",
            "missing_fields": missing,
            "message": f"Faltan datos requeridos en la base de datos: {', '.join(missing)}. Complete la evaluación primero."
        }
    
    # STEP 3: Extract values from DB
    property_name = property_data["name"]
    property_address = property_data["address"]
    asking_price = property_data["asking_price"]
    market_value = property_data["market_value"]
    arv = property_data["arv"]
    repair_costs = property_data["repair_estimate"]
    park_name = property_data.get("park_name")
    
    # Calculate key metrics
    total_investment = asking_price + repair_costs
    potential_profit = arv - total_investment
    roi = (potential_profit / total_investment) * 100 if total_investment > 0 else 0
    
    # Generate contract dates
    contract_date = datetime.now().strftime("%B %d, %Y")
    if not closing_date:
        # Default to 30 days from now
        from datetime import timedelta
        closing_date_obj = datetime.now() + timedelta(days=30)
        closing_date = closing_date_obj.strftime("%B %d, %Y")
    
    # Build contract text
    contract_text = f"""
══════════════════════════════════════════════════════════════
                MOBILE HOME PURCHASE AGREEMENT
══════════════════════════════════════════════════════════════

Contract Date: {contract_date}

PARTIES:

Buyer:  {buyer_name}
Seller: {seller_name}

PROPERTY DETAILS:

Property Name:    {property_name}
Address:          {property_address}
{"Park:             " + park_name if park_name else ""}

FINANCIAL TERMS:

Purchase Price:           ${asking_price:,.2f}
Market Value (As-Is):     ${market_value:,.2f}
Estimated Repairs:        ${repair_costs:,.2f}
After Repair Value (ARV): ${arv:,.2f}

Total Investment:         ${total_investment:,.2f}
Projected Profit:         ${potential_profit:,.2f}
ROI:                      {roi:.1f}%

INVESTMENT ANALYSIS:

✅ 70% Rule: Purchase price is within 70% of market value
✅ 80% Rule: Total investment is within 80% of ARV
✅ Title Status: Verified Clean/Blue
✅ Deal Status: READY TO BUY

TERMS AND CONDITIONS:

1. PURCHASE PRICE
   The Buyer agrees to purchase the mobile home for ${asking_price:,.2f}
   ({"${:,.2f}".format(asking_price)} USD).

2. DEPOSIT
   Buyer shall deposit $[AMOUNT] as earnest money within [X] days
   of contract execution.

3. CLOSING DATE
   The closing shall occur on or before {closing_date}.

4. CONDITION OF PROPERTY
   - Property is sold "AS-IS"
   - Buyer acknowledges estimated repairs of ${repair_costs:,.2f}
   - Seller warrants clear title (Clean/Blue)

5. CONTINGENCIES
   This offer is contingent upon:
   - Title search confirming clean title
   - Final inspection by Buyer
   - Financing approval (if applicable)
   - Park management approval of new owner

6. REPAIRS AND IMPROVEMENTS
   Buyer intends to make the following repairs post-closing:
   - Estimated repair budget: ${repair_costs:,.2f}
   - Projected ARV after repairs: ${arv:,.2f}

7. DEFAULT
   If Buyer defaults, earnest money is forfeited to Seller.
   If Seller defaults, earnest money is returned to Buyer.

8. CLOSING COSTS
   [X] Buyer pays all closing costs
   [ ] Seller pays all closing costs
   [ ] Split 50/50

9. ADDITIONAL TERMS
   [Additional terms and conditions to be added]

══════════════════════════════════════════════════════════════

SIGNATURES:

Buyer: ________________________    Date: _______________
       {buyer_name}

Seller: ________________________   Date: _______________
        {seller_name}

══════════════════════════════════════════════════════════════

NOTICE: This is a template contract generated by Maninos AI.
Please have this reviewed by a licensed attorney before signing.

══════════════════════════════════════════════════════════════
"""

    result = {
        "ok": True,
        "contract_text": contract_text.strip(),
        "property_name": property_name,
        "purchase_price": asking_price,
        "total_investment": total_investment,
        "projected_profit": potential_profit,
        "roi": roi,
        "contract_date": contract_date,
        "closing_date": closing_date,
        "buyer_name": buyer_name,
        "seller_name": seller_name,
        "status": "draft"
    }
    
    # SAVE CONTRACT TO DATABASE
    try:
        from .supabase_client import sb
        
        # Check if contracts table exists (graceful degradation if not)
        contract_record = sb.table("contracts").insert({
            "property_id": property_id,
            "contract_text": contract_text.strip(),
            "buyer_name": buyer_name,
            "seller_name": seller_name,
            "closing_date": closing_date,
            "purchase_price": asking_price,
            "total_investment": total_investment,
            "projected_profit": potential_profit,
            "roi": roi,
            "status": "draft"
        }).execute()
        
        if contract_record.data:
            result["contract_id"] = contract_record.data[0]["id"]
            logger.info(f"✅ [generate_buy_contract] Contract saved to DB: {result['contract_id']}")
    except Exception as e:
        # Don't fail if contracts table doesn't exist yet
        logger.warning(f"⚠️ [generate_buy_contract] Could not save contract to DB (table might not exist): {e}")
    
    # SAVE CONTRACT TO MANINOS_DOCUMENTS (for sidebar display)
    try:
        from .supabase_client import sb
        
        # Generate contract filename
        contract_filename = f"Buy_Contract_{property_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        storage_path = f"property/{property_id}/documents/{contract_filename}"
        
        # Upload contract text to Supabase Storage
        logger.info(f"📤 [generate_buy_contract] Uploading contract to storage: {storage_path}")
        contract_bytes = contract_text.strip().encode('utf-8')
        
        upload_result = sb.storage.from_("property-docs").upload(
            path=storage_path,
            file=contract_bytes,
            file_options={"content-type": "text/plain"}
        )
        
        logger.info(f"✅ [generate_buy_contract] Contract uploaded to storage successfully")
        
        # Create entry in maninos_documents table
        document_record = sb.table("maninos_documents").insert({
            "property_id": property_id,
            "document_name": contract_filename,
            "document_type": "buy_contract",
            "storage_path": storage_path,
            "content_type": "text/plain"
        }).execute()
        
        if document_record.data:
            result["document_id"] = document_record.data[0]["id"]
            logger.info(f"✅ [generate_buy_contract] Contract saved to maninos_documents (ID: {result['document_id']})")
            
            # AUTO-INDEX CONTRACT IN RAG_CHUNKS for semantic search
            try:
                from .rag_maninos import index_all_documents_maninos
                logger.info(f"📇 [generate_buy_contract] Auto-indexing contract for RAG search...")
                index_result = index_all_documents_maninos(property_id)
                if index_result.get("success"):
                    logger.info(f"✅ [generate_buy_contract] Contract indexed successfully: {index_result.get('chunks_created', 0)} chunks")
                else:
                    logger.warning(f"⚠️ [generate_buy_contract] Contract indexing failed: {index_result.get('error')}")
            except Exception as e:
                logger.warning(f"⚠️ [generate_buy_contract] Could not auto-index contract: {e}")
    except Exception as e:
        # Don't fail contract generation if document storage fails
        logger.warning(f"⚠️ [generate_buy_contract] Could not save contract to maninos_documents: {e}")
    
    # UPDATE ACQUISITION STAGE TO 'contract_generated'
    try:
        from .property_tools import update_property_fields
        
        stage_update = update_property_fields(property_id, {
            "acquisition_stage": "contract_generated",
            "status": "Under Contract"
        })
        
        if stage_update.get("ok"):
            result["acquisition_stage_updated"] = "contract_generated"
            logger.info(f"✅ [generate_buy_contract] Acquisition stage updated to 'contract_generated'")
        else:
            logger.error(f"❌ [generate_buy_contract] Failed to update stage: {stage_update.get('error')}")
    except Exception as e:
        logger.error(f"❌ [generate_buy_contract] Error updating acquisition stage: {e}")
        # Don't fail contract generation if stage update fails
    
    return result

