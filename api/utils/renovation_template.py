"""
Renovation Template — Structured data from "Cotizaciones Caza Brothers" Excel.

Dynamic room generation based on house configuration (bedrooms/bathrooms).
Example: A 3/2 house generates:
  - Master Bedroom + Bedroom 2 + Bedroom 3  (3 bedrooms)
  - Master Bathroom + Bathroom 2             (2 bathrooms)
  - Kitchen, Hallway/Living Room, Utility Room, Exterior  (always present)
"""

# ============================================================================
# ROOM TEMPLATES — Items per room type
# ============================================================================

BEDROOM_ITEMS = [
    {"base_id": "wall_patches", "name": "Wall patches", "name_es": "Parches de pared", "unit_price": 40, "unit": "pz"},
    {"base_id": "floor_patches", "name": "Floor patches", "name_es": "Parches de piso", "unit_price": 100, "unit": "pz"},
    {"base_id": "doors_paint", "name": "Doors paint only", "name_es": "Pintar puertas", "unit_price": 40, "unit": "pz"},
    {"base_id": "door", "name": "Door", "name_es": "Puerta nueva", "unit_price": 120, "unit": "pz"},
    {"base_id": "hinges", "name": "Hinges", "name_es": "Bisagras", "unit_price": 10, "unit": "pz"},
    {"base_id": "knobs", "name": "Knobs", "name_es": "Perillas", "unit_price": 15, "unit": "pz"},
    {"base_id": "closet_repair", "name": "Closet repair", "name_es": "Reparar closet", "unit_price": 50, "unit": "pz"},
    {"base_id": "texture", "name": "Texture", "name_es": "Textura", "unit_price": 200, "unit": "cuarto"},
    {"base_id": "paint", "name": "Paint", "name_es": "Pintura", "unit_price": 200, "unit": "cuarto"},
    {"base_id": "lights", "name": "Lights", "name_es": "Luces", "unit_price": 40, "unit": "pz"},
    {"base_id": "ceiling_repairs", "name": "Ceiling repairs", "name_es": "Reparar techo", "unit_price": 50, "unit": "pz"},
    {"base_id": "replace_glass", "name": "Replace glass in windows", "name_es": "Reemplazar vidrio ventanas", "unit_price": 100, "unit": "pz"},
    {"base_id": "windows_trim", "name": "Windows trim (ft)", "name_es": "Moldura ventanas (ft)", "unit_price": 3, "unit": "ft"},
    {"base_id": "door_trim", "name": "Door trim (ft)", "name_es": "Moldura puerta (ft)", "unit_price": 2, "unit": "ft"},
    {"base_id": "crown_molding", "name": "Crown molding (ft)", "name_es": "Moldura corona (ft)", "unit_price": 2, "unit": "ft"},
    {"base_id": "baseboard", "name": "Baseboard (ft)", "name_es": "Zócalo (ft)", "unit_price": 2, "unit": "ft"},
]

