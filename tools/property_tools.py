from __future__ import annotations
from typing import Optional, Dict, List
from .supabase_client import sb
from .utils import docs_schema, nums_schema, sum_schema
import logging

logger = logging.getLogger(__name__)


def add_property(name: str, address: str) -> Dict:
    """
    Create a new mobile home property for MANINOS AI.
    
    MANINOS: Simple property creation, no complex document frameworks.
    Just creates the property record with acquisition_stage='initial'.
    Documents are managed generically (upload/list/delete) without frameworks.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # MANINOS AI: Create property with initial acquisition stage
    r = sb.table("properties").insert({
        "name": name, 
        "address": address,
        "acquisition_stage": "initial"
    }).execute()
    
    if not r.data or len(r.data) == 0:
        logger.error(f"❌ Failed to create property: {name}")
        return {"ok": False, "error": "Failed to create property in database"}
    
    prop = r.data[0]
    property_id = prop["id"]
    
    logger.info(f"✅ Property created: {name} (ID: {property_id})")
    
    # NOTE: MANINOS doesn't use RAMA's complex document frameworks or Numbers templates
    # Documents are managed as simple files (upload/list/delete)
    # Numbers are calculated using simple tools (calculate_repair_costs, calculate_maninos_deal)
    
    return {"ok": True, "property": prop}


def list_frameworks(property_id: str) -> Dict:
    sid = property_id.replace("-", "")[:8]
    return {
        "documents_schema": f"prop_{sid}__documents_framework",
        "numbers_schema": f"prop_{sid}__numbers_framework",
        "summary_schema": f"prop_{sid}__framework_summary_property",
    }


# ---- Verification helpers ----

def get_property(property_id: str) -> Optional[Dict]:
    rows = (sb.table("properties").select("*").eq("id", property_id).limit(1).execute()).data
    return rows[0] if rows else None


def find_property(name: str, address: Optional[str] = None) -> Optional[Dict]:
    """
    Find a property by name and optionally address (case-insensitive).
    Uses ILIKE for flexible matching (e.g., "Ronda De" matches "Ronda de").
    
    Args:
        name: Property name (required)
        address: Property address (optional, for more specific search)
    """
    query = sb.table("properties").select("*").ilike("name", name)
    
    if address:
        query = query.ilike("address", address)
    
    rows = query.limit(1).execute().data
    return rows[0] if rows else None


def list_properties(limit: int = 20) -> List[Dict]:
    try:
        rows = (
            sb.table("properties")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        ).data
        # Filter out soft-deleted entries (prefixed name)
        return [r for r in (rows or []) if not str(r.get("name","")) .startswith("__DELETED__ ")]
    except Exception as e:
        import logging
        logging.error(f"Error listing properties: {e}")
        return []


def search_properties(query: str, limit: int = 5) -> List[Dict]:
    """Fuzzy search by name or address (case-insensitive + typo-tolerant).

    Strategy:
    1) Direct ilike match using PostgREST
    2) Word-wise ilike match for significant tokens
    3) Client-side fuzzy scoring across recent properties (handles minor typos like 'Demos'→'Demo')
    """
    try:
        import logging, unicodedata, re
        from difflib import SequenceMatcher
        logger = logging.getLogger(__name__)

        def norm(s: str) -> str:
            s = s or ""
            s = ''.join(c for c in unicodedata.normalize('NFKD', s) if unicodedata.category(c) != 'Mn')
            s = s.lower()
            s = re.sub(r"[^a-z0-9\s]", " ", s)
            s = re.sub(r"\s+", " ", s).strip()
            return s

        query_clean = (query or "").strip()
        if not query_clean:
            return []

        # Strategy 1: Direct pattern
        pattern = f"*{query_clean}*"
        results = (
            sb.table("properties")
            .select("id,name,address")
            .or_(f"name.ilike.{pattern},address.ilike.{pattern}")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        ).data
        if results:
            results = [r for r in results if not str(r.get("name","")) .startswith("__DELETED__ ")]
            if results:
                return results

        # Strategy 2: token-based ilike
        words = query_clean.split()
        if len(words) > 1:
            skip_words = {'la', 'el', 'de', 'en', 'a', 'con', 'propiedad', 'casa', 'finca'}
            for word in words:
                if word.lower() not in skip_words and len(word) >= 3:
                    pattern = f"*{word}*"
                    results = (
                        sb.table("properties")
                        .select("id,name,address")
                        .or_(f"name.ilike.{pattern},address.ilike.{pattern}")
                        .order("created_at", desc=True)
                        .limit(limit)
                        .execute()
                    ).data
                    if results:
                        results = [r for r in results if not str(r.get("name","")) .startswith("__DELETED__ ")]
                        if results:
                            return results

        # Strategy 3: client-side fuzzy scoring
        qn = norm(query_clean)
        digits = re.findall(r"\d+", qn)
        try:
            pool = (
                sb.table("properties")
                .select("id,name,address")
                .order("created_at", desc=True)
                .limit(200)
                .execute()
            ).data
        except Exception:
            pool = list_properties(limit=200)

        def score(row: Dict) -> float:
            cand = f"{row.get('name','')} {row.get('address','')}"
            cn = norm(cand)
            base = SequenceMatcher(None, qn, cn).ratio()  # 0..1
            # token overlap bonus
            qtokens = set(qn.split())
            ctokens = set(cn.split())
            if qtokens and ctokens:
                inter = len(qtokens & ctokens)
                base += 0.1 * (inter / max(1, len(qtokens)))
            # digit bonus: if query has a number present in candidate
            if digits:
                for d in digits:
                    if d in cn:
                        base += 0.1
                        break
            return base

        scored = sorted([(score(r), r) for r in (pool or [])], key=lambda x: x[0], reverse=True)
        top = [r for (s, r) in scored if s >= 0.5][:limit]
        top = [r for r in top if not str(r.get("name","")) .startswith("__DELETED__ ")]
        return top

    except Exception as e:
        import logging
        logging.error(f"Error searching properties: {e}")
        return []


# ---- Destructive operations ----
def delete_property(property_id: str, purge_docs_first: bool = True) -> Dict:
    """Delete a property by UUID (hard delete).

    Steps:
    - Optionally purge uploaded documents (storage + links) - DEFAULT: True (eliminar docs)
    - Delete the property from the database
    - Return {deleted: True}
    
    Args:
        property_id: UUID of the property to delete
        purge_docs_first: If True, delete associated documents. DEFAULT: True (eliminar todo)
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Purge files first (best-effort)
        if purge_docs_first:
            try:
                from .docs_tools import purge_property_documents
                logger.info(f"[delete_property] Purging documents for property {property_id}")
                purge_property_documents(property_id)
            except Exception as e:
                logger.warning(f"[delete_property] Failed to purge documents: {e}")

        # Fetch current name for logging
        row = (
            sb.table("properties").select("id,name,address").eq("id", property_id).limit(1).execute()
        ).data
        cur_name = (row[0]["name"] if row else "") or "(sin nombre)"
        
        # Hard delete from database
        try:
            result = sb.table("properties").delete().eq("id", property_id).execute()
            logger.info(f"[delete_property] ✅ Deleted property '{cur_name}' ({property_id})")
            return {"deleted": True, "property_id": property_id, "name": cur_name}
        except Exception as e:
            logger.error(f"[delete_property] ❌ Failed to delete property {property_id}: {e}")
            # Fallback to soft-delete if hard delete fails
            new_name = f"__DELETED__ {cur_name}"
            try:
                sb.table("properties").update({"name": new_name}).eq("id", property_id).execute()
                logger.info(f"[delete_property] ⚠️  Soft-deleted property '{cur_name}' (renamed to '{new_name}')")
                return {"deleted": True, "property_id": property_id, "name": cur_name, "soft_delete": True}
            except Exception as e2:
                import logging
                logging.error(f"Error deleting property {property_id}: {e2}")
                return {"deleted": False, "error": str(e2)}
        return {"deleted": True}
    except Exception as e:
        import logging
        logging.error(f"Error soft-deleting property {property_id}: {e}")
        return {"deleted": False, "error": str(e)}


