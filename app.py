"""
MANINOS AI Backend - Clean Version

Cadena de Valor Maninos - 6 Macroprocesos:
- COMERCIALIZAR (transversal)
- ADQUIRIR
- INCORPORAR
- GESTIONAR_CARTERA (Semana 2)
- FONDEAR (Semana 2)
- ENTREGAR (Semana 2)
"""
from __future__ import annotations
import env_loader  # loads .env first (still needed for Railway compatibility)
import uuid
import json
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Typed configuration
from core.config import settings

# Structured logging
from core.logging import get_logger, bind_context, clear_context
logger = get_logger(__name__)

# Logfire: Observability (optional)
try:
    import logfire
    if settings.LOGFIRE_TOKEN:
        logfire.configure(
            token=settings.LOGFIRE_TOKEN,
            service_name="maninos-ai-backend",
            environment=settings.ENVIRONMENT,
        )
    else:
        logfire.configure(
            send_to_logfire=False,
            service_name="maninos-ai-backend",
            environment=settings.ENVIRONMENT,
        )
except Exception as e:
    logger.warning("logfire_disabled", error=str(e))

# Supabase client
from tools.supabase_client import sb

# ManinosGraph - Single LangGraph with shared memory across all agents
from agents.maninos_graph import process_message as maninos_process

# Intelligent Router (Data-Driven, Context-Aware)
from router.intelligent_router import IntelligentRouter