BATHROOM_ITEMS = [
    {"base_id": "wall_patches", "name": "Wall patches", "name_es": "Parches de pared", "unit_price": 40, "unit": "pz"},
    {"base_id": "floor_patches", "name": "Floor patches", "name_es": "Parches de piso", "unit_price": 100, "unit": "pz"},
    {"base_id": "doors_paint", "name": "Doors paint only", "name_es": "Pintar puertas", "unit_price": 40, "unit": "pz"},
    {"base_id": "door", "name": "Door 24x80", "name_es": "Puerta 24x80", "unit_price": 120, "unit": "pz"},
    {"base_id": "hinges", "name": "Hinges", "name_es": "Bisagras", "unit_price": 10, "unit": "pz"},
    {"base_id": "knobs", "name": "Knobs", "name_es": "Perillas", "unit_price": 15, "unit": "pz"},
    {"base_id": "toilet", "name": "Toilet", "name_es": "Sanitario", "unit_price": 200, "unit": "pz"},
    {"base_id": "vanity", "name": "Vanity", "name_es": "Tocador/Vanity", "unit_price": 200, "unit": "pz"},
    {"base_id": "resurfacing_shower", "name": "Resurfacing shower or tub", "name_es": "Resurfacing regadera/tina", "unit_price": 250, "unit": "pz"},
    {"base_id": "faucets_shower", "name": "Faucets shower", "name_es": "Llaves regadera", "unit_price": 80, "unit": "pz"},
    {"base_id": "texture", "name": "Texture", "name_es": "Textura", "unit_price": 100, "unit": "cuarto"},
    {"base_id": "paint", "name": "Paint", "name_es": "Pintura", "unit_price": 100, "unit": "cuarto"},
    {"base_id": "lights", "name": "Lights", "name_es": "Luces", "unit_price": 40, "unit": "pz"},
    {"base_id": "ceiling_repairs", "name": "Ceiling repairs", "name_es": "Reparar techo", "unit_price": 100, "unit": "pz"},
    {"base_id": "resurfacing_vanity", "name": "Resurfacing vanity", "name_es": "Resurfacing tocador", "unit_price": 125, "unit": "pz"},
    {"base_id": "mirror", "name": "Mirror", "name_es": "Espejo", "unit_price": 75, "unit": "pz"},
    {"base_id": "crown_molding", "name": "Crown molding (ft)", "name_es": "Moldura corona (ft)", "unit_price": 2, "unit": "ft"},
    {"base_id": "baseboard", "name": "Baseboard (ft)", "name_es": "Zócalo (ft)", "unit_price": 2, "unit": "ft"},
    {"base_id": "replace_glass", "name": "Replace glass in windows", "name_es": "Reemplazar vidrio ventanas", "unit_price": 100, "unit": "pz"},
    {"base_id": "new_sink", "name": "New sink", "name_es": "Lavabo nuevo", "unit_price": 40, "unit": "pz"},
    {"base_id": "new_faucet", "name": "New faucet", "name_es": "Llave nueva", "unit_price": 50, "unit": "pz"},
]

# Common rooms — always present regardless of house size
KITCHEN_ROOM = {
    "id": "kitchen",
    "name": "Kitchen",
    "name_es": "Cocina",
    "icon": "🍳",
    "items": [
        {"id": "kt_wall_patches", "name": "Wall patches", "name_es": "Parches de pared", "unit_price": 40, "unit": "pz"},
        {"id": "kt_floor_patches", "name": "Floor patches", "name_es": "Parches de piso", "unit_price": 100, "unit": "pz"},
        {"id": "kt_sink_faucet", "name": "Sink + faucet", "name_es": "Fregadero + llave", "unit_price": 100, "unit": "pz"},
        {"id": "kt_texture", "name": "Texture", "name_es": "Textura", "unit_price": 150, "unit": "cuarto"},
        {"id": "kt_paint", "name": "Paint", "name_es": "Pintura", "unit_price": 200, "unit": "cuarto"},
        {"id": "kt_lights", "name": "Lights", "name_es": "Luces", "unit_price": 40, "unit": "pz"},
        {"id": "kt_ceiling_repairs", "name": "Ceiling repairs", "name_es": "Reparar techo", "unit_price": 50, "unit": "pz"},
        {"id": "kt_resurfacing", "name": "Resurfacing countertops", "name_es": "Resurfacing encimeras", "unit_price": 300, "unit": "pz"},
        {"id": "kt_paint_cabinets", "name": "Paint cabinets", "name_es": "Pintar gabinetes", "unit_price": 1200, "unit": "cocina"},
        {"id": "kt_complete_sink", "name": "Complete sink", "name_es": "Fregadero completo", "unit_price": 200, "unit": "pz"},
        {"id": "kt_hardware", "name": "Hardware (handles)", "name_es": "Herrajes (jaladores)", "unit_price": 150, "unit": "set"},
        {"id": "kt_windows_trim", "name": "Windows trim (ft)", "name_es": "Moldura ventanas (ft)", "unit_price": 3, "unit": "ft"},
        {"id": "kt_crown_molding", "name": "Crown molding (ft)", "name_es": "Moldura corona (ft)", "unit_price": 2, "unit": "ft"},
        {"id": "kt_baseboard", "name": "Baseboard (ft)", "name_es": "Zócalo (ft)", "unit_price": 2, "unit": "ft"},
        {"id": "kt_replace_glass", "name": "Replace glass in windows", "name_es": "Reemplazar vidrio ventanas", "unit_price": 100, "unit": "pz"},
        {"id": "kt_formica", "name": "Formica (ft)", "name_es": "Fórmica (ft)", "unit_price": 15, "unit": "ft"},
    ],
}

