"""
AI Assistant API — Answers questions about real app data.

Used from the mobile PWA app. Supports:
- Text queries ("¿cuándo pagó Juan?", "¿cuántas casas tenemos?")
- Voice transcription (receives audio, returns text answer)
- Property evaluation with photos/videos against 26-point checklist
- ONLY uses real database data (never hallucinates)
- Access to ALL Homes + Capital data

Safety: The AI MUST ONLY return data from the database.
It should REFUSE to answer questions outside the app scope.
"""

import logging
import os
import json
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# SCHEMAS
# ============================================================================

class ChatRequest(BaseModel):
    query: str
    context: Optional[str] = None  # "homes" or "capital" or "all"


class ChatResponse(BaseModel):
    answer: str
    data: Optional[dict] = None
    sources: list = []


# ============================================================================
# COMPREHENSIVE DATA CONTEXT — ALL TABLES (with real column names)
# ============================================================================

def _get_full_db_context() -> str:
    """
    Fetch comprehensive stats from ALL database tables.
    Uses only columns that actually exist in the DB.
    """
    context_parts = []

    # --- HOMES PORTAL ---
    context_parts.append("=== PORTAL HOMES (Propiedades & Ventas) ===")

    try:
        props = sb.table("properties").select(
            "id, status, sale_price, purchase_price, city, state, address, "
            "year, square_feet, bedrooms, bathrooms",
            count="exact"
        ).execute()
        if props.data:
            status_counts = {}
            cities = {}
            total_purchase = 0
            total_sale = 0
            for p in props.data:
                s = p.get("status", "unknown")
                status_counts[s] = status_counts.get(s, 0) + 1
                c = p.get("city", "unknown")
                cities[c] = cities.get(c, 0) + 1
                total_purchase += float(p.get("purchase_price") or 0)
                total_sale += float(p.get("sale_price") or 0)
            context_parts.append(f"PROPIEDADES ({len(props.data)} total):")
            context_parts.append(f"  Por estado: {status_counts}")
            context_parts.append(f"  Por ciudad: {cities}")
            context_parts.append(f"  Inversión total compras: ${total_purchase:,.0f}")
            context_parts.append(f"  Valor total venta: ${total_sale:,.0f}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch properties: {e}")

    try:
        sales = sb.table("sales").select(
            "id, status, sale_type, sale_price, created_at",
            count="exact"
        ).execute()
        if sales.data:
            sale_types = {}
            sale_statuses = {}
            total_revenue = 0
            for s in sales.data:
                st = s.get("sale_type", "unknown")
                sale_types[st] = sale_types.get(st, 0) + 1
                ss = s.get("status", "unknown")
                sale_statuses[ss] = sale_statuses.get(ss, 0) + 1
                total_revenue += float(s.get("sale_price") or 0)
            context_parts.append(f"VENTAS ({len(sales.data)} total):")
            context_parts.append(f"  Tipos: {sale_types}")
            context_parts.append(f"  Estados: {sale_statuses}")
            context_parts.append(f"  Revenue total: ${total_revenue:,.0f}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch sales: {e}")

    try:
        clients = sb.table("clients").select("id, name, status, email, phone", count="exact").execute()
        if clients.data:
            client_statuses = {}
            for c in clients.data:
                cs = c.get("status", "unknown")
                client_statuses[cs] = client_statuses.get(cs, 0) + 1
            context_parts.append(f"CLIENTES ({len(clients.data)} total):")
            context_parts.append(f"  Por estado: {client_statuses}")
            context_parts.append(f"  Nombres: {', '.join(c.get('name', '?') for c in clients.data[:20])}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch clients: {e}")

    try:
        listings = sb.table("market_listings").select(
            "id, status, is_qualified, source, listing_price, city",
            count="exact"
        ).execute()
        if listings.data:
            qualified = sum(1 for l in listings.data if l.get("is_qualified"))
            sources = {}
            for l in listings.data:
                src = l.get("source", "unknown")
                sources[src] = sources.get(src, 0) + 1
            context_parts.append(f"LISTINGS MERCADO ({len(listings.data)} total, {qualified} calificados):")
            context_parts.append(f"  Fuentes: {sources}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch listings: {e}")

    try:
        renovations = sb.table("renovations").select(
            "id, property_id, status, total_cost",
            count="exact"
        ).execute()
        if renovations.data:
            reno_statuses = {}
            for r in renovations.data:
                rs = r.get("status", "unknown")
                reno_statuses[rs] = reno_statuses.get(rs, 0) + 1
            total_cost = sum(float(r.get("total_cost") or 0) for r in renovations.data)
            context_parts.append(f"RENOVACIONES ({len(renovations.data)} total):")
            context_parts.append(f"  Estados: {reno_statuses}")
            context_parts.append(f"  Costo total: ${total_cost:,.0f}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch renovations: {e}")

    try:
        transfers = sb.table("title_transfers").select(
            "id, property_id, status",
            count="exact"
        ).execute()
        if transfers.data:
            transfer_statuses = {}
            for t in transfers.data:
                ts = t.get("status", "unknown")
                transfer_statuses[ts] = transfer_statuses.get(ts, 0) + 1
            context_parts.append(f"TRANSFERENCIAS DE TÍTULO ({len(transfers.data)} total):")
            context_parts.append(f"  Estados: {transfer_statuses}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch transfers: {e}")

    # --- TEAM ---
    context_parts.append("\n=== EQUIPO ===")

    try:
        users = sb.table("users").select("id, name, role, is_active").execute()
        if users.data:
            active = [u for u in users.data if u.get("is_active", True)]
            roles = {}
            for u in active:
                r = u.get("role", "unknown")
                roles[r] = roles.get(r, 0) + 1
            context_parts.append(f"EQUIPO ({len(active)} activos de {len(users.data)} total):")
            context_parts.append(f"  Roles: {roles}")
            context_parts.append(f"  Nombres: {', '.join(u.get('name', '?') for u in active)}")
        else:
            context_parts.append("EQUIPO: No hay usuarios registrados aún")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch users: {e}")

    # --- CAPITAL PORTAL ---
    context_parts.append("\n=== PORTAL CAPITAL (RTO - Rent to Own) ===")

    try:
        contracts = sb.table("rto_contracts").select(
            "id, status, monthly_rent, purchase_price, client_id, property_id, "
            "start_date, end_date, down_payment",
            count="exact"
        ).execute()
        if contracts.data:
            active = sum(1 for c in contracts.data if c.get("status") == "active")
            total_monthly = sum(float(c.get("monthly_rent") or 0) for c in contracts.data if c.get("status") == "active")
            total_portfolio = sum(float(c.get("purchase_price") or 0) for c in contracts.data if c.get("status") == "active")
            context_parts.append(f"CONTRATOS RTO ({len(contracts.data)} total, {active} activos):")
            context_parts.append(f"  Renta mensual esperada: ${total_monthly:,.0f}")
            context_parts.append(f"  Valor cartera activa: ${total_portfolio:,.0f}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch contracts: {e}")

    try:
        payments = sb.table("rto_payments").select(
            "id, status, amount, paid_amount, due_date, paid_date",
            count="exact"
        ).execute()
        if payments.data:
            paid = sum(1 for p in payments.data if p.get("status") == "paid")
            overdue = sum(1 for p in payments.data if p.get("status") in ("overdue", "late"))
            pending = sum(1 for p in payments.data if p.get("status") == "pending")
            total_collected = sum(float(p.get("paid_amount") or 0) for p in payments.data if p.get("status") == "paid")
            context_parts.append(f"PAGOS RTO ({len(payments.data)} total):")
            context_parts.append(f"  Pagados: {paid}, Vencidos: {overdue}, Pendientes: {pending}")
            context_parts.append(f"  Total cobrado: ${total_collected:,.0f}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch payments: {e}")

    try:
        apps = sb.table("rto_applications").select("id, status", count="exact").execute()
        if apps.data:
            app_statuses = {}
            for a in apps.data:
                s = a.get("status", "unknown")
                app_statuses[s] = app_statuses.get(s, 0) + 1
            context_parts.append(f"SOLICITUDES RTO ({len(apps.data)} total): {app_statuses}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch applications: {e}")

    try:
        investors = sb.table("investors").select(
            "id, name, status, total_invested, available_capital",
            count="exact"
        ).execute()
        if investors.data:
            active_inv = [i for i in investors.data if i.get("status") == "active"]
            total_invested = sum(float(i.get("total_invested") or 0) for i in active_inv)
            available = sum(float(i.get("available_capital") or 0) for i in active_inv)
            context_parts.append(f"INVERSORES ({len(active_inv)} activos):")
            context_parts.append(f"  Total invertido: ${total_invested:,.0f}")
            context_parts.append(f"  Capital disponible: ${available:,.0f}")
    except Exception as e:
        logger.warning(f"[AI] Could not fetch investors: {e}")

    return "\n".join(context_parts) if context_parts else "No hay datos disponibles."


