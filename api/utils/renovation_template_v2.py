"""
Renovation Template V2 — Simplified checklist from Caza Brothers (Feb 2026).

No longer divided by bedrooms/bathrooms. Single flat checklist with 19 items.
Each item has only:
  - concepto (concept / description)
  - precio (price — editable, starts at the base estimate)
  - notas (optional notes)

Total = sum of all prices.
"""

# ============================================================================
# THE 19 RENOVATION ITEMS (PARTIDAS) — from Caza Brothers template
# ============================================================================

RENOVATION_ITEMS = [
    {"id": "demolicion",    "partida": 1,  "concepto": "Demolición y desmantelamiento",                                  "precio": 250.00,  "notas": ""},
    {"id": "limpieza",      "partida": 2,  "concepto": "Limpieza general de obra",                                       "precio": 200.00,  "notas": ""},
    {"id": "muros",         "partida": 3,  "concepto": "Reparación de muros (sheetrock, trim, coqueo, floteo)",           "precio": 390.00,  "notas": ""},
    {"id": "electricidad",  "partida": 4,  "concepto": "Electricidad, cableado",                                         "precio": 200.00,  "notas": ""},
    {"id": "techos_ext",    "partida": 5,  "concepto": "Reparación de techos exteriores (conglomerado, shingles)",        "precio": 390.00,  "notas": ""},
    {"id": "cielos_int",    "partida": 6,  "concepto": "Reparación de cielos interiores (tablaroca, resanes, popcorn)",   "precio": 390.00,  "notas": ""},
    {"id": "textura_muros", "partida": 7,  "concepto": "Textura muros",                                                  "precio": 390.00,  "notas": ""},
    {"id": "siding",        "partida": 8,  "concepto": "Siding aprobado (lámina, vynil, madera)",                         "precio": 0.00,    "notas": ""},
    {"id": "pisos",         "partida": 9,  "concepto": "Pisos (plywood y acabados)",                                      "precio": 1500.00, "notas": ""},
    {"id": "gabinetes",     "partida": 10, "concepto": "Gabinetes reparar carpintería (cocina/baños)",                    "precio": 1000.00, "notas": ""},
    {"id": "pintura_ext",   "partida": 11, "concepto": "Pintura exterior (lámina y plástico sin reparaciones)",           "precio": 1300.00, "notas": ""},
    {"id": "pintura_int",   "partida": 12, "concepto": "Pintura interior y cielos",                                      "precio": 390.00,  "notas": ""},
    {"id": "pintura_gab",   "partida": 13, "concepto": "Pintura gabinetes",                                              "precio": 800.00,  "notas": ""},
    {"id": "banos",         "partida": 14, "concepto": "Baños (sanitarios, lavamanos, kits de plomería)",                 "precio": 200.00,  "notas": ""},
    {"id": "cocina",        "partida": 15, "concepto": "Cocina (formica, tarja, kits de plomería)",                       "precio": 200.00,  "notas": ""},
    {"id": "finishing",     "partida": 16, "concepto": "Finishing - Instalación de lámparas, apagadores, contactos",      "precio": 200.00,  "notas": ""},
    {"id": "plomeria",      "partida": 17, "concepto": "Plomería (líneas de agua, desagüe, cespol kits)",                "precio": 200.00,  "notas": ""},
    {"id": "acabados",      "partida": 18, "concepto": "Acabados finales (retoques, limpieza fina, staging)",             "precio": 200.00,  "notas": ""},
    {"id": "cerraduras",    "partida": 19, "concepto": "Cerraduras y herrajes",                                          "precio": 200.00,  "notas": ""},
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
    return {
        "items": items,
        "total": round(total, 2),
    }


def build_quote_from_saved(saved_data: dict) -> dict:
    """
    Merge saved data (from DB) with the template.
    saved_data format: {
        "items": { "demolicion": { "precio": 300, "notas": "..." }, ... },
        "custom_items": [ { "id": "custom_1", "concepto": "...", "precio": 0, "notas": "" } ]
    }
    """
    import copy
    template = copy.deepcopy(RENOVATION_ITEMS)
    saved_items = saved_data.get("items", {})
    custom_items = saved_data.get("custom_items", [])

    total = 0.0

    for item in template:
        item_saved = saved_items.get(item["id"], {})
        if "precio" in item_saved:
            item["precio"] = float(item_saved["precio"])
        if "notas" in item_saved:
            item["notas"] = item_saved["notas"]
        total += item["precio"]

    # Append custom items added by employees
    for ci in custom_items:
        ci.setdefault("precio", 0.0)
        ci.setdefault("notas", "")
        ci.setdefault("is_custom", True)
        template.append(ci)
        total += float(ci.get("precio", 0))

    return {
        "items": template,
        "total": round(total, 2),
    }