UTILITY_ROOM = {
    "id": "utility_room",
    "name": "Utility Room",
    "name_es": "Cuarto de Servicio",
    "icon": "🧺",
    "items": [
        {"id": "ur_wall_patches", "name": "Wall patches", "name_es": "Parches de pared", "unit_price": 40, "unit": "pz"},
        {"id": "ur_floor_patches", "name": "Floor patches", "name_es": "Parches de piso", "unit_price": 100, "unit": "pz"},
        {"id": "ur_doors_paint", "name": "Doors paint only", "name_es": "Pintar puertas", "unit_price": 40, "unit": "pz"},
        {"id": "ur_door", "name": "Door", "name_es": "Puerta nueva", "unit_price": 120, "unit": "pz"},
        {"id": "ur_hinges", "name": "Hinges", "name_es": "Bisagras", "unit_price": 10, "unit": "pz"},
        {"id": "ur_knobs", "name": "Knobs", "name_es": "Perillas", "unit_price": 15, "unit": "pz"},
        {"id": "ur_texture", "name": "Texture", "name_es": "Textura", "unit_price": 100, "unit": "cuarto"},
        {"id": "ur_paint", "name": "Paint", "name_es": "Pintura", "unit_price": 100, "unit": "cuarto"},
        {"id": "ur_lights", "name": "Lights", "name_es": "Luces", "unit_price": 40, "unit": "pz"},
        {"id": "ur_ceiling_repairs", "name": "Ceiling repairs / replace light", "name_es": "Reparar techo / reemplazar luz", "unit_price": 50, "unit": "pz"},
        {"id": "ur_blinds_plates", "name": "Blinds, plates, smoke detector, AC vents", "name_es": "Persianas, placas, detector humo, rejillas AC", "unit_price": 500, "unit": "set"},
        {"id": "ur_door_trim", "name": "Door trim (ft)", "name_es": "Moldura puerta (ft)", "unit_price": 2, "unit": "ft"},
        {"id": "ur_crown_molding", "name": "Crown molding (ft)", "name_es": "Moldura corona (ft)", "unit_price": 2, "unit": "ft"},
        {"id": "ur_baseboard", "name": "Baseboard (ft)", "name_es": "Zócalo (ft)", "unit_price": 2, "unit": "ft"},
    ],
}

HALLWAY_ROOM = {
    "id": "hallway",
    "name": "Hallway / Living Room",
    "name_es": "Pasillo / Sala",
    "icon": "🏠",
    "items": [
        {"id": "hw_wall_patches", "name": "Wall patches", "name_es": "Parches de pared", "unit_price": 40, "unit": "pz"},
        {"id": "hw_floor_patches", "name": "Floor patches", "name_es": "Parches de piso", "unit_price": 100, "unit": "pz"},
        {"id": "hw_texture", "name": "Texture", "name_es": "Textura", "unit_price": 50, "unit": "cuarto"},
        {"id": "hw_paint", "name": "Paint", "name_es": "Pintura", "unit_price": 100, "unit": "cuarto"},
        {"id": "hw_lights", "name": "Lights", "name_es": "Luces", "unit_price": 40, "unit": "pz"},
        {"id": "hw_ceiling_repairs", "name": "Ceiling repairs", "name_es": "Reparar techo", "unit_price": 50, "unit": "pz"},
        {"id": "hw_fixed_cabinets", "name": "Fixed cabinets", "name_es": "Reparar gabinetes", "unit_price": 150, "unit": "pz"},
        {"id": "hw_new_cabinets", "name": "New cabinets", "name_es": "Gabinetes nuevos", "unit_price": 500, "unit": "pz"},
        {"id": "hw_new_carpet", "name": "New carpet", "name_es": "Alfombra nueva", "unit_price": 3, "unit": "sqft"},
        {"id": "hw_new_linoleum", "name": "New linoleum / vinyl", "name_es": "Linóleo / vinil nuevo", "unit_price": 4, "unit": "sqft"},
        {"id": "hw_demo_clean", "name": "Demo and clean", "name_es": "Demolición y limpieza", "unit_price": 500, "unit": "casa"},
    ],
}