# ============================================================================
# SMART QUERY — Direct DB queries for common questions
# ============================================================================

def _query_specific_data(query: str) -> Optional[dict]:
    """
    Try to answer specific queries directly from the database.
    Returns data dict if found, None if needs LLM.
    """
    query_lower = query.lower()

    # Property counts
    if any(kw in query_lower for kw in ["cuántas casas", "cuantas casas", "how many houses", "propiedades", "inventario"]):
        result = sb.table("properties").select("status, city, address, purchase_price, sale_price", count="exact").execute()
        counts = {}
        for p in result.data:
            s = p.get("status", "unknown")
            counts[s] = counts.get(s, 0) + 1
        return {
            "type": "property_count",
            "total": len(result.data),
            "by_status": counts,
            "properties": [{"address": p.get("address"), "status": p.get("status"), "city": p.get("city")} for p in result.data[:15]],
        }

    # Sales / revenue
    if any(kw in query_lower for kw in ["cuánto vendimos", "cuanto vendimos", "ventas", "sales", "revenue"]):
        now = datetime.now()
        start = f"{now.year}-{now.month:02d}-01"
        result = sb.table("sales").select("*").gte("created_at", start).execute()
        total = sum(float(s.get("sale_price", 0)) for s in result.data)
        return {
            "type": "sales_summary",
            "month": now.strftime("%B %Y"),
            "count": len(result.data),
            "total_amount": total,
            "sales": [{"id": s["id"], "price": s.get("sale_price"), "type": s.get("sale_type")} for s in result.data],
        }

    # Overdue / late payments
    if any(kw in query_lower for kw in ["vencido", "overdue", "atrasado", "mora", "late"]):
        result = sb.table("rto_payments").select("*, rto_contracts(*, clients(name))") \
            .in_("status", ["overdue", "late"]).execute()
        return {
            "type": "overdue_payments",
            "count": len(result.data),
            "payments": result.data[:10],
        }

    # RTO clients count
    if any(kw in query_lower for kw in ["clientes rto", "clientes en rto", "rto clients", "cuantos clientes"]):
        contracts = sb.table("rto_contracts").select("id, status, client_id, clients(name)") \
            .eq("status", "active").execute()
        return {
            "type": "rto_clients",
            "active_count": len(contracts.data),
            "clients": [{"name": c.get("clients", {}).get("name", "?"), "contract_id": c["id"]} for c in (contracts.data or [])[:20]],
        }

    # Team / employees
    if any(kw in query_lower for kw in ["equipo", "team", "empleados", "employees", "quién trabaja", "quien trabaja"]):
        users = sb.table("users").select("*").execute()
        active = [u for u in (users.data or []) if u.get("is_active", True)]
        return {
            "type": "team",
            "count": len(active),
            "members": [{"name": u.get("name"), "role": u.get("role")} for u in active],
        }

    # Renovations
    if any(kw in query_lower for kw in ["renovación", "renovacion", "renovation", "obra", "reparaciones"]):
        renos = sb.table("renovations").select("*, properties(address, city)") \
            .in_("status", ["pending", "in_progress"]).execute()
        return {
            "type": "renovations",
            "active_count": len(renos.data or []),
            "renovations": [
                {
                    "property": r.get("properties", {}).get("address") if r.get("properties") else "?",
                    "status": r.get("status"),
                    "total_cost": r.get("total_cost"),
                }
                for r in (renos.data or [])[:10]
            ],
        }

    # Market listings
    if any(kw in query_lower for kw in ["mercado", "market", "listing", "facebook", "scraping"]):
        listings = sb.table("market_listings").select("id, status, is_qualified, source, listing_price, address, city") \
            .order("scraped_at", desc=True).limit(20).execute()
        qualified = sum(1 for l in (listings.data or []) if l.get("is_qualified"))
        return {
            "type": "market_listings",
            "total_shown": len(listings.data or []),
            "qualified": qualified,
            "listings": [
                {"address": l.get("address"), "city": l.get("city"), "price": l.get("listing_price"), "source": l.get("source"), "qualified": l.get("is_qualified")}
                for l in (listings.data or [])
            ],
        }

    # Search for specific client by name
    for prefix in ["cliente ", "client ", "pagó ", "pago ", "info de ", "datos de "]:
        if prefix in query_lower:
            name_part = query_lower.split(prefix)[-1].strip().rstrip("?").strip()
            if len(name_part) > 2:
                result = sb.table("clients").select("*").ilike("name", f"%{name_part}%").execute()
                if result.data:
                    client = result.data[0]
                    # Also get their payments
                    payments = sb.table("rto_payments") \
                        .select("*, rto_contracts!inner(client_id)") \
                        .eq("rto_contracts.client_id", client["id"]) \
                        .order("due_date", desc=True) \
                        .limit(5).execute()
                    # Also get their sales
                    sales = sb.table("sales").select("*") \
                        .eq("client_id", client["id"]).execute()
                    return {
                        "type": "client_info",
                        "client": client,
                        "recent_payments": payments.data if payments.data else [],
                        "sales": sales.data if sales.data else [],
                    }

    return None


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    AI chat endpoint — answers questions about real app data.
    RULE: Only uses real database data, never hallucinate.
    """
    logger.info(f"[AI Assistant] Query: {request.query}")

    # Try direct database query first (faster, more accurate)
    direct_data = _query_specific_data(request.query)
    if direct_data:
        answer = _format_direct_answer(direct_data)
        return ChatResponse(
            answer=answer,
            data=direct_data,
            sources=["database"],
        )

    # Fall back to LLM with real data context
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return ChatResponse(
                answer="AI no configurada. Falta OPENAI_API_KEY.",
                sources=["error"],
            )

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            api_key=api_key,
        )

        db_context = _get_full_db_context()

        messages = [
            SystemMessage(content=f"""Eres el asistente de datos de Maninos AI — la plataforma de casas móviles de Maninos Capital LLC.
