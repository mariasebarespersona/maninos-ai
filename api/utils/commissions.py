"""
Maninos Commission Rules — Single Source of Truth.

Updated Feb 2026 based on D1 Texas trip.

RULES:
- Cash sale: $1,500 total commission
- RTO sale: $1,000 total commission
- Split: found_by gets 50%, sold_by gets 50%
- If same person found AND sold = 100% of commission
- NO commission on purchases (only Gabriel buys)

FIELDS on sales table:
- found_by_employee_id: UUID of employee who found the client
- sold_by_employee_id: UUID of employee who closed the sale
- commission_amount: Total commission ($1,000 or $1,500)
- commission_found_by: Amount for found_by (50% or 100%)
- commission_sold_by: Amount for sold_by (50% or 0%)
"""

from decimal import Decimal
from typing import Optional, Tuple


# Commission amounts (confirmed Feb 2026)
COMMISSION_CASH = Decimal("1500.00")   # $1,500 for cash sales
COMMISSION_RTO = Decimal("1000.00")    # $1,000 for RTO sales
SPLIT_RATIO = Decimal("0.50")          # 50/50 split


def calculate_commission(
    sale_type: str,
    found_by_employee_id: Optional[str] = None,
    sold_by_employee_id: Optional[str] = None,
) -> dict:
    """
    Calculate commission for a sale.
    
    Returns dict with:
    - commission_amount: Total ($1,000 or $1,500)
    - commission_found_by: Amount for found_by employee
    - commission_sold_by: Amount for sold_by employee
    """
    # Determine total commission based on sale type
    if sale_type.lower() in ("contado", "cash"):
        total = COMMISSION_CASH
    elif sale_type.lower() in ("rto", "rent_to_own"):
        total = COMMISSION_RTO
    else:
        total = Decimal("0")
    
    # If no employees assigned, return total with no split
    if not found_by_employee_id and not sold_by_employee_id:
        return {
            "commission_amount": total,
            "commission_found_by": Decimal("0"),
            "commission_sold_by": Decimal("0"),
        }
    
    # Same person does both = 100%
    if found_by_employee_id and sold_by_employee_id and found_by_employee_id == sold_by_employee_id:
        return {
            "commission_amount": total,
            "commission_found_by": total,
            "commission_sold_by": Decimal("0"),  # Same person, counted under found_by
        }
    
    # Different people = 50/50 split
    found_amount = total * SPLIT_RATIO if found_by_employee_id else Decimal("0")
    sold_amount = total * SPLIT_RATIO if sold_by_employee_id else Decimal("0")
    
    # If only one is assigned, they get 100%
    if found_by_employee_id and not sold_by_employee_id:
        found_amount = total
    elif sold_by_employee_id and not found_by_employee_id:
        sold_amount = total
    
    return {
        "commission_amount": total,
        "commission_found_by": found_amount,
        "commission_sold_by": sold_amount,
    }