EXTERIOR_ROOM = {
    "id": "exterior",
    "name": "Exterior",
    "name_es": "Exterior",
    "icon": "🏡",
    "items": [
        {"id": "ex_deck_front", "name": "Deck front 6x8", "name_es": "Deck frontal 6x8", "unit_price": 1150, "unit": "pz"},
        {"id": "ex_deck_rear", "name": "Deck rear 4x4", "name_es": "Deck trasero 4x4", "unit_price": 700, "unit": "pz"},
        {"id": "ex_front_door", "name": "Front door", "name_es": "Puerta frontal", "unit_price": 900, "unit": "pz"},
        {"id": "ex_back_door", "name": "Back door", "name_es": "Puerta trasera", "unit_price": 450, "unit": "pz"},
        {"id": "ex_exterior_lights", "name": "Exterior lights", "name_es": "Luces exteriores", "unit_price": 30, "unit": "pz"},
        {"id": "ex_paint_exterior", "name": "Paint exterior with material", "name_es": "Pintura exterior con material", "unit_price": 1500, "unit": "casa"},
        {"id": "ex_seal_windows", "name": "Seal windows", "name_es": "Sellar ventanas", "unit_price": 25, "unit": "pz"},
        {"id": "ex_roof", "name": "Roof (sqft)", "name_es": "Techo (sqft)", "unit_price": 210, "unit": "sq (100sqft)"},
        {"id": "ex_clean_service_ac", "name": "Clean and service A/C", "name_es": "Limpieza y servicio A/C", "unit_price": 500, "unit": "pz"},
        {"id": "ex_new_ac", "name": "New A/C", "name_es": "A/C nuevo", "unit_price": 5200, "unit": "pz"},
        {"id": "ex_smoke_detector", "name": "Smoke detector", "name_es": "Detector de humo", "unit_price": 30, "unit": "pz"},
    ],
}

# The 4 common rooms (always present)
COMMON_ROOMS = [KITCHEN_ROOM, HALLWAY_ROOM, UTILITY_ROOM, EXTERIOR_ROOM]


# ============================================================================
# DYNAMIC ROOM GENERATION
# ============================================================================

def _generate_bedroom(index: int, total_bedrooms: int) -> dict:
    """
    Generate a bedroom room with prefixed item IDs.
    index=1 → Master Bedroom, index=2+ → Bedroom N
    """
    if index == 1:
        room_id = "master_bedroom"
        name = "Master Bedroom"
        name_es = "Recámara Principal"
        prefix = "mb"
    else:
        room_id = f"bedroom_{index}"
        name = f"Bedroom {index}"
        name_es = f"Recámara {index}"
        prefix = f"bed{index}"

    items = []
    for item_template in BEDROOM_ITEMS:
        items.append({
            "id": f"{prefix}_{item_template['base_id']}",
            "name": item_template["name"],
            "name_es": item_template["name_es"],
            "unit_price": item_template["unit_price"],
            "unit": item_template["unit"],
        })

    # Master bedroom gets ceiling fan instead of regular lights
    if index == 1:
        for i, item in enumerate(items):
            if item["id"] == f"{prefix}_lights":
                items[i] = {
                    "id": f"{prefix}_ceiling_fan",
                    "name": "Ceiling fan",
                    "name_es": "Ventilador de techo",
                    "unit_price": 40,
                    "unit": "pz",
                }
                break

    return {
        "id": room_id,
        "name": name,
        "name_es": name_es,
        "icon": "🛏️",
        "prefix": prefix,
        "room_type": "bedroom",
        "items": items,
    }


def _generate_bathroom(index: int, total_bathrooms: int) -> dict:
    """
    Generate a bathroom room with prefixed item IDs.
    index=1 → Master Bathroom, index=2+ → Bathroom N
    """
    if index == 1:
        room_id = "master_bathroom"
        name = "Master Bathroom"
        name_es = "Baño Principal"
        prefix = "mbath"
    else:
        room_id = f"bathroom_{index}"
        name = f"Bathroom {index}"
        name_es = f"Baño {index}"
        prefix = f"bath{index}"

    items = []
    for item_template in BATHROOM_ITEMS:
        items.append({
            "id": f"{prefix}_{item_template['base_id']}",
            "name": item_template["name"],
            "name_es": item_template["name_es"],
            "unit_price": item_template["unit_price"],
            "unit": item_template["unit"],
        })

    return {
        "id": room_id,
        "name": name,
        "name_es": name_es,
        "icon": "🚿",
        "prefix": prefix,
        "room_type": "bathroom",
        "items": items,
    }