REGLAS ESTRICTAS:
1. SOLO responde con datos REALES del sistema. NUNCA inventes datos.
2. Si no tienes la información, di "No tengo esa información en el sistema."
3. Responde en español, de forma breve y directa.
4. Si te preguntan algo fuera del ámbito de Maninos (casas móviles, clientes, pagos, ventas, renovaciones, equipo, inversores), di "Esa pregunta está fuera del ámbito de Maninos AI."
5. Usa emojis para hacer las respuestas más legibles.
6. Si muestras montos de dinero, usa formato con comas: $1,234.56

CONTEXTO DEL NEGOCIO:
- Maninos compra casas móviles, las renueva, y las vende (contado o RTO - Rent to Own)
- Portal Homes: gestión de propiedades, compras, renovaciones, ventas
- Portal Capital: gestión de contratos RTO, pagos mensuales, inversores
- Equipo: Gabriel (Operaciones), Abigail (Tesorería)
- Regla compra: max 60% del valor de mercado
- Regla venta: max 80% del valor de mercado
- Comisiones: $1,000 RTO, $1,500 contado. Split 50/50 entre found_by y sold_by.

DATOS ACTUALES DEL SISTEMA:
{db_context}

FECHA ACTUAL: {datetime.now().strftime('%Y-%m-%d %H:%M')}"""),
            HumanMessage(content=request.query),
        ]

        response = await llm.ainvoke(messages)

        return ChatResponse(
            answer=response.content,
            sources=["database", "ai"],
        )

    except Exception as e:
        logger.error(f"[AI Assistant] LLM error: {e}")
        return ChatResponse(
            answer=f"Error procesando tu pregunta. Intenta de nuevo.",
            sources=["error"],
        )


@router.post("/voice")
async def voice_query(audio: UploadFile = File(...)):
    """
    Voice query endpoint — transcribes audio and answers the question.
    Used from the mobile PWA app for hands-free operation.
    """
    try:
        import openai

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

        client = openai.OpenAI(api_key=api_key)

        audio_bytes = await audio.read()

        # Transcribe with Whisper
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=True) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()

            with open(tmp.name, "rb") as f:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language="es",
                )

        transcribed_text = transcript.text
        logger.info(f"[AI Voice] Transcribed: {transcribed_text}")

        # Answer the question using the chat endpoint
        chat_response = await chat(ChatRequest(query=transcribed_text))

        return {
            "transcription": transcribed_text,
            "answer": chat_response.answer,
            "data": chat_response.data,
            "sources": chat_response.sources,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AI Voice] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PROPERTY EVALUATION — 28-Point Checklist with AI Vision (Interactive)
# ============================================================================
# Synced with PropertyChecklist.tsx and MarketDashboard.tsx
# The evaluator analyzes photos, fills what it can, and ASKS for missing photos.

CHECKLIST_ITEMS = [
    # ESTRUCTURA (4)
    {"id": "marco_acero", "category": "Estructura", "label": "Marco de acero",
     "photo_hint": "Foto del faldón/parte inferior de la casa donde se vea el marco metálico"},
    {"id": "suelos_subfloor", "category": "Estructura", "label": "Suelos/subfloor",
     "photo_hint": "Fotos de los pisos en cada cuarto — busca hundimientos, manchas de agua, partes blandas"},
    {"id": "techo_techumbre", "category": "Estructura", "label": "Techo/techumbre",
     "photo_hint": "Foto del techo exterior + techos interiores buscando manchas de humedad o goteo"},
    {"id": "paredes_ventanas", "category": "Estructura", "label": "Paredes/ventanas",
     "photo_hint": "Fotos panorámicas de las paredes y de cada ventana (¿grietas, vidrios rotos?)"},

    # INSTALACIONES (5)
    {"id": "regaderas_tinas", "category": "Instalaciones", "label": "Regaderas/tinas/coladeras",
     "photo_hint": "Fotos de regaderas, tinas, y coladeras en cada baño"},
    {"id": "electricidad", "category": "Instalaciones", "label": "Electricidad",
     "photo_hint": "Foto del panel eléctrico abierto + enchufes/interruptores visibles"},
    {"id": "plomeria", "category": "Instalaciones", "label": "Plomería",
     "photo_hint": "Fotos debajo de lavabos/fregadero — tuberías, conexiones, posibles fugas"},
    {"id": "ac", "category": "Instalaciones", "label": "A/C",
     "photo_hint": "Foto de la unidad de A/C exterior e interior (¿presente, modelo, condición?)"},
    {"id": "gas", "category": "Instalaciones", "label": "Gas",
     "photo_hint": "Foto del tanque de gas, tubería de gas, calentador de agua"},

    # DOCUMENTACIÓN (5) — not evaluable by photo (except VIN)
    {"id": "titulo_limpio", "category": "Documentación", "label": "Título limpio sin adeudos",
     "photo_hint": "Documento: se verifica en trámite, no por foto"},
    {"id": "vin_revisado", "category": "Documentación", "label": "VIN revisado",
     "photo_hint": "Foto de la placa VIN/HUD de la casa (usualmente cerca de panel eléctrico o puerta)"},
    {"id": "docs_vendedor", "category": "Documentación", "label": "Docs vendedor",
     "photo_hint": "Documento: se verifica en trámite, no por foto"},
    {"id": "aplicacion_firmada", "category": "Documentación", "label": "Aplicación firmada vendedor/comprador",
     "photo_hint": "Documento: se verifica en trámite, no por foto"},
    {"id": "bill_of_sale", "category": "Documentación", "label": "Bill of Sale",
     "photo_hint": "Documento: se verifica en trámite, no por foto"},

    # FINANCIERO (4)
    {"id": "precio_costo_obra", "category": "Financiero", "label": "Precio compra + costo obra",
     "photo_hint": "Se estima basándose en las condiciones generales visibles en las fotos"},
    {"id": "reparaciones_30", "category": "Financiero", "label": "Reparaciones < 30% valor venta",
     "photo_hint": "Se calcula en base a los daños visibles en las fotos"},
    {"id": "comparativa_mercado", "category": "Financiero", "label": "Comparativa precios mercado",
     "photo_hint": "Se consulta en el sistema, no por foto"},
    {"id": "costos_extra", "category": "Financiero", "label": "Costos extra traslado/movida/alineación",
     "photo_hint": "Foto exterior completa: ¿hay acceso para grúa? ¿está nivelada?"},

    # ESPECIFICACIONES (5)
    {"id": "año", "category": "Especificaciones", "label": "Año",
     "photo_hint": "La placa VIN/HUD tiene el año. También se estima por diseño y materiales"},
    {"id": "condiciones", "category": "Especificaciones", "label": "Condiciones generales",
     "photo_hint": "Fotos generales del interior y exterior para evaluación global"},
    {"id": "numero_cuartos", "category": "Especificaciones", "label": "Número de cuartos",
     "photo_hint": "Fotos de cada cuarto/habitación para contarlos"},
    {"id": "lista_reparaciones", "category": "Especificaciones", "label": "Lista reparaciones necesarias",
     "photo_hint": "Se genera de todas las fotos — cuantas más fotos, mejor la lista"},
    {"id": "recorrido_completo", "category": "Especificaciones", "label": "Recorrido completo",
     "photo_hint": "Fotos de TODAS las áreas: exterior (4 lados), sala, cocina, baños, cuartos, faldón, techo"},

    # CIERRE (5) — not evaluable by photo
    {"id": "deposito_inicial", "category": "Cierre", "label": "Depósito inicial",
     "photo_hint": "Trámite administrativo, no por foto"},
    {"id": "deposit_agreement", "category": "Cierre", "label": "Deposit Agreement firmado",
     "photo_hint": "Trámite administrativo, no por foto"},
    {"id": "contrato_financiamiento", "category": "Cierre", "label": "Contrato firmado si financiamiento",
     "photo_hint": "Trámite administrativo, no por foto"},
    {"id": "pago_total_contado", "category": "Cierre", "label": "Pago total si contado",
     "photo_hint": "Trámite administrativo, no por foto"},
    {"id": "entrega_sobre", "category": "Cierre", "label": "Entrega sobre con aplicación y factura firmada",
     "photo_hint": "Trámite administrativo, no por foto"},
]

# Items that CAN be evaluated from photos (the others are docs/admin)
PHOTO_EVALUABLE_IDS = {
    "marco_acero", "suelos_subfloor", "techo_techumbre", "paredes_ventanas",
    "regaderas_tinas", "electricidad", "plomeria", "ac", "gas",
    "vin_revisado",
    "precio_costo_obra", "reparaciones_30", "costos_extra",
    "año", "condiciones", "numero_cuartos", "lista_reparaciones", "recorrido_completo",
}


@router.post("/evaluate-property")
async def evaluate_property(files: list[UploadFile] = File(...)):
    """
    AI property evaluation — analyzes photos against 28-point checklist.
    Uses GPT-4o Vision. Returns evaluation + which items need more photos.
    The frontend can then ask the user for specific photos and re-evaluate.
    """
    logger.info(f"[AI Evaluator] Received {len(files)} files for evaluation")

    try:
        import openai
        import base64

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

        client = openai.OpenAI(api_key=api_key)

        # Read and encode images
        image_contents = []
        for file in files[:10]:  # Max 10 images
            raw = await file.read()
            if len(raw) == 0:
                continue
            b64 = base64.b64encode(raw).decode("utf-8")
            ext = (file.filename or "photo.jpeg").rsplit(".", 1)[-1].lower()
            mime = f"image/{ext}" if ext in ("jpeg", "jpg", "png", "gif", "webp") else "image/jpeg"
            image_contents.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime};base64,{b64}",
                    "detail": "high",
                },
            })

        if not image_contents:
            raise HTTPException(status_code=400, detail="No valid images received")

        # Build the checklist as text for the prompt (with IDs)
        checklist_text_lines = []
        for i, item in enumerate(CHECKLIST_ITEMS, 1):
            evaluable = "EVALUAR POR FOTO" if item["id"] in PHOTO_EVALUABLE_IDS else "DOCUMENTO/ADMIN (marcar not_evaluable)"
            checklist_text_lines.append(
                f'{i}. id="{item["id"]}" | {item["category"]} | {item["label"]} | {evaluable} | Tip: {item["photo_hint"]}'
            )
        checklist_text = "\n".join(checklist_text_lines)

        prompt = f"""Eres un evaluador experto de casas móviles (mobile homes / manufactured homes) para Maninos Capital LLC en Texas.

