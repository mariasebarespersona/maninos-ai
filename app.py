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
import env_loader  # loads .env first
import os
import uuid
import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Logfire: Observability (optional)
try:
    import logfire
    token = os.getenv("LOGFIRE_TOKEN")
    if token:
        logfire.configure(
            token=token,
            service_name="maninos-ai-backend",
            environment=os.getenv("ENVIRONMENT", "development"),
        )
    else:
        logfire.configure(
            send_to_logfire=False,
            service_name="maninos-ai-backend",
            environment=os.getenv("ENVIRONMENT", "development"),
        )
except Exception as e:
    logger.warning(f"[LOGFIRE] Disabled: {e}")

# Supabase client
from tools.supabase_client import sb

# Agents
from agents import ComercializarAgent, AdquirirAgent, IncorporarAgent

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
    allow_origins=["*"],
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
    
    Uses IntelligentRouter for DATA-DRIVEN, CONTEXT-AWARE routing.
    
    Principles (from Developer Bible):
    1. DATABASE AS SOURCE OF TRUTH - check entity state before routing
    2. CONTEXT-AWARE - same message means different things at different stages
    3. SESSION CONTINUITY - remember what process the user is in
    """
    try:
        body = await request.json()
        message = body.get("message", "")
        session_id = body.get("session_id", str(uuid.uuid4()))
        user_context = body.get("context", {})
        
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        
        # DETAILED LOGGING for debugging session continuity
        logger.info(f"[chat] ========== NEW REQUEST ==========")
        logger.info(f"[chat] Session ID: {session_id}")
        logger.info(f"[chat] Message: {message[:100]}...")
        logger.info(f"[chat] Message length: {len(message)} chars")
        
        # Get router and agents
        router = get_router()
        agents = get_agents()
        
        # =====================================================================
        # INTELLIGENT ROUTING (Data-Driven)
        # =====================================================================
        # The router checks:
        # 1. Session state (what process is user in?)
        # 2. Entity references (is user mentioning a client/property?)
        # 3. Database state (what stage is that entity in?)
        # 4. Intent (fallback if no context)
        # =====================================================================
        
        routing_decision = router.route(message, session_id, user_context)
        
        agent_name = routing_decision["agent"]
        process = routing_decision["process"]
        confidence = routing_decision["confidence"]
        reason = routing_decision["reason"]
        routing_context = routing_decision.get("context", {})
        
        logger.info(f"[chat] Routing: {agent_name} ({process}) - confidence: {confidence:.2f} - {reason}")
        
        # Get the agent
        agent = agents.get(agent_name)
        
        if not agent:
            # Agent not available (might be Week 2)
            logger.warning(f"[chat] Agent {agent_name} not available, falling back to ComercializarAgent")
            agent = agents["ComercializarAgent"]
            agent_name = "ComercializarAgent"
        
        # =====================================================================
        # ENRICH CONTEXT WITH ROUTING INFORMATION
        # =====================================================================
        # Pass flow guidance to the agent so it knows exactly what to do
        # =====================================================================
        
        enriched_context = {
            **user_context,
            "routing": {
                "process": process,
                "confidence": confidence,
                "reason": reason,
            },
            "flow_context": routing_context,
        }
        
        # Add specific guidance for the agent
        if routing_context.get("next_step_guidance"):
            enriched_context["next_step_guidance"] = routing_context["next_step_guidance"]
        
        if routing_context.get("entity_id"):
            enriched_context["entity_id"] = routing_context["entity_id"]
            enriched_context["entity_type"] = routing_context.get("entity_type")
        
        if routing_context.get("missing_data"):
            enriched_context["missing_data"] = routing_context["missing_data"]
        
        # =====================================================================
        # PROCESS WITH AGENT
        # =====================================================================
        
        result = agent.process(message, session_id, enriched_context)
        
        return JSONResponse(content={
            "ok": True,
            "response": result.get("response", "No response generated"),
            "agent": agent_name,
            "process": process,
            "session_id": session_id,
            # Include routing info for debugging
            "routing": {
                "confidence": confidence,
                "reason": reason[:100] if reason else None
            }
        })
        
    except Exception as e:
        logger.error(f"[chat] Error: {e}", exc_info=True)
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
# STRIPE IDENTITY WEBHOOKS - KYC Verification
# ============================================================================

@app.post("/api/webhooks/stripe-identity")
async def stripe_identity_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature")
):
    """
    Webhook endpoint for Stripe Identity verification events.
    
    Events handled:
    - identity.verification_session.verified
    - identity.verification_session.requires_input
    - identity.verification_session.canceled
    """
    try:
        payload = await request.body()
        
        from tools.stripe_identity import process_identity_webhook
        result = process_identity_webhook(payload, stripe_signature or "")
        
        if not result.get("ok"):
            logger.error(f"[stripe_identity_webhook] Error: {result.get('error')}")
            return JSONResponse(status_code=400, content={"error": result.get("error")})
        
        # Update client status based on event
        client_id = result.get("client_id")
        event_type = result.get("event_type")
        
        if client_id:
            if event_type == "identity.verification_session.verified":
                sb.table("clients").update({
                    "kyc_status": "verified",
                    "process_stage": "kyc_verified",
                    "updated_at": datetime.now().isoformat()
                }).eq("id", client_id).execute()
                logger.info(f"[webhook] Client {client_id} KYC verified")
                
            elif event_type == "identity.verification_session.canceled":
                sb.table("clients").update({
                    "kyc_status": "canceled",
                    "updated_at": datetime.now().isoformat()
                }).eq("id", client_id).execute()
                logger.info(f"[webhook] Client {client_id} KYC canceled")
        
        return JSONResponse(content={"received": True, "event": event_type})
        
    except Exception as e:
        logger.error(f"[stripe_identity_webhook] Exception: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


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