def delete_properties(property_ids: List[str], purge_docs_first: bool = True) -> Dict:
    """Delete multiple properties (soft-delete) in sequence and return a per-id result.

    This function is resilient: it attempts all deletions and reports individual outcomes.
    It reuses delete_property for each id.
    Returns: {"results": [{"property_id": id, "deleted": bool, "error": optional}],
              "num_deleted": int}
    """
    results: List[Dict] = []
    num_deleted = 0
    for pid in (property_ids or []):
        try:
            out = delete_property(pid, purge_docs_first=purge_docs_first)
            ok = bool(out.get("deleted"))
            if ok:
                num_deleted += 1
            results.append({"property_id": pid, "deleted": ok, **({"error": out.get("error")} if out.get("error") else {})})
        except Exception as e:
            results.append({"property_id": pid, "deleted": False, "error": str(e)})
    return {"results": results, "num_deleted": num_deleted}


# ==================== ACQUISITION STAGE MANAGEMENT (MANINOS AI) ====================

def update_acquisition_stage(property_id: str, new_stage: str) -> Dict:
    """
    Update the acquisition_stage for a property.
    
    Valid stages:
    - 'initial': Property created
    - 'passed_70_rule': 70% rule passed, can proceed to inspection
    - 'inspection_done': Inspection saved
    - 'passed_80_rule': 80% rule passed, ready to buy
    - 'rejected': Deal rejected
    
    Args:
        property_id: UUID of the property
        new_stage: New stage value
    
    Returns:
        Dict with ok=True and updated stage, or error
    """
    valid_stages = ['initial', 'passed_70_rule', 'inspection_done', 'passed_80_rule', 'rejected']
    
    if new_stage not in valid_stages:
        logger.error(f"[update_acquisition_stage] Invalid stage: {new_stage}")
        return {"ok": False, "error": f"Invalid stage. Must be one of: {valid_stages}"}
    
    try:
        result = sb.table("properties").update({
            "acquisition_stage": new_stage,
            "updated_at": "NOW()"
        }).eq("id", property_id).execute()
        
        logger.info(f"✅ [update_acquisition_stage] Property {property_id[:8]}... → {new_stage}")
        return {
            "ok": True,
            "property_id": property_id,
            "acquisition_stage": new_stage
        }
    
    except Exception as e:
        logger.error(f"❌ [update_acquisition_stage] Error: {e}")
        return {"ok": False, "error": str(e)}


