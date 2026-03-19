"""
Renovation Template V2 — Simplified checklist from Caza Brothers (Feb 2026).

No longer divided by bedrooms/bathrooms. Single flat checklist with 19 items.
Each item has:
  - concepto (concept / description)
  - mano_obra (labor cost)
  - materiales (materials cost)
  - precio (total = mano_obra + materiales, computed)
  - dias (duration in days)
  - start_day (default start day in schedule)
  - unidad (unit: día/proyecto/casa/pieza/ventana)
  - notas (optional notes)

Total = sum of all prices.

V4 additions (Mar 2026):
  - Material defaults from CASA H06 spreadsheet ($5,014 total)
  - MO updated from Hoja 2 (Caza Brothers format)
  - unidad field per item
  - ITEM_SUBFIELDS for per-partida extra fields
  - Business rules from spreadsheet
"""

# ============================================================================
# THE 19 RENOVATION ITEMS (PARTIDAS) — from Caza Brothers template
# MO from Hoja 2 (Formato Presupuesto), Materials from Hoja 1 (CASA H06)
# ============================================================================

RENOVATION_ITEMS = [
    {"id": "demolicion",    "partida": 1,  "concepto": "Demolición y desmantelamiento",                                  "mano_obra": 300.00,  "materiales": 0.00,    "precio": 300.00,    "dias": 1, "start_day": 1,  "unidad": "día",      "notas": ""},
    {"id": "limpieza",      "partida": 2,  "concepto": "Limpieza general de obra",                                       "mano_obra": 300.00,  "materiales": 50.00,   "precio": 350.00,    "dias": 1, "start_day": 2,  "unidad": "día",      "notas": ""},
    {"id": "muros",         "partida": 3,  "concepto": "Reparación de muros (sheetrock, trim, coqueo, floteo)",           "mano_obra": 400.00,  "materiales": 1227.00, "precio": 1627.00,   "dias": 2, "start_day": 2,  "unidad": "día",      "notas": ""},
    {"id": "electricidad",  "partida": 4,  "concepto": "Electricidad, cableado",                                         "mano_obra": 300.00,  "materiales": 150.00,  "precio": 450.00,    "dias": 1, "start_day": 3,  "unidad": "día",      "notas": ""},
    {"id": "techos_ext",    "partida": 5,  "concepto": "Reparación de techos exteriores (conglomerado, shingles)",        "mano_obra": 3500.00, "materiales": 320.00,  "precio": 3820.00,   "dias": 2, "start_day": 3,  "unidad": "proyecto", "notas": ""},
    {"id": "cielos_int",    "partida": 6,  "concepto": "Reparación de cielos interiores (tablaroca, resanes, popcorn)",   "mano_obra": 400.00,  "materiales": 520.00,  "precio": 920.00,    "dias": 2, "start_day": 3,  "unidad": "día",      "notas": ""},
    {"id": "textura_muros", "partida": 7,  "concepto": "Textura muros",                                                  "mano_obra": 400.00,  "materiales": 80.00,   "precio": 480.00,    "dias": 1, "start_day": 4,  "unidad": "casa",     "notas": ""},
    {"id": "siding",        "partida": 8,  "concepto": "Siding aprobado (lámina, vynil, madera)",                         "mano_obra": 0.00,    "materiales": 422.00,  "precio": 422.00,    "dias": 2, "start_day": 4,  "unidad": "proyecto", "notas": ""},
    {"id": "pisos",         "partida": 9,  "concepto": "Pisos (plywood y acabados)",                                      "mano_obra": 1500.00, "materiales": 1993.00, "precio": 3493.00,   "dias": 1, "start_day": 5,  "unidad": "proyecto", "notas": ""},
    {"id": "gabinetes",     "partida": 10, "concepto": "Gabinetes reparar carpintería (cocina/baños)",                    "mano_obra": 1000.00, "materiales": 634.00,  "precio": 1634.00,   "dias": 1, "start_day": 4,  "unidad": "proyecto", "notas": ""},
    {"id": "pintura_ext",   "partida": 11, "concepto": "Pintura exterior (lámina y plástico sin reparaciones)",           "mano_obra": 160.00,  "materiales": 200.00,  "precio": 360.00,    "dias": 1, "start_day": 5,  "unidad": "día",      "notas": ""},
    {"id": "pintura_int",   "partida": 12, "concepto": "Pintura interior y cielos",                                      "mano_obra": 390.00,  "materiales": 150.00,  "precio": 540.00,    "dias": 2, "start_day": 5,  "unidad": "día",      "notas": ""},
    {"id": "pintura_gab",   "partida": 13, "concepto": "Pintura gabinetes",                                              "mano_obra": 250.00,  "materiales": 100.00,  "precio": 350.00,    "dias": 2, "start_day": 5,  "unidad": "día",      "notas": ""},
    {"id": "banos",         "partida": 14, "concepto": "Baños (sanitarios, lavamanos, kits de plomería)",                 "mano_obra": 200.00,  "materiales": 350.00,  "precio": 550.00,    "dias": 1, "start_day": 7,  "unidad": "proyecto", "notas": ""},
    {"id": "cocina",        "partida": 15, "concepto": "Cocina (formica, tarja, kits de plomería)",                       "mano_obra": 200.00,  "materiales": 300.00,  "precio": 500.00,    "dias": 2, "start_day": 6,  "unidad": "proyecto", "notas": ""},
    {"id": "finishing",     "partida": 16, "concepto": "Finishing - Instalación de lámparas, apagadores, contactos",      "mano_obra": 1500.00, "materiales": 220.00,  "precio": 1720.00,   "dias": 1, "start_day": 8,  "unidad": "pieza",    "notas": ""},
    {"id": "plomeria",      "partida": 17, "concepto": "Plomería (líneas de agua, desagüe, cespol kits)",                "mano_obra": 200.00,  "materiales": 47.00,   "precio": 247.00,    "dias": 1, "start_day": 7,  "unidad": "proyecto", "notas": ""},
    {"id": "acabados",      "partida": 18, "concepto": "Acabados finales (retoques, limpieza fina, staging)",             "mano_obra": 200.00,  "materiales": 50.00,   "precio": 250.00,    "dias": 1, "start_day": 9,  "unidad": "día",      "notas": ""},
    {"id": "cerraduras",    "partida": 19, "concepto": "Cerraduras y herrajes",                                          "mano_obra": 200.00,  "materiales": 80.00,   "precio": 280.00,    "dias": 1, "start_day": 9,  "unidad": "proyecto", "notas": ""},
]