TAREA: Analiza las fotos proporcionadas y evalúa el ESTADO/CONDICIÓN de la casa en cada punto del checklist.

IMPORTANTE: Esta evaluación es SOLO para determinar el estado actual de la casa que van a comprar.
NO incluyas estimaciones de costo de reparación ni presupuesto de renovación. Solo evalúa la condición.

REGLAS CRÍTICAS:
1. Para cada punto, analiza si las fotos proporcionadas permiten evaluarlo.
2. Si puedes evaluar el punto con las fotos, asigna "pass", "fail", o "warning".
3. Si NO puedes evaluar un punto porque falta una foto específica, usa "needs_photo" — y en "note" explica EXACTAMENTE qué foto necesitas.
4. Para puntos de documentación/admin que no son evaluables por foto, usa "not_evaluable".
5. Sé HONESTO y CONSERVADOR — detectar problemas es mejor que pasarlos por alto.
6. En "note" describe la CONDICIÓN observada (ej: "Pisos hundidos en el baño, manchas de humedad visibles").

CHECKLIST DE {len(CHECKLIST_ITEMS)} PUNTOS:
{checklist_text}

Responde con un JSON válido con EXACTAMENTE esta estructura:

{{
  "checklist": [
    {{
      "id": "marco_acero",
      "category": "Estructura",
      "label": "Marco de acero",
      "status": "pass",
      "confidence": "high",
      "note": "Marco visible en buenas condiciones, sin oxidación"
    }},
    {{
      "id": "electricidad",
      "category": "Instalaciones",
      "label": "Electricidad",
      "status": "needs_photo",
      "confidence": "low",
      "note": "No se ve el panel eléctrico en las fotos. Necesito foto del panel eléctrico abierto."
    }},
    {{
      "id": "titulo_limpio",
      "category": "Documentación",
      "label": "Título limpio sin adeudos",
      "status": "not_evaluable",
      "confidence": "high",
      "note": "Se verifica en trámite administrativo"
    }}
  ],
  "summary": {{
    "total_items": {len(CHECKLIST_ITEMS)},
    "passed": 5,
    "failed": 2,
    "warnings": 3,
    "needs_photo": 4,
    "not_evaluable": 14
  }},
  "score": 65,
  "recommendation": "NECESITA MÁS INFO",
  "recommendation_reason": "Se evaluaron 10 de 18 puntos visuales. Faltan fotos del panel eléctrico, plomería, y A/C.",
  "property_type": "single_wide",
  "estimated_year": "2005 aprox",
  "estimated_bedrooms": 3,
  "photos_coverage": "Interior sala y cocina. Falta: exterior, baños, techo, faldón.",
  "photos_needed": [
    {{
      "checklist_id": "electricidad",
      "description": "Foto del panel eléctrico abierto",
      "priority": "high"
    }}
  ]
}}