def generate_rooms_for_house(bedrooms: int = 3, bathrooms: int = 2) -> list[dict]:
    """
    Generate the full list of rooms for a specific house configuration.

    Args:
        bedrooms: Number of bedrooms (1-5, default 3)
        bathrooms: Number of bathrooms (1-3, default 2)

    Returns:
        List of room dicts with items, in order:
        [Master Bed, Bed2, ..., Master Bath, Bath2, ..., Kitchen, Living, Utility, Exterior]
    """
    bedrooms = int(max(1, min(bedrooms, 5)))  # Clamp 1-5, ensure int
    bathrooms = int(max(1, min(bathrooms, 3)))  # Clamp 1-3, ensure int

    rooms = []

    # Bedrooms (Master first, then additional)
    for i in range(1, bedrooms + 1):
        rooms.append(_generate_bedroom(i, bedrooms))

    # Bathrooms (Master first, then additional)
    for i in range(1, bathrooms + 1):
        rooms.append(_generate_bathroom(i, bathrooms))

    # Common rooms (always present)
    for room in COMMON_ROOMS:
        rooms.append(room)

    return rooms


def get_template(bedrooms: int = 3, bathrooms: int = 2) -> list[dict]:
    """Return the renovation template for a specific house config."""
    return generate_rooms_for_house(bedrooms, bathrooms)


def get_all_item_ids_for_house(bedrooms: int = 3, bathrooms: int = 2) -> dict[str, float]:
    """Return a dict of {item_id: unit_price} for all items in a house config."""
    rooms = generate_rooms_for_house(bedrooms, bathrooms)
    item_prices = {}
    for room in rooms:
        for item in room["items"]:
            item_prices[item["id"]] = item["unit_price"]
    return item_prices


# ============================================================================
# INSPECTION CHECKLIST → RENOVATION MAPPING
# ============================================================================

def get_ai_autofill_from_checklist(
    checklist_data: dict,
    bedrooms: int = 3,
    bathrooms: int = 2,
) -> dict:
    """
    Given a property's inspection checklist results, return suggested
    renovation items with pre-filled quantities.

    Uses the house config to generate correct item IDs.
    """
    rooms = generate_rooms_for_house(bedrooms, bathrooms)

    # Build lookup: which rooms are bedrooms, bathrooms, etc.
    bedroom_prefixes = []
    bathroom_prefixes = []
    for room in rooms:
        if room.get("room_type") == "bedroom":
            bedroom_prefixes.append(room["prefix"])
        elif room.get("room_type") == "bathroom":
            bathroom_prefixes.append(room["prefix"])

    suggestions = {}
    reasons = {}

    def _suggest(item_id: str, qty: int, reason: str):
        if item_id not in suggestions or suggestions[item_id] < qty:
            suggestions[item_id] = qty
        if item_id not in reasons:
            reasons[item_id] = []
        if reason not in reasons[item_id]:
            reasons[item_id].append(reason)

    for check_id, passed in checklist_data.items():
        if passed:
            continue

        if check_id == "suelos_subfloor":
            reason = "Pisos/subfloor en mal estado"
            for pfx in bedroom_prefixes:
                _suggest(f"{pfx}_floor_patches", 1, reason)
            for pfx in bathroom_prefixes:
                _suggest(f"{pfx}_floor_patches", 1, reason)
            _suggest("kt_floor_patches", 1, reason)
            _suggest("hw_floor_patches", 2, reason)
            _suggest("ur_floor_patches", 1, reason)

        elif check_id == "techo_techumbre":
            reason = "Techo necesita reparación"
            for pfx in bedroom_prefixes:
                _suggest(f"{pfx}_ceiling_repairs", 1, reason)
            for pfx in bathroom_prefixes:
                _suggest(f"{pfx}_ceiling_repairs", 1, reason)
            _suggest("kt_ceiling_repairs", 1, reason)
            _suggest("hw_ceiling_repairs", 1, reason)
            _suggest("ex_roof", 1, reason)

        elif check_id == "paredes_ventanas":
            reason = "Paredes/ventanas necesitan reparación"
            for pfx in bedroom_prefixes:
                _suggest(f"{pfx}_wall_patches", 3, reason)
                _suggest(f"{pfx}_texture", 1, reason)
                _suggest(f"{pfx}_paint", 1, reason)
            _suggest("kt_wall_patches", 2, reason)
            _suggest("hw_wall_patches", 2, reason)
            _suggest("ex_seal_windows", 4, reason)

        elif check_id == "regaderas_tinas":
            reason = "Regaderas/tinas necesitan reparación"
            for pfx in bathroom_prefixes:
                _suggest(f"{pfx}_resurfacing_shower", 1, reason)
                _suggest(f"{pfx}_faucets_shower", 1, reason)

        elif check_id == "plomeria":
            reason = "Plomería necesita reparación"
            for pfx in bathroom_prefixes:
                _suggest(f"{pfx}_toilet", 1, reason)
                _suggest(f"{pfx}_new_faucet", 1, reason)
            _suggest("kt_sink_faucet", 1, reason)

        elif check_id == "electricidad":
            reason = "Sistema eléctrico necesita revisión"
            for pfx in bedroom_prefixes:
                if pfx == "mb":
                    _suggest(f"{pfx}_ceiling_fan", 1, reason)  # Master has ceiling fan
                else:
                    _suggest(f"{pfx}_lights", 2, reason)
            for pfx in bathroom_prefixes:
                _suggest(f"{pfx}_lights", 1, reason)
            _suggest("kt_lights", 1, reason)
            _suggest("hw_lights", 1, reason)
            _suggest("ex_exterior_lights", 2, reason)

        elif check_id == "ac":
            reason = "A/C necesita atención"
            _suggest("ex_clean_service_ac", 1, reason)

    return {
        "suggestions": suggestions,
        "reasons": reasons,
    }


