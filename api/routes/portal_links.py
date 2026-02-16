"""
Portal Links API - Cross-portal connection endpoints.

Ensures data flows correctly between:
- Homes → Clientes (published properties appear in catalog)
- Homes → Capital (RTO sales create applications)
- Capital → Clientes (active RTO contracts visible in client portal)
- Capital → Homes (property status synced)
"""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# HOMES → CAPITAL: When employee creates RTO sale, ensure Capital has it
# =============================================================================

@router.post("/sync/homes-to-capital")
async def sync_homes_to_capital():
    """
    Sync RTO sales from Homes to Capital.
    
    Finds sales with sale_type='rto' that don't have an rto_application yet
    and creates one. This ensures the Capital portal has all RTO applications.
    """
    try:
        # Find RTO sales without applications
        rto_sales = sb.table("sales") \
            .select("id, property_id, client_id, sale_price, status") \
            .eq("sale_type", "rto") \
            .in_("status", ["pending", "rto_pending"]) \
            .execute()
        
        if not rto_sales.data:
            return {"ok": True, "synced": 0, "message": "No hay ventas RTO pendientes para sincronizar"}
        
        synced = 0
        for sale in rto_sales.data:
            # Check if application already exists
            existing = sb.table("rto_applications") \
                .select("id") \
                .eq("sale_id", sale["id"]) \
                .execute()
            
            if existing.data:
                continue  # Already has application
            
            # Create application in Capital
            sb.table("rto_applications").insert({
                "sale_id": sale["id"],
                "client_id": sale["client_id"],
                "property_id": sale["property_id"],
                "status": "submitted",
            }).execute()
            
            # Update client status
            sb.table("clients").update({
                "status": "rto_applicant",
            }).eq("id", sale["client_id"]).execute()
            
            synced += 1
            logger.info(f"[portal_links] Synced RTO sale {sale['id']} to Capital application")
        
        return {
            "ok": True,
            "synced": synced,
            "total_rto_sales": len(rto_sales.data),
            "message": f"Sincronizados {synced} solicitudes RTO a Capital",
        }
        
    except Exception as e:
        logger.error(f"[portal_links] Error syncing homes to capital: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CAPITAL → HOMES: Sync property status when Capital acts
# =============================================================================

@router.post("/sync/capital-to-homes")
async def sync_capital_to_homes():
    """
    Sync Capital actions back to Homes.
    
    - When an RTO application is rejected → re-publish property
    - When an RTO contract is active → mark property as sold (Capital bought it)
    - When an RTO contract is completed/delivered → ensure property is sold
    """
    try:
        synced = 0
        
        # 1. Rejected applications → re-publish property
        rejected_apps = sb.table("rto_applications") \
            .select("id, property_id, sale_id") \
            .eq("status", "rejected") \
            .execute()
        
        for app in (rejected_apps.data or []):
            # Check if the property is still in a state that should be changed
            # But only if the sale is actually cancelled (not just under review)
            sale = sb.table("sales") \
                .select("status") \
                .eq("id", app["sale_id"]) \
                .execute()
            
            sale_cancelled = sale.data and sale.data[0].get("status") == "cancelled"
            if not sale_cancelled:
                continue
            
            prop = sb.table("properties") \
                .select("status") \
                .eq("id", app["property_id"]) \
                .single() \
                .execute()
            
            if prop.data and prop.data["status"] not in ["published", "sold"]:
                sb.table("properties").update({
                    "status": "published",
                }).eq("id", app["property_id"]).execute()
                synced += 1
                logger.info(f"[portal_links] Property {app['property_id']} re-published (RTO rejected)")
        
        # 2. Active contracts → ensure property is sold (Capital has purchased from Homes)
        active_contracts = sb.table("rto_contracts") \
            .select("id, property_id, status") \
            .in_("status", ["active", "late"]) \
            .execute()
        
        for contract in (active_contracts.data or []):
            prop = sb.table("properties") \
                .select("status") \
                .eq("id", contract["property_id"]) \
                .single() \
                .execute()
            
            if prop.data and prop.data["status"] != "sold":
                sb.table("properties").update({
                    "status": "sold",
                }).eq("id", contract["property_id"]).execute()
                synced += 1
                logger.info(f"[portal_links] Property {contract['property_id']} marked SOLD (active RTO contract)")
        
        # 3. Delivered/completed contracts → ensure property is sold
        delivered = sb.table("rto_contracts") \
            .select("id, property_id, status") \
            .in_("status", ["completed", "delivered"]) \
            .execute()
        
        for contract in (delivered.data or []):
            prop = sb.table("properties") \
                .select("status") \
                .eq("id", contract["property_id"]) \
                .single() \
                .execute()
            
            if prop.data and prop.data["status"] != "sold":
                sb.table("properties").update({
                    "status": "sold",
                }).eq("id", contract["property_id"]).execute()
                synced += 1
        
        return {
            "ok": True,
            "synced": synced,
            "message": f"Sincronizados {synced} cambios de Capital a Homes",
        }
        
    except Exception as e:
        logger.error(f"[portal_links] Error syncing capital to homes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# PORTAL HEALTH: Verify all connections are consistent
# =============================================================================

@router.get("/health")
async def check_portal_health():
    """
    Check the health of cross-portal data connections.
    
    Verifies:
    1. All published properties are visible in client catalog
    2. All RTO sales have corresponding Capital applications
    3. All active RTO contracts have client portal access
    4. Data consistency across portals
    """
    try:
        issues = []
        stats = {}
        
        # 1. Properties in Homes → visible in Clientes
        published = sb.table("properties") \
            .select("id, address, status, sale_price") \
            .eq("status", "published") \
            .execute()
        
        published_with_price = [p for p in (published.data or []) if p.get("sale_price")]
        published_no_price = [p for p in (published.data or []) if not p.get("sale_price")]
        
        stats["homes_published"] = len(published.data or [])
        stats["clientes_catalog"] = len(published_with_price)
        
        if published_no_price:
            issues.append({
                "type": "warning",
                "portal": "Homes → Clientes",
                "message": f"{len(published_no_price)} propiedades publicadas sin precio de venta (no aparecen en catálogo)",
                "properties": [p["address"] for p in published_no_price],
            })
        
        # 2. RTO sales → Capital applications
        rto_sales = sb.table("sales") \
            .select("id, property_id, client_id, status") \
            .eq("sale_type", "rto") \
            .in_("status", ["pending", "rto_pending"]) \
            .execute()
        
        missing_apps = []
        for sale in (rto_sales.data or []):
            app = sb.table("rto_applications") \
                .select("id") \
                .eq("sale_id", sale["id"]) \
                .execute()
            if not app.data:
                missing_apps.append(sale["id"])
        
        stats["rto_sales_pending"] = len(rto_sales.data or [])
        stats["rto_missing_applications"] = len(missing_apps)
        
        if missing_apps:
            issues.append({
                "type": "error",
                "portal": "Homes → Capital",
                "message": f"{len(missing_apps)} ventas RTO sin solicitud en Capital",
                "sale_ids": missing_apps,
                "fix": "POST /api/portal-links/sync/homes-to-capital",
            })
        
        # 3. Active RTO contracts → Clientes access
        active_contracts = sb.table("rto_contracts") \
            .select("id, client_id, status") \
            .in_("status", ["active", "late"]) \
            .execute()
        
        contracts_with_email = 0
        for contract in (active_contracts.data or []):
            client = sb.table("clients") \
                .select("email") \
                .eq("id", contract["client_id"]) \
                .single() \
                .execute()
            if client.data and client.data.get("email"):
                contracts_with_email += 1
        
        stats["capital_active_contracts"] = len(active_contracts.data or [])
        stats["clientes_with_email"] = contracts_with_email
        
        no_email = len(active_contracts.data or []) - contracts_with_email
        if no_email > 0:
            issues.append({
                "type": "warning",
                "portal": "Capital → Clientes",
                "message": f"{no_email} clientes RTO activos sin email para acceso al portal",
            })
        
        # 4. Overall stats
        total_props = sb.table("properties").select("id", count="exact").execute()
        total_clients = sb.table("clients").select("id", count="exact").execute()
        total_sales = sb.table("sales").select("id", count="exact").execute()
        
        stats["total_properties"] = total_props.count or 0
        stats["total_clients"] = total_clients.count or 0
        stats["total_sales"] = total_sales.count or 0
        
        healthy = len([i for i in issues if i["type"] == "error"]) == 0
        
        return {
            "ok": True,
            "healthy": healthy,
            "issues_count": len(issues),
            "issues": issues,
            "stats": stats,
        }
        
    except Exception as e:
        logger.error(f"[portal_links] Error checking health: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# SYNC ALL: Run all sync operations
# =============================================================================

@router.post("/sync-all")
async def sync_all_portals():
    """Run all cross-portal sync operations."""
    results = {}
    
    try:
        # Sync Homes → Capital
        rto_result = await sync_homes_to_capital()
        results["homes_to_capital"] = rto_result
    except Exception as e:
        results["homes_to_capital"] = {"ok": False, "error": str(e)}
    
    try:
        # Sync Capital → Homes
        capital_result = await sync_capital_to_homes()
        results["capital_to_homes"] = capital_result
    except Exception as e:
        results["capital_to_homes"] = {"ok": False, "error": str(e)}
    
    # Check health after sync
    try:
        health = await check_portal_health()
        results["health"] = health
    except Exception as e:
        results["health"] = {"ok": False, "error": str(e)}
    
    return {
        "ok": True,
        "message": "Sincronización completa",
        "results": results,
    }

