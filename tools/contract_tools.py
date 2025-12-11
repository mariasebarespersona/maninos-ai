"""
Contract Generation Tools for Maninos AI

Generates purchase contracts for mobile homes after acquisition analysis.
"""

from datetime import datetime
from typing import Dict, Optional


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
    missing = [f for f in required_fields if not property_data.get(f)]
    
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

    return {
        "ok": True,
        "contract_text": contract_text.strip(),
        "property_name": property_name,
        "purchase_price": asking_price,
        "total_investment": total_investment,
        "projected_profit": potential_profit,
        "roi": roi,
        "contract_date": contract_date,
        "status": "draft"
    }

