"""
Adquirir Tools - Herramientas para el proceso ADQUIRIR

Según el Excel del cliente, ADQUIRIR tiene 5 procedimientos:
1. Investigar y abastecer - search_property_sources
2. Evaluar atributos físicos, financieros y legales - evaluate_property_criteria (Checklist 26 puntos)
3. Inspeccionar y debida diligencia - create_inspection_record
4. Establecer condiciones de adquisición - calculate_acquisition_offer (≤70% valor mercado)
5. Registrar en inventario - register_property_inventory
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
from decimal import Decimal

logger = logging.getLogger(__name__)


# ============================================================================
# CHECKLIST 26 PUNTOS (Del documento del cliente)
# ============================================================================

CHECKLIST_26_POINTS = {
    "estructura": {
        "marco_acero": {"name": "Marco de acero", "required": True},
        "suelos_subfloor": {"name": "Suelos/Subfloor", "required": True},
        "techo_techumbre": {"name": "Techo/Techumbre", "required": True},
        "paredes_ventanas": {"name": "Paredes/Ventanas", "required": True},
    },
    "instalaciones": {
        "regaderas_tinas_coladeras": {"name": "Regaderas/Tinas/Coladeras", "required": True},
        "electricidad": {"name": "Electricidad", "required": True},
        "plomeria": {"name": "Plomería", "required": True},
        "ac": {"name": "A/C", "required": True},
        "gas": {"name": "Gas", "required": False},
    },
    "documentacion": {
        "titulo_limpio": {"name": "Título limpio sin adeudos", "required": True},
        "vin_revisado": {"name": "VIN revisado", "required": True},
        "docs_vendedor": {"name": "Documentos del vendedor", "required": True},
        "aplicacion_firmada": {"name": "Aplicación firmada vendedor/comprador", "required": True},
        "bill_of_sale": {"name": "Bill of Sale", "required": True},
    },
    "financiero": {
        "precio_compra_obra": {"name": "Precio compra + costo obra", "required": True},
        "reparaciones_30pct": {"name": "Reparaciones < 30% valor venta", "required": True},
        "comparativa_mercado": {"name": "Comparativa precios mercado", "required": True},
        "costos_extra": {"name": "Costos extra (traslado/movida/alineación)", "required": False},
    },
    "especificaciones": {
        "ano": {"name": "Año", "required": True},
        "condiciones": {"name": "Condiciones generales", "required": True},
        "numero_cuartos": {"name": "Número de cuartos", "required": True},
        "lista_reparaciones": {"name": "Lista de reparaciones necesarias", "required": True},
        "recorrido_completo": {"name": "Recorrido completo", "required": True},
    },
    "cierre": {
        "deposito_inicial": {"name": "Depósito inicial", "required": True},
        "deposit_agreement": {"name": "Deposit Agreement firmado", "required": True},
        "contrato_firmado": {"name": "Contrato firmado (si financiamiento)", "required": False},
    },
}


# ============================================================================
# HERRAMIENTA 1: search_property_sources
# Procedimiento: Investigar y abastecer (Agente de éxito)
# ============================================================================

def search_property_sources(
    location: str,
    max_price: Optional[float] = None,
    min_bedrooms: Optional[int] = None,
    property_type: str = "mobile_home",
    sources: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Busca propiedades en fuentes externas para identificar oportunidades de adquisición.
    
    Procedimiento 1 del Excel: Identificar zonas con alta demanda de vivienda
    asequible y proveedores confiables en Texas.
    
    Fuentes: mobilehomeparkstore.com, Zillow, Realtor.com, Loopnet.com,
    mhvillage, Reonomy.com, Crexi.com, Costar.com, Har.com
    
    KPI: Tiempo promedio de identificación ≤10 días
    
    Args:
        location: Ciudad o área de búsqueda (ej: "Houston, TX")
        max_price: Precio máximo
        min_bedrooms: Mínimo de habitaciones
        property_type: Tipo de propiedad (default: mobile_home)
        sources: Lista de fuentes a consultar (opcional)
    
    Returns:
        Dict con resultados de búsqueda
    """
    try:
        # Default sources if not provided (según Excel del cliente)
        if not sources:
            sources = [
                "mobilehomeparkstore.com",
                "mhvillage.com",
                "zillow.com",
                "realtor.com",
                "loopnet.com",
                "reonomy.com",
                "crexi.com",
                "costar.com",
                "har.com"
            ]
        
        # Log search parameters
        search_params = {
            "location": location,
            "max_price": max_price,
            "min_bedrooms": min_bedrooms,
            "property_type": property_type,
            "sources": sources,
            "search_date": datetime.now().isoformat()
        }
        
        logger.info(f"[search_property_sources] Searching in {location} with params: {search_params}")
        
        # Note: In production, this would integrate with actual APIs
        # For now, return structured response for manual follow-up
        
        return {
            "ok": True,
            "search_params": search_params,
            "sources_to_check": sources,
            "recommended_actions": [
                f"Buscar en mobilehomeparkstore.com: {location}",
                f"Buscar en mhvillage.com: {location}",
                f"Revisar Zillow/Realtor para comparables",
                f"Verificar Loopnet/Crexi para propiedades comerciales",
                f"Consultar Reonomy/Costar para datos de mercado",
                f"Verificar HAR.com para el área de Houston"
            ],
            "search_urls": {
                "mobilehomeparkstore": f"https://www.mobilehomeparkstore.com/mobile-home-parks/{location.lower().replace(', ', '-').replace(' ', '-')}",
                "mhvillage": f"https://www.mhvillage.com/Parks/{location.replace(', ', '/').replace(' ', '-')}",
                "zillow": f"https://www.zillow.com/homes/{location.replace(', ', '-').replace(' ', '-')}_rb/",
                "realtor": f"https://www.realtor.com/realestateandhomes-search/{location.replace(', ', '_').replace(' ', '-')}",
                "loopnet": f"https://www.loopnet.com/search/mobile-home-parks/{location.replace(', ', '-').replace(' ', '-')}/for-sale/",
                "crexi": f"https://www.crexi.com/properties?q={location.replace(' ', '%20')}",
                "har": f"https://www.har.com/search/dosearch?for_sale=1&city={location.split(',')[0].replace(' ', '%20')}"
            },
            "kpi_target": "Tiempo identificación ≤10 días",
            "message": f"Búsqueda iniciada en {len(sources)} fuentes para {location}. Revisa las URLs proporcionadas."
        }
        
    except Exception as e:
        logger.error(f"[search_property_sources] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 1b: search_inventory_properties (NUEVA)
# Busca propiedades en NUESTRO inventario de Supabase por dirección/nombre
# ============================================================================

def search_inventory_properties(
    address: Optional[str] = None,
    name: Optional[str] = None,
    city: Optional[str] = None,
    status: Optional[str] = None,
    max_price: Optional[float] = None,
    min_bedrooms: Optional[int] = None
) -> Dict[str, Any]:
    """
    Busca propiedades en el inventario de Maninos Capital (base de datos Supabase).
    
    A diferencia de search_property_sources (que busca en sitios externos),
    esta función busca en NUESTRO inventario de propiedades ya registradas.
    
    Útil para:
    - Encontrar property_id por dirección
    - Ver propiedades disponibles
    - Buscar propiedades para contratos
    
    Args:
        address: Dirección parcial o completa (búsqueda flexible)
        name: Nombre de la propiedad
        city: Ciudad
        status: Estado del inventario (available, sold, pending, etc.)
        max_price: Precio máximo de venta
        min_bedrooms: Mínimo de habitaciones
    
    Returns:
        Dict con propiedades encontradas incluyendo sus UUIDs
    """
    from tools.supabase_client import sb
    
    try:
        # Build query
        query = sb.table("properties").select("*")
        
        # Apply filters
        if address:
            # Búsqueda flexible por dirección (case-insensitive)
            query = query.ilike("address", f"%{address}%")
        
        if name:
            query = query.ilike("name", f"%{name}%")
        
        if city:
            query = query.ilike("address", f"%{city}%")
        
        if status:
            query = query.eq("inventory_status", status)
        
        if max_price:
            query = query.lte("sale_price", max_price)
        
        if min_bedrooms:
            query = query.gte("bedrooms", min_bedrooms)
        
        # Execute query
        result = query.order("created_at", desc=True).limit(10).execute()
        
        if not result.data:
            return {
                "ok": True,
                "found": 0,
                "properties": [],
                "message": "No se encontraron propiedades con esos criterios en el inventario."
            }
        
        # Format results for LLM (include UUIDs prominently)
        properties = []
        for prop in result.data:
            properties.append({
                "id": prop.get("id"),  # UUID - importante para otras operaciones
                "name": prop.get("name"),
                "address": prop.get("address"),
                "sale_price": prop.get("sale_price"),
                "monthly_rent": prop.get("monthly_rent"),
                "bedrooms": prop.get("bedrooms"),
                "bathrooms": prop.get("bathrooms"),
                "year_built": prop.get("year_built"),
                "status": prop.get("inventory_status"),
                "acquisition_stage": prop.get("acquisition_stage")
            })
        
        logger.info(f"[search_inventory_properties] Found {len(properties)} properties")
        
        return {
            "ok": True,
            "found": len(properties),
            "properties": properties,
            "message": f"Se encontraron {len(properties)} propiedad(es) en el inventario."
        }
        
    except Exception as e:
        logger.error(f"[search_inventory_properties] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 2: evaluate_property_criteria
# Procedimiento: Evaluar atributos físicos, financieros y legales (Adquisiciones)
# ============================================================================

def evaluate_property_criteria(
    property_id: Optional[str] = None,
    property_name: str = "",
    property_address: str = "",
    asking_price: float = 0,
    market_value: float = 0,
    arv: float = 0,  # After Repair Value
    repair_estimate: float = 0,
    year_built: Optional[int] = None,
    bedrooms: Optional[int] = None,
    bathrooms: Optional[float] = None,
    square_feet: Optional[int] = None,
    checklist_results: Optional[Dict[str, bool]] = None,
    title_status: str = "unknown",
    vin_number: Optional[str] = None
) -> Dict[str, Any]:
    """
    EVALUAR ANTES DE COMPRAR: Analiza si una propiedad es buena inversión ANTES de adquirirla.
    
    ⚠️ USAR ESTA HERRAMIENTA CUANDO:
    - El usuario quiere EVALUAR o ANALIZAR una propiedad ANTES de comprarla
    - El usuario pregunta si una propiedad cumple la regla del 70%
    - El usuario quiere ver el checklist de 26 puntos
    - El usuario dice "evalúa", "analiza", "revisa si conviene comprar"
    
    ❌ NO USAR CUANDO:
    - El usuario quiere REGISTRAR una propiedad YA COMPRADA → usar register_property_inventory
    - El usuario dice "registra en inventario", "ya compramos", "añade al inventario"
    
    Aplica: Checklist 26 puntos + Regla del 70% (precio ≤ 70% valor mercado)
    KPI: 100% de propiedades verificadas antes de oferta
    
    Args:
        property_id: UUID de propiedad existente (opcional)
        property_name: Nombre de la propiedad
        property_address: Dirección
        asking_price: Precio de venta
        market_value: Valor de mercado
        arv: After Repair Value
        repair_estimate: Estimado de reparaciones
        year_built: Año de construcción
        bedrooms: Número de habitaciones
        bathrooms: Número de baños
        square_feet: Pies cuadrados
        checklist_results: Resultados del checklist (opcional)
        title_status: Estado del título (clean, liens, unknown)
        vin_number: Número VIN del mobile home
    
    Returns:
        Dict con evaluación completa
    """
    from .supabase_client import sb
    
    try:
        evaluation = {
            "ok": True,
            "property_name": property_name,
            "property_address": property_address,
            "evaluation_date": datetime.now().isoformat(),
            "financial_analysis": {},
            "checklist_analysis": {},
            "recommendation": "",
            "warnings": [],
            "passed": False
        }
        
        # =====================================================================
        # ANÁLISIS FINANCIERO (Regla del 70%)
        # =====================================================================
        
        if market_value > 0 and asking_price > 0:
            # Regla del 70%: Precio compra <= 70% del valor de mercado
            max_purchase_price_70 = market_value * 0.70
            price_to_market_ratio = (asking_price / market_value) * 100
            passes_70_rule = asking_price <= max_purchase_price_70
            
            evaluation["financial_analysis"]["70_rule"] = {
                "asking_price": asking_price,
                "market_value": market_value,
                "max_purchase_70pct": round(max_purchase_price_70, 2),
                "price_to_market_ratio": round(price_to_market_ratio, 1),
                "passes": passes_70_rule,
                "message": f"{'✅ CUMPLE' if passes_70_rule else '❌ NO CUMPLE'} regla del 70%. Precio/Mercado: {price_to_market_ratio:.1f}%"
            }
            
            if not passes_70_rule:
                evaluation["warnings"].append(f"Precio ({asking_price:,.0f}) excede 70% del mercado ({max_purchase_price_70:,.0f})")
        
        if arv > 0 and repair_estimate >= 0:
            # Regla del 70% con ARV: (ARV * 0.70) - Reparaciones = Max Offer
            max_offer_arv = (arv * 0.70) - repair_estimate
            
            evaluation["financial_analysis"]["arv_analysis"] = {
                "arv": arv,
                "repair_estimate": repair_estimate,
                "max_offer": round(max_offer_arv, 2),
                "formula": "Max Offer = (ARV × 70%) - Reparaciones",
                "message": f"Oferta máxima basada en ARV: ${max_offer_arv:,.2f}"
            }
            
            # Verificar que reparaciones < 30% del valor de venta
            if market_value > 0:
                repair_ratio = (repair_estimate / market_value) * 100
                passes_repair_rule = repair_ratio < 30
                
                evaluation["financial_analysis"]["repair_analysis"] = {
                    "repair_estimate": repair_estimate,
                    "repair_ratio": round(repair_ratio, 1),
                    "max_repair_ratio": 30,
                    "passes": passes_repair_rule,
                    "message": f"{'✅ CUMPLE' if passes_repair_rule else '❌ NO CUMPLE'} regla de reparaciones <30%. Ratio: {repair_ratio:.1f}%"
                }
                
                if not passes_repair_rule:
                    evaluation["warnings"].append(f"Reparaciones ({repair_ratio:.1f}%) exceden 30% del valor")
        
        # =====================================================================
        # ANÁLISIS CHECKLIST 26 PUNTOS
        # =====================================================================
        
        if checklist_results:
            total_items = 0
            passed_items = 0
            failed_required = []
            
            for category, items in CHECKLIST_26_POINTS.items():
                for item_key, item_info in items.items():
                    total_items += 1
                    result = checklist_results.get(item_key, False)
                    
                    if result:
                        passed_items += 1
                    elif item_info["required"]:
                        failed_required.append(f"{item_info['name']} ({category})")
            
            checklist_score = (passed_items / total_items) * 100 if total_items > 0 else 0
            passes_checklist = len(failed_required) == 0
            
            evaluation["checklist_analysis"] = {
                "total_items": total_items,
                "passed_items": passed_items,
                "score": round(checklist_score, 1),
                "passes": passes_checklist,
                "failed_required_items": failed_required,
                "message": f"Checklist: {passed_items}/{total_items} ({checklist_score:.1f}%)"
            }
            
            if failed_required:
                evaluation["warnings"].append(f"Items requeridos fallidos: {', '.join(failed_required[:3])}...")
        else:
            evaluation["checklist_analysis"] = {
                "status": "pending",
                "message": "Checklist de 26 puntos pendiente de completar"
            }
        
        # =====================================================================
        # ANÁLISIS DE TÍTULO
        # =====================================================================
        
        title_clean = title_status == "clean"
        evaluation["title_analysis"] = {
            "status": title_status,
            "is_clean": title_clean,
            "vin_number": vin_number,
            "message": f"{'✅ Título limpio' if title_clean else '⚠️ Verificar título - Estado: ' + title_status}"
        }
        
        if not title_clean:
            evaluation["warnings"].append(f"Título no está limpio: {title_status}")
        
        # =====================================================================
        # RECOMENDACIÓN FINAL
        # =====================================================================
        
        passes_financial = evaluation["financial_analysis"].get("70_rule", {}).get("passes", True)
        passes_repairs = evaluation["financial_analysis"].get("repair_analysis", {}).get("passes", True)
        passes_checklist = evaluation["checklist_analysis"].get("passes", True)
        
        all_pass = passes_financial and passes_repairs and passes_checklist and title_clean
        
        if all_pass:
            evaluation["recommendation"] = "APROBAR"
            evaluation["passed"] = True
            evaluation["message"] = "✅ Propiedad APROBADA. Cumple todos los criterios de adquisición."
        elif len(evaluation["warnings"]) <= 2:
            evaluation["recommendation"] = "REVISAR"
            evaluation["passed"] = False
            evaluation["message"] = f"⚠️ Propiedad requiere REVISIÓN. {len(evaluation['warnings'])} observaciones."
        else:
            evaluation["recommendation"] = "RECHAZAR"
            evaluation["passed"] = False
            evaluation["message"] = f"❌ Propiedad RECHAZADA. {len(evaluation['warnings'])} problemas identificados."
        
        # =====================================================================
        # GUARDAR EVALUACIÓN EN BD (si hay property_id)
        # =====================================================================
        
        if property_id:
            try:
                sb.table("process_logs").insert({
                    "entity_type": "property",
                    "entity_id": property_id,
                    "process": "ADQUIRIR",
                    "action": "property_evaluation",
                    "details": evaluation
                }).execute()
                
                # Update property stage
                sb.table("properties").update({
                    "acquisition_stage": "evaluacion_inicial",
                    "updated_at": datetime.now().isoformat()
                }).eq("id", property_id).execute()
                
                evaluation["property_id"] = property_id
            except Exception as db_error:
                logger.warning(f"[evaluate_property_criteria] Could not save to DB: {db_error}")
        
        logger.info(f"[evaluate_property_criteria] Evaluation: {evaluation['recommendation']}")
        
        return evaluation
        
    except Exception as e:
        logger.error(f"[evaluate_property_criteria] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 3: create_inspection_record
# Procedimiento: Inspeccionar y debida diligencia (Adquisiciones)
# ============================================================================

def create_inspection_record(
    property_id: str,
    inspector_name: str,
    inspection_date: str,
    inspection_type: str = "full",  # "full", "structural", "systems", "title"
    structural_findings: Optional[Dict[str, Any]] = None,
    systems_findings: Optional[Dict[str, Any]] = None,
    title_findings: Optional[Dict[str, Any]] = None,
    photos: Optional[List[str]] = None,
    overall_condition: str = "unknown",  # "excellent", "good", "fair", "poor", "unknown"
    recommended_repairs: Optional[List[Dict[str, Any]]] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Crea un registro de inspección para una propiedad.
    
    Procedimiento 3 del Excel: Inspeccionar las unidades y revisar el historial
    de títulos y contratos de terreno.
    
    Formato: Expediente de casa
    KPI: 0% de compras con defectos estructurales
    
    Args:
        property_id: UUID de la propiedad
        inspector_name: Nombre del inspector
        inspection_date: Fecha de inspección (YYYY-MM-DD)
        inspection_type: Tipo de inspección
        structural_findings: Hallazgos estructurales
        systems_findings: Hallazgos de sistemas (eléctrico, plomería, etc.)
        title_findings: Hallazgos de título
        photos: Lista de URLs de fotos
        overall_condition: Condición general
        recommended_repairs: Lista de reparaciones recomendadas
        notes: Notas adicionales
    
    Returns:
        Dict con registro de inspección
    """
    from .supabase_client import sb
    
    try:
        # Verify property exists
        prop_result = sb.table("properties").select("id, name, address").eq("id", property_id).execute()
        
        if not prop_result.data:
            return {"ok": False, "error": "Propiedad no encontrada"}
        
        prop = prop_result.data[0]
        
        # Default findings if not provided
        if structural_findings is None:
            structural_findings = {
                "frame": "pending",
                "floor": "pending",
                "roof": "pending",
                "walls": "pending",
                "windows": "pending"
            }
        
        if systems_findings is None:
            systems_findings = {
                "electrical": "pending",
                "plumbing": "pending",
                "hvac": "pending",
                "gas": "pending"
            }
        
        if title_findings is None:
            title_findings = {
                "title_status": "pending",
                "liens": "pending",
                "land_lease": "pending"
            }
        
        # Calculate total repair cost if repairs provided
        total_repair_cost = 0
        if recommended_repairs:
            total_repair_cost = sum(r.get("estimated_cost", 0) for r in recommended_repairs)
        
        # Determine if there are structural defects
        has_structural_defects = any(
            v in ["poor", "fail", "critical"] 
            for v in structural_findings.values()
        )
        
        inspection_record = {
            "property_id": property_id,
            "property_name": prop.get("name"),
            "property_address": prop.get("address"),
            "inspector_name": inspector_name,
            "inspection_date": inspection_date,
            "inspection_type": inspection_type,
            "structural_findings": structural_findings,
            "systems_findings": systems_findings,
            "title_findings": title_findings,
            "photos": photos or [],
            "overall_condition": overall_condition,
            "recommended_repairs": recommended_repairs or [],
            "total_repair_cost": total_repair_cost,
            "has_structural_defects": has_structural_defects,
            "notes": notes,
            "created_at": datetime.now().isoformat()
        }
        
        # Save to process_logs
        sb.table("process_logs").insert({
            "entity_type": "property",
            "entity_id": property_id,
            "process": "ADQUIRIR",
            "action": "inspection_completed",
            "details": inspection_record
        }).execute()
        
        # Update property stage and repair estimate
        update_data = {
            "acquisition_stage": "due_diligence",
            "updated_at": datetime.now().isoformat()
        }
        
        if total_repair_cost > 0:
            update_data["repair_estimate"] = total_repair_cost
        
        sb.table("properties").update(update_data).eq("id", property_id).execute()
        
        logger.info(f"[create_inspection_record] Inspection recorded for property {property_id}")
        
        # Determine recommendation
        if has_structural_defects:
            recommendation = "NO COMPRAR - Defectos estructurales"
        elif overall_condition in ["poor"]:
            recommendation = "REVISAR - Condición pobre"
        elif overall_condition in ["excellent", "good"]:
            recommendation = "PROCEDER - Buena condición"
        else:
            recommendation = "EVALUAR - Más información necesaria"
        
        return {
            "ok": True,
            "inspection_id": f"INS-{property_id[:8]}",
            "property_id": property_id,
            "property_name": prop.get("name"),
            "inspection_date": inspection_date,
            "inspector_name": inspector_name,
            "overall_condition": overall_condition,
            "has_structural_defects": has_structural_defects,
            "total_repair_cost": total_repair_cost,
            "recommendation": recommendation,
            "kpi_check": "✅ Sin defectos estructurales" if not has_structural_defects else "❌ Defectos estructurales encontrados",
            "message": f"Inspección registrada. Condición: {overall_condition}. {recommendation}"
        }
        
    except Exception as e:
        logger.error(f"[create_inspection_record] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 4: calculate_acquisition_offer
# Procedimiento: Establecer condiciones de adquisición (Adquisiciones)
# ============================================================================

def calculate_acquisition_offer(
    property_id: Optional[str] = None,
    market_value: Optional[float] = None,
    arv: Optional[float] = None,
    repair_estimate: Optional[float] = None,
    asking_price: Optional[float] = None,
    target_margin: float = 0.70,  # 70% default
    include_closing_costs: bool = True,
    closing_cost_estimate: float = 0
) -> Dict[str, Any]:
    """
    Calcula la oferta de adquisición usando la regla del 70%.
    
    Procedimiento 4 del Excel: Establecer el precio de compra dentro del margen establecido.
    
    KPI: Precio promedio de compra ≤70% del valor de mercado
    
    Args:
        property_id: UUID de la propiedad (OPCIONAL - si se omite, calcula solo con valores)
        market_value: Valor de mercado (requerido si no hay property_id)
        arv: After Repair Value (opcional)
        repair_estimate: Estimado de reparaciones (opcional)
        asking_price: Precio de venta actual
        target_margin: Margen objetivo (default 0.70 = 70%)
        include_closing_costs: Si incluir costos de cierre
        closing_cost_estimate: Estimado de costos de cierre
    
    Returns:
        Dict con cálculo de oferta
    """
    from .supabase_client import sb
    
    try:
        prop = None
        property_name = None
        property_address = None
        
        # If property_id provided, try to get data from DB
        if property_id:
            prop_result = sb.table("properties").select(
                "id, name, address, market_value, arv, repair_estimate, asking_price"
            ).eq("id", property_id).execute()
            
            if prop_result.data:
                prop = prop_result.data[0]
                property_name = prop.get("name")
                property_address = prop.get("address")
                
                # Use provided values or fall back to DB values
                market_value = market_value or prop.get("market_value") or 0
                arv = arv or prop.get("arv") or 0
                repair_estimate = repair_estimate or prop.get("repair_estimate") or 0
                asking_price = asking_price or prop.get("asking_price") or 0
        
        # Ensure we have at least market_value or arv
        market_value = market_value or 0
        arv = arv or 0
        repair_estimate = repair_estimate or 0
        asking_price = asking_price or 0
        
        if market_value == 0 and arv == 0:
            return {"ok": False, "error": "Se requiere market_value o ARV para calcular oferta"}
        
        offer_calculations = {
            "property_id": property_id,
            "property_name": property_name,
            "property_address": property_address,
            "target_margin": target_margin,
            "calculations": {},
            "recommended_offer": 0,
            "max_offer": 0
        }
        
        # Método 1: Basado en Market Value (Regla del 70%)
        if market_value > 0:
            max_offer_mv = market_value * target_margin
            
            offer_calculations["calculations"]["market_value_method"] = {
                "market_value": market_value,
                "target_margin": f"{target_margin * 100:.0f}%",
                "max_offer": round(max_offer_mv, 2),
                "formula": f"Market Value × {target_margin * 100:.0f}% = ${max_offer_mv:,.2f}"
            }
        
        # Método 2: Basado en ARV menos reparaciones
        if arv > 0:
            max_offer_arv = (arv * target_margin) - repair_estimate
            
            if include_closing_costs and closing_cost_estimate > 0:
                max_offer_arv -= closing_cost_estimate
            
            offer_calculations["calculations"]["arv_method"] = {
                "arv": arv,
                "repair_estimate": repair_estimate,
                "closing_costs": closing_cost_estimate if include_closing_costs else 0,
                "target_margin": f"{target_margin * 100:.0f}%",
                "max_offer": round(max_offer_arv, 2),
                "formula": f"(ARV × {target_margin * 100:.0f}%) - Reparaciones - Costos = ${max_offer_arv:,.2f}"
            }
        
        # Determinar oferta recomendada (usar el menor de los métodos)
        offers = []
        if "market_value_method" in offer_calculations["calculations"]:
            offers.append(offer_calculations["calculations"]["market_value_method"]["max_offer"])
        if "arv_method" in offer_calculations["calculations"]:
            offers.append(offer_calculations["calculations"]["arv_method"]["max_offer"])
        
        if offers:
            offer_calculations["max_offer"] = min(offers)
            # Oferta recomendada un poco más conservadora (95% del máximo)
            offer_calculations["recommended_offer"] = round(offer_calculations["max_offer"] * 0.95, 2)
        
        # Comparar con asking price
        if asking_price > 0:
            discount_needed = asking_price - offer_calculations["max_offer"]
            discount_pct = (discount_needed / asking_price) * 100 if discount_needed > 0 else 0
            
            offer_calculations["asking_price_analysis"] = {
                "asking_price": asking_price,
                "max_offer": offer_calculations["max_offer"],
                "discount_needed": round(discount_needed, 2),
                "discount_pct": round(discount_pct, 1),
                "negotiable": discount_needed <= (asking_price * 0.15),  # Máximo 15% descuento realista
                "message": f"Se necesita descuento de ${discount_needed:,.2f} ({discount_pct:.1f}%)" if discount_needed > 0 else "Precio dentro del rango"
            }
        
        # KPI check
        kpi_passes = False
        if market_value > 0 and offer_calculations["recommended_offer"] > 0:
            offer_to_market = (offer_calculations["recommended_offer"] / market_value) * 100
            kpi_passes = offer_to_market <= 70
            offer_calculations["kpi_check"] = {
                "target": "≤70% del valor de mercado",
                "actual": f"{offer_to_market:.1f}%",
                "passes": kpi_passes,
                "message": f"{'✅ CUMPLE' if kpi_passes else '❌ NO CUMPLE'} KPI del 70%"
            }
        
        # Save calculation to logs (only if property_id exists)
        if property_id:
            sb.table("process_logs").insert({
                "entity_type": "property",
                "entity_id": property_id,
                "process": "ADQUIRIR",
                "action": "offer_calculated",
                "details": offer_calculations
            }).execute()
            
            # Update property stage
            sb.table("properties").update({
                "acquisition_stage": "negociacion",
                "updated_at": datetime.now().isoformat()
            }).eq("id", property_id).execute()
        
        logger.info(f"[calculate_acquisition_offer] Offer calculated: ${offer_calculations['recommended_offer']:,.2f}")
        
        return {
            "ok": True,
            "property_id": property_id,
            "property_name": property_name,
            "max_offer": offer_calculations["max_offer"],
            "recommended_offer": offer_calculations["recommended_offer"],
            "asking_price": asking_price,
            "calculations": offer_calculations["calculations"],
            "kpi_check": offer_calculations.get("kpi_check", {}),
            "message": f"Oferta recomendada: ${offer_calculations['recommended_offer']:,.2f} (máximo: ${offer_calculations['max_offer']:,.2f})"
        }
        
    except Exception as e:
        logger.error(f"[calculate_acquisition_offer] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 5: register_property_inventory
# Procedimiento: Registrar en inventario (Legal)
# ============================================================================

def register_property_inventory(
    name: str,
    address: str,
    purchase_price: float,
    purchase_date: str,
    park_name: Optional[str] = None,
    lot_rent: Optional[float] = None,
    year_built: Optional[int] = None,
    bedrooms: Optional[int] = None,
    bathrooms: Optional[float] = None,
    square_feet: Optional[int] = None,
    hud_number: Optional[str] = None,
    vin_number: Optional[str] = None,
    market_value: Optional[float] = None,
    arv: Optional[float] = None,
    repair_estimate: Optional[float] = None,
    title_status: str = "clean",
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    REGISTRAR PROPIEDAD YA COMPRADA: Añade una propiedad que YA FUE ADQUIRIDA al inventario.
    
    ⚠️ USAR ESTA HERRAMIENTA CUANDO:
    - El usuario quiere REGISTRAR o AÑADIR una propiedad al inventario
    - El usuario dice "ya compramos", "registra en inventario", "añade esta propiedad"
    - El usuario proporciona precio de COMPRA (no precio de venta/mercado)
    - La propiedad ya es nuestra y queremos tenerla en el sistema
    
    ❌ NO USAR CUANDO:
    - El usuario quiere EVALUAR si conviene comprar → usar evaluate_property_criteria
    - El usuario pregunta por la regla del 70% → usar evaluate_property_criteria
    
    Esta herramienta NO evalúa, solo REGISTRA. La propiedad queda disponible para asignar a clientes.
    Formato: Base de datos inventario
    KPI: 100% de viviendas registradas en 24h
    
    Args:
        name: Nombre de la propiedad
        address: Dirección completa
        purchase_price: Precio de compra
        purchase_date: Fecha de compra (YYYY-MM-DD)
        park_name: Nombre del parque (opcional)
        lot_rent: Renta del lote mensual (opcional)
        year_built: Año de construcción (opcional)
        bedrooms: Número de habitaciones (opcional)
        bathrooms: Número de baños (opcional)
        square_feet: Pies cuadrados (opcional)
        hud_number: Número HUD (opcional)
        vin_number: Número VIN (opcional)
        market_value: Valor de mercado (opcional)
        arv: After Repair Value (opcional)
        repair_estimate: Estimado de reparaciones (opcional)
        title_status: Estado del título
        notes: Notas adicionales
    
    Returns:
        Dict con confirmación de registro
    """
    from .supabase_client import sb
    
    try:
        # Create property record
        property_data = {
            "name": name,
            "address": address,
            "purchase_price": purchase_price,
            "park_name": park_name,
            "lot_rent": lot_rent,
            "year_built": year_built,
            "bedrooms": bedrooms,
            "bathrooms": bathrooms,
            "square_feet": square_feet,
            "hud_number": hud_number,
            "market_value": market_value,
            "arv": arv,
            "repair_estimate": repair_estimate,
            "status": "owned",
            "acquisition_stage": "cierre_compra",  # Property has been purchased
            "inventory_status": "available",
            "listing_active": False,  # Not listed yet
            "title_status": title_status,
        }
        
        # Remove None values
        property_data = {k: v for k, v in property_data.items() if v is not None}
        
        # Insert property
        result = sb.table("properties").insert(property_data).execute()
        
        if not result.data:
            return {"ok": False, "error": "Error al insertar propiedad en la base de datos"}
        
        property_id = result.data[0]["id"]
        
        # Log the registration
        sb.table("process_logs").insert({
            "entity_type": "property",
            "entity_id": property_id,
            "process": "ADQUIRIR",
            "action": "registered_in_inventory",
            "details": {
                "purchase_price": purchase_price,
                "purchase_date": purchase_date,
                "registration_date": datetime.now().isoformat(),
                "notes": notes
            }
        }).execute()
        
        logger.info(f"[register_property_inventory] Property registered: {property_id}")
        
        # Calculate potential profit if we have the values
        potential_profit = None
        if market_value and purchase_price:
            potential_profit = market_value - purchase_price
        elif arv and purchase_price and repair_estimate:
            potential_profit = arv - purchase_price - (repair_estimate or 0)
        
        return {
            "ok": True,
            "property_id": property_id,
            "name": name,
            "address": address,
            "purchase_price": purchase_price,
            "purchase_date": purchase_date,
            "status": "owned",
            "inventory_status": "available",
            "potential_profit": potential_profit,
            "kpi_check": "✅ Propiedad registrada en inventario",
            "next_steps": [
                "Completar reparaciones si es necesario",
                "Definir precio de venta",
                "Activar listing en catálogo (proceso COMERCIALIZAR)"
            ],
            "message": f"Propiedad '{name}' registrada exitosamente. ID: {property_id}"
        }
        
    except Exception as e:
        logger.error(f"[register_property_inventory] Error: {e}")
        return {"ok": False, "error": str(e)}