# Suggested total MO by trailer size (for quick auto-suggestion)
MO_BY_SIZE = {"14x66": 1300, "16x76": 1500, "18x76": 1800, "doble": None}

# ============================================================================
# SUB-FIELDS PER PARTIDA — from Hoja 2 (Formato Presupuesto)
# ============================================================================

ITEM_SUBFIELDS = {
    "demolicion":    [{"key": "muebles", "label": "Muebles", "type": "text"}, {"key": "equipos", "label": "Equipos", "type": "text"}, {"key": "valor_demo", "label": "Valor", "type": "text"}],
    "muros":         [{"key": "cant_hojas", "label": "Cant. hojas", "type": "number"}],
    "techos_ext":    [{"key": "m2", "label": "m²", "type": "number"}, {"key": "cant", "label": "Cant.", "type": "number"}, {"key": "detalle", "label": "Detalle", "type": "text"}],
    "cielos_int":    [{"key": "zona", "label": "Zona", "type": "text"}, {"key": "cant", "label": "Cant.", "type": "number"}],
    "textura_muros": [{"key": "aplica", "label": "Aplica", "type": "boolean"}, {"key": "donde", "label": "Dónde", "type": "text"}, {"key": "cant", "label": "Cant.", "type": "number"}],
    "siding":        [{"key": "tipo_siding", "label": "Tipo", "type": "select", "options": ["lámina", "vinyl", "madera"]}],
    "pisos":         [{"key": "zona", "label": "Zona", "type": "text"}, {"key": "cant", "label": "Cant.", "type": "number"}],
    "gabinetes":     [{"key": "cocina", "label": "Cocina", "type": "text"}, {"key": "bano1", "label": "Baño 1", "type": "text"}, {"key": "bano2", "label": "Baño 2", "type": "text"}],
    "pintura_int":   [{"key": "color_pared", "label": "Color pared", "type": "text"}, {"key": "color_cielos", "label": "Cielos", "type": "text"}],
    "pintura_gab":   [{"key": "color", "label": "Color", "type": "text"}],
}

# ============================================================================
# BUSINESS RULES — from Hoja 1 header notes
# ============================================================================

BUSINESS_RULES = [
    "Los materiales NO se pueden repetir.",
    "El trabajador y manager de remodelación realizan la lista juntos.",
    "Sobrante de materiales debe ser entregado al manager.",
    "NO se permite compra de herramienta para trabajadores.",
    "Si se usa material de bodega → agregar a lista y reducir de bodega.",
]