def get_renovation_from_evaluation_report(
    report_checklist: list,
    manual_notes: str | None,
    bedrooms: int = 3,
    bathrooms: int = 2,
) -> dict:
    """
    Convert an evaluation report's checklist + manual notes into renovation suggestions.
    
    The evaluation report checklist has items like:
      {"id": "suelos_subfloor", "label": "...", "status": "fail", "note": "..."}
    
    Status values: pass, fail, warning, needs_photo, not_evaluable
    Items that are 'fail' or 'warning' get converted to renovation suggestions.
    Manual notes are parsed for keywords to add extra items.
    """
    # First, convert the evaluation checklist to a dict format compatible with
    # get_ai_autofill_from_checklist (id -> True/False)
    checklist_data = {}
    for item in report_checklist:
        item_id = item.get("id", "")
        status = item.get("status", "")
        # 'pass' = OK = True, everything else = needs work = False
        checklist_data[item_id] = (status == "pass")

    # Get base suggestions from checklist
    result = get_ai_autofill_from_checklist(checklist_data, bedrooms, bathrooms)
    suggestions = result["suggestions"]
    reasons = result["reasons"]

    def _suggest(item_id: str, qty: int, reason: str):
        if item_id not in suggestions or suggestions[item_id] < qty:
            suggestions[item_id] = qty
        if item_id not in reasons:
            reasons[item_id] = []
        if reason not in reasons[item_id]:
            reasons[item_id].append(reason)

    rooms = generate_rooms_for_house(bedrooms, bathrooms)
    bedroom_prefixes = [r["prefix"] for r in rooms if r.get("room_type") == "bedroom"]
    bathroom_prefixes = [r["prefix"] for r in rooms if r.get("room_type") == "bathroom"]

    # Add extra items from individual checklist item notes
    for item in report_checklist:
        note = (item.get("note") or "").lower()
        status = item.get("status", "")
        if status in ("pass",) or not note:
            continue
        _parse_notes_for_suggestions(note, suggestions, reasons, _suggest, bedroom_prefixes, bathroom_prefixes)

    # Parse manual notes for additional suggestions
    if manual_notes:
        note_lower = manual_notes.lower()
        _parse_notes_for_suggestions(note_lower, suggestions, reasons, _suggest, bedroom_prefixes, bathroom_prefixes)

    return {
        "suggestions": suggestions,
        "reasons": reasons,
    }


