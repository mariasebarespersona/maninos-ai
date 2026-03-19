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
  - notas (optional notes)

Total = sum of all prices.
"""

# ============================================================================
# THE 19 RENOVATION ITEMS (PARTIDAS) — from Caza Brothers template
# Each item now has mano_obra + materiales (precio = MO + Mat)
# dias/start_day from the Caza Brothers construction calendar
# ============================================================================

RENOVATION_ITEMS = [
    {"id": "demolicion",    "partida": 1,  "concepto": "Demolición y desmantelamiento",                                  "mano_obra": 250.00,  "materiales": 0.00,  "precio": 250.00,  "dias": 1, "start_day": 1,  "notas": ""},
    {"id": "limpieza",      "partida": 2,  "concepto": "Limpieza general de obra",                                       "mano_obra": 200.00,  "materiales": 0.00,  "precio": 200.00,  "dias": 1, "start_day": 2,  "notas": ""},
    {"id": "muros",         "partida": 3,  "concepto": "Reparación de muros (sheetrock, trim, coqueo, floteo)",           "mano_obra": 390.00,  "materiales": 0.00,  "precio": 390.00,  "dias": 2, "start_day": 2,  "notas": ""},
    {"id": "electricidad",  "partida": 4,  "concepto": "Electricidad, cableado",                                         "mano_obra": 200.00,  "materiales": 0.00,  "precio": 200.00,  "dias": 1, "start_day": 3,  "notas": ""},
    {"id": "techos_ext",    "partida": 5,  "concepto": "Reparación de techos exteriores (conglomerado, shingles)",        "mano_obra": 390.00,  "materiales": 0.00,  "precio": 390.00,  "dias": 2, "start_day": 3,  "notas": ""},
    {"id": "cielos_int",    "partida": 6,  "concepto": "Reparación de cielos interiores (tablaroca, resanes, popcorn)",   "mano_obra": 390.00,  "materiales": 0.00,  "precio": 390.00,  "dias": 2, "start_day": 3,  "notas": ""},
    {"id": "textura_muros", "partida": 7,  "concepto": "Textura muros",                                                  "mano_obra": 390.00,  "materiales": 0.00,  "precio": 390.00,  "dias": 1, "start_day": 4,  "notas": ""},
    {"id": "siding",        "partida": 8,  "concepto": "Siding aprobado (lámina, vynil, madera)",                         "mano_obra": 0.00,    "materiales": 0.00,  "precio": 0.00,    "dias": 2, "start_day": 4,  "notas": ""},
    {"id": "pisos",         "partida": 9,  "concepto": "Pisos (plywood y acabados)",                                      "mano_obra": 1500.00, "materiales": 0.00,  "precio": 1500.00, "dias": 1, "start_day": 5,  "notas": ""},
    {"id": "gabinetes",     "partida": 10, "concepto": "Gabinetes reparar carpintería (cocina/baños)",                    "mano_obra": 1000.00, "materiales": 0.00,  "precio": 1000.00, "dias": 1, "start_day": 4,  "notas": ""},
    {"id": "pintura_ext",   "partida": 11, "concepto": "Pintura exterior (lámina y plástico sin reparaciones)",           "mano_obra": 1300.00, "materiales": 0.00,  "precio": 1300.00, "dias": 1, "start_day": 5,  "notas": ""},
    {"id": "pintura_int",   "partida": 12, "concepto": "Pintura interior y cielos",                                      "mano_obra": 390.00,  "materiales": 0.00,  "precio": 390.00,  "dias": 2, "start_day": 5,  "notas": ""},
    {"id": "pintura_gab",   "partida": 13, "concepto": "Pintura gabinetes",                                              "mano_obra": 800.00,  "materiales": 0.00,  "precio": 800.00,  "dias": 2, "start_day": 5,  "notas": ""},
    {"id": "banos",         "partida": 14, "concepto": "Baños (sanitarios, lavamanos, kits de plomería)",                 "mano_obra": 200.00,  "materiales": 0.00,  "precio": 200.00,  "dias": 1, "start_day": 7,  "notas": ""},
    {"id": "cocina",        "partida": 15, "concepto": "Cocina (formica, tarja, kits de plomería)",                       "mano_obra": 200.00,  "materiales": 0.00,  "precio": 200.00,  "dias": 2, "start_day": 6,  "notas": ""},
    {"id": "finishing",     "partida": 16, "concepto": "Finishing - Instalación de lámparas, apagadores, contactos",      "mano_obra": 200.00,  "materiales": 0.00,  "precio": 200.00,  "dias": 1, "start_day": 8,  "notas": ""},
    {"id": "plomeria",      "partida": 17, "concepto": "Plomería (líneas de agua, desagüe, cespol kits)",                "mano_obra": 200.00,  "materiales": 0.00,  "precio": 200.00,  "dias": 1, "start_day": 7,  "notas": ""},
    {"id": "acabados",      "partida": 18, "concepto": "Acabados finales (retoques, limpieza fina, staging)",             "mano_obra": 200.00,  "materiales": 0.00,  "precio": 200.00,  "dias": 1, "start_day": 9,  "notas": ""},
    {"id": "cerraduras",    "partida": 19, "concepto": "Cerraduras y herrajes",                                          "mano_obra": 200.00,  "materiales": 0.00,  "precio": 200.00,  "dias": 1, "start_day": 9,  "notas": ""},
]

# Suggested total MO by trailer size (for quick auto-suggestion)
MO_BY_SIZE = {"14x66": 1300, "16x76": 1500, "18x76": 1800, "doble": None}


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
            "demolicion": { "mano_obra": 300, "materiales": 50, "dias": 2, "notas": "..." },
            ...
        },
        "custom_items": [ { "id": "custom_1", "concepto": "...", "mano_obra": 0, "materiales": 0, "dias": 1, "notas": "" } ]
    }

    Backward compat: if saved item only has "precio" (no mano_obra), assign all to mano_obra.
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

    return {
        "items": template,
        "total": round(total, 2),
        "total_mano_obra": round(total_mo, 2),
        "total_materiales": round(total_mat, 2),
        "dias_estimados": max_day,
    }