IMPORTANTE:
- "status" SOLO puede ser: "pass", "fail", "warning", "needs_photo", o "not_evaluable"
- "confidence" SOLO puede ser: "high", "medium", o "low"
- "recommendation" SOLO puede ser: "COMPRAR", "NO COMPRAR", o "NECESITA MÁS INFO"
- "photos_needed" debe listar EXACTAMENTE qué fotos faltan para completar la evaluación
- Incluye TODOS los {len(CHECKLIST_ITEMS)} items del checklist en la respuesta
- El "score" es de 0 a 100, basado SOLO en items evaluados (excluye needs_photo y not_evaluable)
- NO incluyas "estimated_renovation" ni "repairs_needed" — solo evalúa el estado"""

        messages_content = [{"type": "text", "text": prompt}]
        messages_content.extend(image_contents)

        logger.info(f"[AI Evaluator] Sending {len(image_contents)} images to GPT-4o...")

        # NOTE: Do NOT use response_format={"type": "json_object"} here.
        # It causes GPT-4o to refuse image analysis. Instead we parse JSON manually.
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional mobile home inspector and property evaluator for Maninos Capital LLC in Texas. "
                        "Your job is to analyze photos of manufactured/mobile homes and evaluate their condition against a purchase checklist. "
                        "You must ALWAYS respond with a valid JSON object. Never refuse to evaluate — "
                        "if an image is unclear, mark items as needs_photo. This is a legitimate real estate inspection task."
                    ),
                },
                {"role": "user", "content": messages_content},
            ],
            max_tokens=4096,
            temperature=0.2,
        )

        result_text = response.choices[0].message.content
        logger.info(f"[AI Evaluator] Raw response length: {len(result_text) if result_text else 0}")

        # Handle None or empty response
        if not result_text:
            refusal = getattr(response.choices[0].message, 'refusal', None)
            logger.error(f"[AI Evaluator] GPT-4o returned empty. Refusal: {refusal}, finish: {response.choices[0].finish_reason}")
            raise HTTPException(
                status_code=500,
                detail=f"La IA no pudo procesar las fotos. Intenta con fotos más claras o en otro formato (JPG). {f'Motivo: {refusal}' if refusal else ''}"
            )

        # Extract JSON from response (may be wrapped in ```json ... ``` or plain)
        import re
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', result_text, re.DOTALL)
        json_str = json_match.group(1).strip() if json_match else result_text.strip()
        
        # Also handle case where response starts with text before JSON
        if not json_str.startswith('{'):
            brace_idx = json_str.find('{')
            if brace_idx >= 0:
                json_str = json_str[brace_idx:]
        
        result = json.loads(json_str)

        # Validate and enrich result
        if "checklist" not in result:
            result["checklist"] = []
        if "summary" not in result:
            # Build summary from checklist
            statuses = [item.get("status", "not_evaluable") for item in result["checklist"]]
            result["summary"] = {
                "total_items": len(CHECKLIST_ITEMS),
                "passed": statuses.count("pass"),
                "failed": statuses.count("fail"),
                "warnings": statuses.count("warning"),
                "needs_photo": statuses.count("needs_photo"),
                "not_evaluable": statuses.count("not_evaluable"),
            }
        if "photos_needed" not in result:
            # Build from needs_photo items
            result["photos_needed"] = []
            for item in result.get("checklist", []):
                if item.get("status") == "needs_photo":
                    checklist_def = next((c for c in CHECKLIST_ITEMS if c["id"] == item["id"]), None)
                    result["photos_needed"].append({
                        "checklist_id": item["id"],
                        "description": item.get("note", checklist_def["photo_hint"] if checklist_def else "Foto adicional requerida"),
                        "priority": "high" if item["id"] in {"marco_acero", "suelos_subfloor", "techo_techumbre", "electricidad", "plomeria"} else "medium",
                    })

        logger.info(
            f"[AI Evaluator] Score: {result.get('score', 'N/A')}, "
            f"Rec: {result.get('recommendation', 'N/A')}, "
            f"Needs photos: {len(result.get('photos_needed', []))}"
        )
        return result

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raw_preview = result_text[:500] if result_text else 'None'
        logger.error(f"[AI Evaluator] JSON parse error: {e}, raw: {raw_preview}")
        raise HTTPException(status_code=500, detail="La IA devolvió una respuesta inválida. Intenta de nuevo.")
    except Exception as e:
        logger.error(f"[AI Evaluator] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# HELPERS
# ============================================================================

def _format_direct_answer(data: dict) -> str:
    """Format a direct database query result into a human-readable answer."""
    dtype = data.get("type", "")

    if dtype == "property_count":
        parts = [f"🏠 Tenemos **{data['total']}** propiedades en total."]
        for status, count in data["by_status"].items():
            emoji = {"acquired": "📦", "renovating": "🔧", "published": "📢", "sold": "💰", "in_transit": "🚚"}.get(status, "•")
            parts.append(f"  {emoji} {status}: {count}")
        return "\n".join(parts)

    if dtype == "sales_summary":
        if data["count"] == 0:
            return f"📊 En {data['month']} aún no hay ventas registradas."
        return (
            f"📊 En **{data['month']}** hubo **{data['count']}** ventas "
            f"por un total de **${data['total_amount']:,.2f}**."
        )

    if dtype == "overdue_payments":
        if data["count"] == 0:
            return "✅ No hay pagos vencidos. ¡Todo al día!"
        return f"⚠️ Hay **{data['count']}** pagos vencidos/atrasados."

    if dtype == "rto_clients":
        if data["active_count"] == 0:
            return "No hay clientes con contratos RTO activos."
        names = ", ".join(c["name"] for c in data["clients"][:10])
        return f"👥 Hay **{data['active_count']}** clientes con contrato RTO activo.\nAlgunos: {names}"

    if dtype == "team":
        if data["count"] == 0:
            return "👥 No hay miembros del equipo registrados aún."
        parts = [f"👥 Equipo activo: **{data['count']}** personas."]
        for m in data["members"]:
            parts.append(f"  • {m['name']} — {m['role']}")
        return "\n".join(parts)

    if dtype == "renovations":
        if data["active_count"] == 0:
            return "🔧 No hay renovaciones activas en este momento."
        parts = [f"🔧 Hay **{data['active_count']}** renovaciones activas:"]
        for r in data["renovations"]:
            parts.append(f"  • {r['property']} — {r['status']} (${float(r.get('total_cost') or 0):,.0f})")
        return "\n".join(parts)

    if dtype == "market_listings":
        return (
            f"🔍 Últimos {data['total_shown']} listings del mercado. "
            f"**{data['qualified']}** califican según nuestros filtros."
        )

    if dtype == "client_info":
        client = data["client"]
        name = client.get("name", "Desconocido")
        status = client.get("status", "unknown")
        phone = client.get("phone", "N/A")
        answer = f"👤 **{name}**\n  Estado: {status}\n  Tel: {phone}"
        if data.get("recent_payments"):
            last = data["recent_payments"][0]
            answer += f"\n  Último pago: ${float(last.get('amount', 0)):,.2f} ({last.get('due_date', 'N/A')})"
        if data.get("sales"):
            answer += f"\n  Ventas: {len(data['sales'])}"
        return answer

    return "✅ Datos encontrados en el sistema."