def get_acquisition_stage(property_id: str) -> Optional[Dict]:
    """
    Get current acquisition stage for a property.
    
    Returns:
        Dict with acquisition_stage or None if property not found
    """
    try:
        result = sb.table("properties").select("acquisition_stage").eq("id", property_id).execute()
        if result.data:
            return {"acquisition_stage": result.data[0].get("acquisition_stage")}
        return None
    except Exception as e:
        logger.error(f"❌ [get_acquisition_stage] Error: {e}")
        return None


def update_property_fields(property_id: str, fields: Dict) -> Dict:
    """
    Update multiple fields of a property at once.
    
    Args:
        property_id: UUID of the property
        fields: Dictionary of field_name: value pairs to update
    
    Returns:
        Dict with ok status and updated property data or error
    """
    try:
        # Add updated_at timestamp
        fields_copy = fields.copy()
        fields_copy["updated_at"] = "NOW()"
        
        r = sb.table("properties").update(fields_copy).eq("id", property_id).execute()
        
        if r.data and len(r.data) > 0:
            logger.info(f"✅ [update_property_fields] Updated property {property_id} with fields: {list(fields.keys())}")
            return {"ok": True, "property": r.data[0]}
        else:
            return {"ok": False, "error": "Property not found or no changes made"}
    except Exception as e:
        logger.error(f"❌ [update_property_fields] Error updating property {property_id}: {e}")
        return {"ok": False, "error": str(e)}
