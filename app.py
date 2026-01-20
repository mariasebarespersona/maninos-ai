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

# Initialize agents
comercializar_agent = None
adquirir_agent = None
incorporar_agent = None

def get_agents():
    """Lazy initialization of agents."""
    global comercializar_agent, adquirir_agent, incorporar_agent
    
    if comercializar_agent is None:
        comercializar_agent = ComercializarAgent()
        adquirir_agent = AdquirirAgent()
        incorporar_agent = IncorporarAgent()
        logger.info("[app] Agents initialized")
    
    return {
        "comercializar": comercializar_agent,
        "adquirir": adquirir_agent,
        "incorporar": incorporar_agent
    }


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


# ============================================================================
# CHAT ENDPOINT - Main AI Interface
# ============================================================================

@app.post("/api/chat")
async def chat(request: Request):
    """
    Main chat endpoint for AI interactions.
    
    Routes to appropriate agent based on intent detection.
    """
    try:
        body = await request.json()
        message = body.get("message", "")
        session_id = body.get("session_id", str(uuid.uuid4()))
        context = body.get("context", {})
        
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        
        logger.info(f"[chat] Session {session_id}: {message[:100]}...")
        
        # Get agents
        agents = get_agents()
        
        # Simple intent detection (to be enhanced with proper routing)
        message_lower = message.lower()
        
        # Detect which agent to use
        if any(word in message_lower for word in ["buscar propiedad", "evaluar propiedad", "inspección", "oferta", "inventario", "adquirir"]):
            agent = agents["adquirir"]
            agent_name = "AdquirirAgent"
        elif any(word in message_lower for word in ["cliente", "perfil", "kyc", "dti", "contrato rto", "verificar identidad", "incorporar"]):
            agent = agents["incorporar"]
            agent_name = "IncorporarAgent"
        elif any(word in message_lower for word in ["comité", "desembolso", "promoción", "crédito", "venta", "fidelización", "comercializar"]):
            agent = agents["comercializar"]
            agent_name = "ComercializarAgent"
        else:
            # Default to AdquirirAgent for now
            agent = agents["adquirir"]
            agent_name = "AdquirirAgent"
        
        logger.info(f"[chat] Routing to {agent_name}")
        
        # Process with agent
        result = agent.process(message, session_id, context)
        
        return JSONResponse(content={
            "ok": True,
            "response": result.get("response", "No response generated"),
            "agent": agent_name,
            "session_id": session_id
        })
        
    except Exception as e:
        logger.error(f"[chat] Error: {e}")
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