def _parse_notes_for_suggestions(
    note: str,
    suggestions: dict,
    reasons: dict,
    _suggest,
    bedroom_prefixes: list,
    bathroom_prefixes: list,
):
    """Parse a note string for keywords and add renovation suggestions."""

    # Floor-related keywords
    floor_keywords = ["suelo", "piso", "floor", "carpet", "vinilo", "vinyl", "subfloor"]
    if any(kw in note for kw in floor_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        for pfx in bedroom_prefixes:
            _suggest(f"{pfx}_floor_patches", 2, reason)
        for pfx in bathroom_prefixes:
            _suggest(f"{pfx}_floor_patches", 1, reason)
        _suggest("kt_floor_patches", 2, reason)
        _suggest("hw_floor_patches", 3, reason)
        _suggest("ur_floor_patches", 1, reason)

    # Wall-related keywords
    wall_keywords = ["pared", "wall", "pintura", "paint", "textura", "texture", "agujero", "hole", "grieta", "crack"]
    if any(kw in note for kw in wall_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        for pfx in bedroom_prefixes:
            _suggest(f"{pfx}_wall_patches", 3, reason)
            _suggest(f"{pfx}_texture", 1, reason)
            _suggest(f"{pfx}_paint", 1, reason)
        _suggest("kt_wall_patches", 2, reason)
        _suggest("hw_wall_patches", 3, reason)

    # Ceiling-related keywords
    ceiling_keywords = ["techo", "ceiling", "goteras", "leak", "filtr"]
    if any(kw in note for kw in ceiling_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        for pfx in bedroom_prefixes:
            _suggest(f"{pfx}_ceiling_repairs", 1, reason)
        for pfx in bathroom_prefixes:
            _suggest(f"{pfx}_ceiling_repairs", 1, reason)
        _suggest("kt_ceiling_repairs", 1, reason)
        _suggest("hw_ceiling_repairs", 1, reason)

    # Bathroom-related keywords
    bath_keywords = ["regadera", "shower", "tina", "bathtub", "inodoro", "toilet", "lavabo", "sink", "baño"]
    if any(kw in note for kw in bath_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        for pfx in bathroom_prefixes:
            _suggest(f"{pfx}_resurfacing_shower", 1, reason)
            _suggest(f"{pfx}_toilet", 1, reason)
            _suggest(f"{pfx}_new_faucet", 1, reason)

    # Kitchen-related keywords
    kitchen_keywords = ["cocina", "kitchen", "gabinete", "cabinet", "countertop", "encimera", "fregadero"]
    if any(kw in note for kw in kitchen_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        _suggest("kt_paint_cabinets", 1, reason)
        _suggest("kt_counter_top", 1, reason)
        _suggest("kt_sink_faucet", 1, reason)

    # Electrical keywords
    elec_keywords = ["electric", "luz", "light", "apagador", "switch", "contacto", "outlet"]
    if any(kw in note for kw in elec_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        for pfx in bedroom_prefixes:
            _suggest(f"{pfx}_lights", 2, reason)
        _suggest("kt_lights", 1, reason)
        _suggest("hw_lights", 1, reason)

    # AC-related keywords
    ac_keywords = ["ac", "a/c", "aire", "air condition", "hvac", "calefacc"]
    if any(kw in note for kw in ac_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        _suggest("ex_clean_service_ac", 1, reason)

    # Door-related keywords
    door_keywords = ["puerta", "door", "cerradura", "lock", "bisagra", "hinge"]
    if any(kw in note for kw in door_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        for pfx in bedroom_prefixes:
            _suggest(f"{pfx}_doors", 1, reason)
        for pfx in bathroom_prefixes:
            _suggest(f"{pfx}_doors", 1, reason)
        _suggest("ex_main_door", 1, reason)

    # Window-related keywords
    window_keywords = ["ventana", "window", "persianas", "blind", "cristal", "glass"]
    if any(kw in note for kw in window_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        _suggest("ex_seal_windows", 4, reason)

    # Exterior keywords
    ext_keywords = ["exterior", "siding", "skirting", "faldón", "deck", "stairs", "escalera", "steps"]
    if any(kw in note for kw in ext_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        _suggest("ex_skirting", 1, reason)
        _suggest("ex_deck_steps", 1, reason)

    # Plumbing keywords
    plumb_keywords = ["plomería", "plomeria", "plumber", "tubería", "tuberia", "pipe", "fuga", "leak"]
    if any(kw in note for kw in plumb_keywords):
        reason = f"Nota: '{note[:80]}...'" if len(note) > 80 else f"Nota: '{note}'"
        for pfx in bathroom_prefixes:
            _suggest(f"{pfx}_toilet", 1, reason)
            _suggest(f"{pfx}_new_faucet", 1, reason)
        _suggest("kt_sink_faucet", 1, reason)