def get_template_v2() -> list[dict]:
    """Return the flat renovation template (19 items)."""
    import copy
    return copy.deepcopy(RENOVATION_ITEMS)


def get_all_item_ids_for_house_v2() -> list[str]:
    """Return all item IDs for the V2 checklist."""
    return [item["id"] for item in RENOVATION_ITEMS]


def get_blank_quote() -> dict:
    """Return a blank quote with all 19 items at their default prices."""
    items = get_template_v2()
    total = sum(item["precio"] for item in items)
    total_mo = sum(item["mano_obra"] for item in items)
    total_materiales = sum(item["materiales"] for item in items)
    max_day = max(item["start_day"] + item["dias"] for item in items)
    return {
        "items": items,
        "total": round(total, 2),
        "total_mano_obra": round(total_mo, 2),
        "total_materiales": round(total_materiales, 2),
        "dias_estimados": max_day,
    }


def build_quote_from_saved(saved_data: dict) -> dict:
    """
    Merge saved data (from DB) with the template.
    saved_data format: {
        "items": {
            "demolicion": { "mano_obra": 300, "materiales": 50, "dias": 2, "notas": "...", "responsable": "...", "subfields": {...} },
            ...
        },
        "custom_items": [ ... ],
        "responsable": "Juan Pérez",
        "fecha_inicio": "2026-03-20",
        "fecha_fin": "2026-04-10",
        "approval_status": "draft",
    }

    Backward compat: if saved item only has "precio" (no mano_obra), assign all to mano_obra.
    Backward compat: items without "unidad" or "responsable" get defaults from template.
    """
    import copy
    template = copy.deepcopy(RENOVATION_ITEMS)
    saved_items = saved_data.get("items", {})
    custom_items = saved_data.get("custom_items", [])

    total = 0.0
    total_mo = 0.0
    total_mat = 0.0

    for item in template:
        item_saved = saved_items.get(item["id"], {})
        if item_saved:
            # Backward compat: old format only has "precio"
            if "mano_obra" in item_saved:
                item["mano_obra"] = float(item_saved["mano_obra"])
            elif "precio" in item_saved:
                # Legacy: assign entire precio to mano_obra
                item["mano_obra"] = float(item_saved["precio"])

            if "materiales" in item_saved:
                item["materiales"] = float(item_saved["materiales"])

            if "dias" in item_saved:
                item["dias"] = int(item_saved["dias"])

            if "start_day" in item_saved:
                item["start_day"] = int(item_saved["start_day"])

            if "notas" in item_saved:
                item["notas"] = item_saved["notas"]

            # V4 fields
            if "responsable" in item_saved:
                item["responsable"] = item_saved["responsable"]

            if "subfields" in item_saved:
                item["subfields"] = item_saved["subfields"]

            # Always recompute precio
            item["precio"] = round(item["mano_obra"] + item["materiales"], 2)

        total += item["precio"]
        total_mo += item["mano_obra"]
        total_mat += item["materiales"]

    # Append custom items added by employees
    for ci in custom_items:
        ci.setdefault("mano_obra", 0.0)
        ci.setdefault("materiales", 0.0)
        ci.setdefault("dias", 1)
        ci.setdefault("start_day", 10)
        ci.setdefault("notas", "")
        ci.setdefault("unidad", "proyecto")
        ci.setdefault("is_custom", True)

        # Backward compat: old custom items with only "precio"
        if "mano_obra" not in ci or (ci["mano_obra"] == 0 and ci.get("precio", 0) > 0):
            ci["mano_obra"] = float(ci.get("precio", 0))

        ci["precio"] = round(float(ci.get("mano_obra", 0)) + float(ci.get("materiales", 0)), 2)
        template.append(ci)
        total += ci["precio"]
        total_mo += float(ci.get("mano_obra", 0))
        total_mat += float(ci.get("materiales", 0))

    max_day = max((item["start_day"] + item["dias"] for item in template), default=0)

    result = {
        "items": template,
        "total": round(total, 2),
        "total_mano_obra": round(total_mo, 2),
        "total_materiales": round(total_mat, 2),
        "dias_estimados": max_day,
    }

    # Pass through project metadata
    if "responsable" in saved_data:
        result["responsable"] = saved_data["responsable"]
    if "fecha_inicio" in saved_data:
        result["fecha_inicio"] = saved_data["fecha_inicio"]
    if "fecha_fin" in saved_data:
        result["fecha_fin"] = saved_data["fecha_fin"]
    if "approval_status" in saved_data:
        result["approval_status"] = saved_data["approval_status"]

    return result
