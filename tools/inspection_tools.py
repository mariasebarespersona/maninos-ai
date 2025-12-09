# tools/inspection_tools.py
"""
Inspection tools for MANINOS AI mobile home acquisition process.
Handles inspection checklist generation and results storage.
"""
from typing import Dict, List, Optional
import logging
from .supabase_client import sb
from .numbers_tools import DEFECT_COSTS, calculate_repair_costs
from .property_tools import get_acquisition_stage, update_acquisition_stage

logger = logging.getLogger(__name__)

# Standard Maninos Inspection Checklist
MANINOS_INSPECTION_CHECKLIST = [
    {"category": "Roof", "key": "roof", "description": "Condition of roof, leaks, damage"},
    {"category": "HVAC", "key": "hvac", "description": "Heating, ventilation, air conditioning systems"},
    {"category": "Plumbing", "key": "plumbing", "description": "Pipes, water pressure, leaks"},
    {"category": "Electrical", "key": "electrical", "description": "Wiring, outlets, breaker box"},
    {"category": "Flooring", "key": "flooring", "description": "Carpet, tile, laminate condition"},
    {"category": "Windows", "key": "windows", "description": "Window condition, seals, operation"},
    {"category": "Skirting", "key": "skirting", "description": "Exterior skirting around base"},
    {"category": "Painting", "key": "painting", "description": "Interior/exterior paint condition"},
    {"category": "Appliances", "key": "appliances", "description": "Stove, fridge, washer, dryer"},
    {"category": "Deck", "key": "deck", "description": "Deck or porch structure and safety"},
]


def get_inspection_checklist() -> Dict:
    """
    Return the standard Maninos mobile home inspection checklist.
    
    Returns:
        Dict with checklist items and available defect costs
    """
    logger.info("[get_inspection_checklist] Returning standard Maninos checklist")
    return {
        "checklist": MANINOS_INSPECTION_CHECKLIST,
        "defect_costs": DEFECT_COSTS,
        "instructions": (
            "Inspecciona la mobile home y marca los defectos encontrados. "
            "Luego proporciona la lista de defectos (keys) y el estado del título."
        )
    }


def save_inspection_results(
    property_id: str,
    defects: List[str],
    title_status: str,
    notes: Optional[str] = None,
    created_by: Optional[str] = "agent"
) -> Dict:
    """
    Save inspection results to database and auto-calculate repair estimate.
    
    CRITICAL: This function validates that the property has passed the 70% rule
    (acquisition_stage must be 'passed_70_rule' or higher).
    
    Args:
        property_id: UUID of the property
        defects: List of defect keys (e.g., ["roof", "hvac", "plumbing"])
        title_status: One of "Clean/Blue", "Missing", "Lien", "Other"
        notes: Optional inspection notes
        created_by: Who created this inspection (default: "agent")
    
    Returns:
        Dict with inspection_id, repair_estimate, and saved data
    """
    logger.info(f"[save_inspection_results] Property {property_id[:8]}..., defects: {defects}, title: {title_status}")
    
    # VALIDATION: Check acquisition stage
    current_stage_dict = get_acquisition_stage(property_id)
    logger.info(f"[save_inspection_results] Current acquisition_stage: {current_stage_dict}")
    
    # Extract the actual stage value from the dict
    current_stage = current_stage_dict.get('acquisition_stage') if current_stage_dict else None
    
    if current_stage not in ['passed_70_rule', 'inspection_done', 'passed_80_rule']:
        error_msg = (
            f"❌ No se puede guardar la inspección. "
            f"La propiedad debe pasar primero la regla del 70% (stage actual: {current_stage}). "
            f"Usa 'calculate_maninos_deal' con asking_price y market_value primero."
        )
        logger.error(f"[save_inspection_results] {error_msg}")
        return {
            "ok": False,
            "error": "stage_validation_failed",
            "current_stage": current_stage,
            "message": error_msg
        }
    
    # Validate title_status
    valid_statuses = ["Clean/Blue", "Missing", "Lien", "Other"]
    if title_status not in valid_statuses:
        logger.warning(f"[save_inspection_results] Invalid title_status '{title_status}', using 'Other'")
        title_status = "Other"
    
    # Auto-calculate repair estimate using DEFECT_COSTS
    repair_calc = calculate_repair_costs(defects)
    repair_estimate = repair_calc.get("total_cost", 0)
    
    logger.info(f"[save_inspection_results] Calculated repair_estimate: ${repair_estimate} from defects: {defects}")
    
    # Insert into property_inspections table
    try:
        result = sb.table("property_inspections").insert({
            "property_id": property_id,
            "defects": defects,  # Postgres JSONB will handle the list
            "title_status": title_status,
            "repair_estimate": repair_estimate,
            "notes": notes,
            "created_by": created_by
        }).execute()
        
        inspection_record = result.data[0] if result.data else {}
        inspection_id = inspection_record.get("id")
        
        logger.info(f"✅ [save_inspection_results] Inspection saved: {inspection_id}")
        
        # Update the property table with latest inspection data AND stage
        sb.table("properties").update({
            "title_status": title_status,
            "repair_estimate": repair_estimate,
            "acquisition_stage": "inspection_done",  # CRITICAL: Update stage
            "updated_at": "NOW()"
        }).eq("id", property_id).execute()
        
        logger.info(f"✅ [save_inspection_results] Property updated with latest inspection data + stage → inspection_done")
        
        return {
            "ok": True,
            "inspection_id": inspection_id,
            "property_id": property_id,
            "defects": defects,
            "title_status": title_status,
            "repair_estimate": repair_estimate,
            "repair_breakdown": repair_calc.get("breakdown", {}),
            "acquisition_stage": "inspection_done",  # Added for test
            "created_at": inspection_record.get("created_at"),
            "message": f"Inspección guardada. Costo estimado de reparaciones: ${repair_estimate:,.2f}"
        }
    
    except Exception as e:
        logger.error(f"❌ [save_inspection_results] Error saving inspection: {e}", exc_info=True)
        return {
            "ok": False,
            "error": str(e),
            "message": f"Error al guardar inspección: {str(e)}"
        }


def get_inspection_history(property_id: str, limit: int = 10) -> List[Dict]:
    """
    Get inspection history for a property (most recent first).
    
    Args:
        property_id: UUID of the property
        limit: Max number of inspections to return (default: 10)
    
    Returns:
        List of inspection records
    """
    logger.info(f"[get_inspection_history] Fetching history for property {property_id[:8]}...")
    
    try:
        result = sb.table("property_inspections")\
            .select("*")\
            .eq("property_id", property_id)\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        
        inspections = result.data or []
        logger.info(f"[get_inspection_history] Found {len(inspections)} inspections")
        return inspections
    
    except Exception as e:
        logger.error(f"❌ [get_inspection_history] Error fetching history: {e}")
        return []


def get_latest_inspection(property_id: str) -> Optional[Dict]:
    """
    Get the most recent inspection for a property.
    
    Args:
        property_id: UUID of the property
    
    Returns:
        Latest inspection record or None
    """
    history = get_inspection_history(property_id, limit=1)
    return history[0] if history else None

