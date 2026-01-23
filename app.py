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

from fastapi import FastAPI, HTTPException, Request, Header
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
    """Delete a property by ID."""
    try:
        # Check if property exists
        check = sb.table("properties").select("id").eq("id", property_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Property not found")
        
        # Delete associated data first (contracts, inspections, etc.)
        # Note: In production you might want to soft-delete instead
        sb.table("rto_contracts").delete().eq("property_id", property_id).execute()
        sb.table("property_inspections").delete().eq("property_id", property_id).execute()
        sb.table("process_logs").delete().eq("entity_id", property_id).execute()
        
        # Delete the property
        sb.table("properties").delete().eq("id", property_id).execute()
        
        logger.info(f"[delete_property] Property {property_id} deleted")
        return JSONResponse(content={"ok": True, "message": "Property deleted successfully"})
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
    """Delete a client by ID."""
    try:
        # Check if client exists
        check = sb.table("clients").select("id").eq("id", client_id).execute()
        if not check.data:
            raise HTTPException(status_code=404, detail="Client not found")
        
        # Delete associated data first (contracts, documents, etc.)
        # Note: In production you might want to soft-delete instead
        sb.table("rto_contracts").delete().eq("client_id", client_id).execute()
        sb.table("process_logs").delete().eq("entity_id", client_id).execute()
        
        # Delete the client
        sb.table("clients").delete().eq("id", client_id).execute()
        
        logger.info(f"[delete_client] Client {client_id} deleted")
        return JSONResponse(content={"ok": True, "message": "Client deleted successfully"})
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


@app.post("/api/webhooks/stripe-payments")
async def stripe_payments_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature")
):
    """
    Webhook endpoint for Stripe Payment events.
    
    Events handled:
    - invoice.paid: Monthly rent paid successfully
    - invoice.payment_failed: Payment failed
    - customer.subscription.deleted: Subscription canceled
    - payment_intent.succeeded: Single payment succeeded
    - payment_intent.payment_failed: Single payment failed
    """
    try:
        payload = await request.body()
        
        from tools.stripe_payments import process_payment_webhook
        result = process_payment_webhook(payload, stripe_signature or "")
        
        if not result.get("ok"):
            logger.error(f"[stripe_payments_webhook] Error: {result.get('error')}")
            return JSONResponse(status_code=400, content={"error": result.get("error")})
        
        # Process based on action
        action = result.get("action")
        contract_id = result.get("contract_id")
        event_type = result.get("event_type")
        
        if contract_id and action:
            if action == "record_payment":
                # Record successful payment
                amount = result.get("amount", 0)
                sb.table("payments").insert({
                    "contract_id": contract_id,
                    "amount": amount,
                    "payment_date": datetime.now().isoformat(),
                    "status": "completed",
                    "payment_method": "stripe_auto",
                    "stripe_invoice_id": result.get("invoice_id"),
                    "notes": f"Pago automático Stripe: ${amount:.2f}"
                }).execute()
                
                # Update contract
                sb.table("rto_contracts").update({
                    "last_payment_date": datetime.now().date().isoformat(),
                    "payment_status": "current",
                    "updated_at": datetime.now().isoformat()
                }).eq("id", contract_id).execute()
                
                logger.info(f"[webhook] Payment ${amount:.2f} recorded for contract {contract_id}")
                
            elif action == "mark_payment_failed":
                # Mark payment as failed, update delinquency
                amount = result.get("amount", 0)
                attempt = result.get("attempt_count", 1)
                
                sb.table("payments").insert({
                    "contract_id": contract_id,
                    "amount": amount,
                    "payment_date": datetime.now().isoformat(),
                    "status": "failed",
                    "payment_method": "stripe_auto",
                    "notes": f"Intento #{attempt} fallido"
                }).execute()
                
                # Update contract status based on attempts
                payment_status = "preventive" if attempt <= 2 else "administrative"
                sb.table("rto_contracts").update({
                    "payment_status": payment_status,
                    "updated_at": datetime.now().isoformat()
                }).eq("id", contract_id).execute()
                
                logger.warning(f"[webhook] Payment FAILED for contract {contract_id} (attempt #{attempt})")
                
            elif action == "cancel_auto_payment":
                # Subscription canceled
                sb.table("rto_contracts").update({
                    "auto_payment_enabled": False,
                    "stripe_subscription_id": None,
                    "updated_at": datetime.now().isoformat()
                }).eq("id", contract_id).execute()
                
                logger.info(f"[webhook] Auto-payment canceled for contract {contract_id}")
        
        return JSONResponse(content={"received": True, "event": event_type, "action": action})
        
    except Exception as e:
        logger.error(f"[stripe_payments_webhook] Exception: {e}")
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