# Initialize FastAPI
app = FastAPI(
    title="MANINOS AI Backend",
    description="AI Platform for Maninos Capital LLC - Rent-to-Own Mobile Homes",
    version="2.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize agents and router
_agents = None
_router = None

def get_agents():
    """Lazy initialization of agents."""
    global _agents
    
    if _agents is None:
        _agents = {
            "ComercializarAgent": ComercializarAgent(),
            "AdquirirAgent": AdquirirAgent(),
            "IncorporarAgent": IncorporarAgent(),
            # Week 2 agents (placeholders for now)
            # "FondearAgent": FondearAgent(),
            # "GestionarCarteraAgent": GestionarCarteraAgent(),
            # "EntregarAgent": EntregarAgent(),
        }
        logger.info("[app] Agents initialized")
    
    return _agents

def get_router() -> IntelligentRouter:
    """Lazy initialization of intelligent router."""
    global _router
    
    if _router is None:
        _router = IntelligentRouter(sb)
        logger.info("[app] IntelligentRouter initialized")
    
    return _router


# ============================================================================
# HEALTH ENDPOINTS
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint."""
    return {"status": "ok", "app": "MANINOS AI Backend", "version": "2.0.0"}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "maninos-ai-backend"}


@app.get("/api/debug/session/{session_id}")
async def debug_session(session_id: str):
    """
    DEBUG ENDPOINT - Shows current session state.
    Useful for verifying that session context is being stored correctly.
    """
    router = get_router()
    session_state = router._get_session_state(session_id)
    cache_state = router._session_cache.get(session_id, {})
    
    return {
        "session_id": session_id,
        "session_state": session_state,
        "cache_state": cache_state,
        "all_cached_sessions": list(router._session_cache.keys())
    }


# ============================================================================
# CHAT ENDPOINT - Main AI Interface
# ============================================================================

@app.post("/api/chat")
async def chat(request: Request):
    """
    Main chat endpoint for AI interactions.
    
    Uses:
    1. IntelligentRouter for DATA-DRIVEN, CONTEXT-AWARE routing
    2. ManinosGraph - SINGLE LangGraph with SHARED MEMORY across all agents
    
    Principles (from Developer Bible):
    1. DATABASE AS SOURCE OF TRUTH - check entity state before routing
    2. CONTEXT-AWARE - same message means different things at different stages
    3. SESSION CONTINUITY - SHARED MEMORY preserves context across agent switches
    """
    try:
        body = await request.json()
        message = body.get("message", "")
        session_id = body.get("session_id", str(uuid.uuid4()))
        user_context = body.get("context", {})
        
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        
        # Bind session context for all subsequent logs
        bind_context(session_id=session_id)
        logger.info("chat_request_received", message_preview=message[:100])
        
        # Get router for process detection
        router = get_router()
        
        # =====================================================================
        # INTELLIGENT ROUTING (Data-Driven)
        # =====================================================================
        routing_decision = router.route(message, session_id, user_context)
        
        process = routing_decision["process"]
        confidence = routing_decision["confidence"]
        reason = routing_decision["reason"]
        routing_context = routing_decision.get("context", {})
        
        logger.info("routing_decision", process=process, confidence=confidence, reason=reason[:100] if reason else None)
        
        # =====================================================================
        # PROCESS WITH MANINOS GRAPH (Single LangGraph with Shared Memory)
        # =====================================================================
        # The ManinosGraph:
        # - Has ALL tools from all agents
        # - Uses SINGLE checkpointer (PostgresSaver)
        # - Preserves conversation history across agent/process switches
        # - Same thread_id = same conversation memory
        # =====================================================================
        
        enriched_context = {
            **user_context,
            "routing": routing_context,
        }
        
        result = maninos_process(
            user_input=message,
            session_id=session_id,
            process=process,
            context=enriched_context
        )
        
        return JSONResponse(content={
            "ok": result.get("ok", True),
            "response": result.get("response", "No response generated"),
            "agent": f"ManinosGraph-{process}",
            "process": process,
            "session_id": session_id,
            "routing": {
                "confidence": confidence,
                "reason": reason[:100] if reason else None
            }
        })
        
    except Exception as e:
        logger.error("chat_error", error=str(e), exc_info=True)
        clear_context()  # Clear session context on error
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": str(e)}
        )


# ============================================================================
# PROPERTIES API
# ============================================================================

@app.get("/api/properties")
async def list_properties():
    """List all properties in inventory."""
    try:
        result = sb.table("properties").select("*").order("created_at", desc=True).execute()
        return JSONResponse(content={"ok": True, "properties": result.data})
    except Exception as e:
        logger.error(f"[list_properties] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@app.get("/api/properties/{property_id}")
async def get_property(property_id: str):
    """Get a specific property."""
    try:
        result = sb.table("properties").select("*").eq("id", property_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Property not found")
        return JSONResponse(content={"ok": True, "property": result.data[0]})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get_property] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@app.delete("/api/properties/{property_id}")
async def delete_property(property_id: str):
    """
    Delete a property and ALL associated data from the database.
    
    Tables affected:
    - rto_contracts (cascades to payments)
    - payments (direct reference)
    - title_transfers
    - property_inspections
    - maninos_documents
    - rag_chunks
    - contracts (old table)
    - process_logs
    """
    try:
        # Check if property exists
        check = sb.table("properties").select("id, address").eq("id", property_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Property not found")
        
        property_address = check.data[0].get("address", "Unknown")
        logger.info(f"[delete_property] Starting deletion of property {property_id} ({property_address})")
        
        # 1. Delete title_transfers
        try:
            sb.table("title_transfers").delete().eq("property_id", property_id).execute()
        except Exception as e:
            logger.warning(f"[delete_property] title_transfers: {e}")
        
        # 2. Delete payments (direct reference)
        try:
            sb.table("payments").delete().eq("property_id", property_id).execute()
        except Exception as e:
            logger.warning(f"[delete_property] payments: {e}")
        
        # 3. Delete rto_contracts (will cascade)
        try:
            sb.table("rto_contracts").delete().eq("property_id", property_id).execute()
        except Exception as e:
            logger.warning(f"[delete_property] rto_contracts: {e}")
        
        # 4. Delete property_inspections (has CASCADE but explicit is safer)
        try:
            sb.table("property_inspections").delete().eq("property_id", property_id).execute()
        except Exception as e:
            logger.warning(f"[delete_property] property_inspections: {e}")
        
        # 5. Delete maninos_documents (has CASCADE but explicit is safer)
        try:
            sb.table("maninos_documents").delete().eq("property_id", property_id).execute()
        except Exception as e:
            logger.warning(f"[delete_property] maninos_documents: {e}")
        
        # 6. Delete rag_chunks (vector embeddings for RAG)
        try:
            sb.table("rag_chunks").delete().eq("property_id", property_id).execute()
        except Exception as e:
            logger.warning(f"[delete_property] rag_chunks: {e}")
        
        # 7. Delete old contracts table (if exists)
        try:
            sb.table("contracts").delete().eq("property_id", property_id).execute()
        except Exception as e:
            logger.warning(f"[delete_property] contracts: {e}")
        
        # 8. Delete process_logs
        try:
            sb.table("process_logs").delete().eq("entity_id", property_id).execute()
        except Exception as e:
            logger.warning(f"[delete_property] process_logs: {e}")
        
        # 9. Finally, delete the property
        sb.table("properties").delete().eq("id", property_id).execute()
        
        logger.info(f"[delete_property] Property {property_id} ({property_address}) deleted successfully with all associated data")
        return JSONResponse(content={"ok": True, "message": f"Propiedad '{property_address}' eliminada correctamente"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[delete_property] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


# ============================================================================
# CLIENTS API
# ============================================================================

@app.get("/api/clients")
async def list_clients():
    """List all clients."""
    try:
        result = sb.table("clients").select("*").order("created_at", desc=True).execute()
        return JSONResponse(content={"ok": True, "clients": result.data})
    except Exception as e:
        logger.error(f"[list_clients] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@app.get("/api/clients/{client_id}")
async def get_client(client_id: str):
    """Get a specific client."""
    try:
        result = sb.table("clients").select("*").eq("id", client_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Client not found")
        return JSONResponse(content={"ok": True, "client": result.data[0]})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[get_client] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


@app.delete("/api/clients/{client_id}")
async def delete_client(client_id: str):
    """
    Delete a client and ALL associated data from the database.
    
    Tables affected:
    - rto_contracts (cascades to payments)
    - payments
    - title_transfers
    - referral_bonuses (as referrer or referred)
    - referral_history (as referrer or referred)
    - process_logs
    - properties.assigned_client_id (cleared)
    - clients.referred_by_client_id (cleared for other clients)
    """
    try:
        # Check if client exists
        check = sb.table("clients").select("id, full_name").eq("id", client_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Client not found")
        
        client_name = check.data[0].get("full_name", "Unknown")
        logger.info(f"[delete_client] Starting deletion of client {client_id} ({client_name})")
        
        # 1. Delete title_transfers (references client_id)
        try:
            sb.table("title_transfers").delete().eq("client_id", client_id).execute()
        except Exception as e:
            logger.warning(f"[delete_client] title_transfers: {e}")
        
        # 2. Delete referral_bonuses (as referrer or referred)
        try:
            sb.table("referral_bonuses").delete().eq("referrer_client_id", client_id).execute()
            sb.table("referral_bonuses").delete().eq("referred_client_id", client_id).execute()
        except Exception as e:
            logger.warning(f"[delete_client] referral_bonuses: {e}")
        
        # 3. Delete referral_history (as referrer or referred)
        try:
            sb.table("referral_history").delete().eq("referrer_client_id", client_id).execute()
            sb.table("referral_history").delete().eq("referred_client_id", client_id).execute()
        except Exception as e:
            logger.warning(f"[delete_client] referral_history: {e}")
        
        # 4. Clear referred_by_client_id in other clients (break circular reference)
        try:
            sb.table("clients").update({"referred_by_client_id": None}).eq("referred_by_client_id", client_id).execute()
        except Exception as e:
            logger.warning(f"[delete_client] referred_by_client_id: {e}")
        
        # 5. Clear assigned_client_id in properties
        try:
            sb.table("properties").update({"assigned_client_id": None}).eq("assigned_client_id", client_id).execute()
        except Exception as e:
            logger.warning(f"[delete_client] assigned_client_id: {e}")
        
        # 6. Delete payments (explicit, even though rto_contracts has cascade)
        try:
            sb.table("payments").delete().eq("client_id", client_id).execute()
        except Exception as e:
            logger.warning(f"[delete_client] payments: {e}")
        
        # 7. Delete rto_contracts (will cascade to related data)
        try:
            sb.table("rto_contracts").delete().eq("client_id", client_id).execute()
        except Exception as e:
            logger.warning(f"[delete_client] rto_contracts: {e}")
        
        # 8. Delete process_logs
        try:
            sb.table("process_logs").delete().eq("entity_id", client_id).execute()
        except Exception as e:
            logger.warning(f"[delete_client] process_logs: {e}")
        
        # 9. Finally, delete the client
        sb.table("clients").delete().eq("id", client_id).execute()
        
        logger.info(f"[delete_client] Client {client_id} ({client_name}) deleted successfully with all associated data")
        return JSONResponse(content={"ok": True, "message": f"Cliente '{client_name}' eliminado correctamente"})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[delete_client] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


# ============================================================================
# INVESTORS API
# ============================================================================

@app.get("/api/investors")
async def list_investors():
    """List all investors."""
    try:
        result = sb.table("investors").select("*").order("created_at", desc=True).execute()
        return JSONResponse(content={"ok": True, "investors": result.data})
    except Exception as e:
        logger.error(f"[list_investors] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


# ============================================================================
# CONTRACTS API
# ============================================================================

@app.get("/api/contracts")
async def list_contracts():
    """List all RTO contracts."""
    try:
        result = sb.table("rto_contracts").select("*").order("created_at", desc=True).execute()
        return JSONResponse(content={"ok": True, "contracts": result.data})
    except Exception as e:
        logger.error(f"[list_contracts] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


# ============================================================================
# PAYMENTS API
# ============================================================================

@app.get("/api/payments")
async def list_payments(client_id: Optional[str] = None, contract_id: Optional[str] = None):
    """List payments, optionally filtered by client or contract."""
    try:
        query = sb.table("payments").select("*")
        
        if client_id:
            query = query.eq("client_id", client_id)
        if contract_id:
            query = query.eq("contract_id", contract_id)
        
        result = query.order("payment_date", desc=True).execute()
        return JSONResponse(content={"ok": True, "payments": result.data})
    except Exception as e:
        logger.error(f"[list_payments] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})


# ============================================================================
# PROCESS LOGS API (for debugging/monitoring)
# ============================================================================

@app.get("/api/process-logs")
async def list_process_logs(
    process: Optional[str] = None,
    entity_type: Optional[str] = None,
    limit: int = 50
):
    """List process logs for monitoring."""
    try:
        query = sb.table("process_logs").select("*")
        
        if process:
            query = query.eq("process", process)
        if entity_type:
            query = query.eq("entity_type", entity_type)
        
        result = query.order("created_at", desc=True).limit(limit).execute()
        return JSONResponse(content={"ok": True, "logs": result.data})
    except Exception as e:
        logger.error(f"[list_process_logs] Error: {e}")
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})
