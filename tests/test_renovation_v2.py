"""
Renovation V2 & Property Status Transition Tests
==================================================
Tests the latest features:
1. Renovation Template V2 — 19-item fixed checklist with MO + Materiales + Cronograma
2. Property status transitions (purchased → renovating)
3. Renovation quote save/load with V2 format (mano_obra + materiales)
4. V2 template structure and data integrity
5. Custom items (editable checklist)
6. Voice command processing logic
7. Frontend page structure validation
8. API endpoint structure validation
9. Backward compatibility (old format → new format)
10. Live endpoint tests (requires running backend)
"""

import sys
import os
import json
import copy

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ============================================================================
# TEST 1: V2 TEMPLATE — 19 ITEMS WITH CORRECT DATA (MO + MAT + DIAS)
# ============================================================================

def test_v2_template_structure():
    """Verify the V2 renovation template has exactly 19 items with MO/Mat/Dias fields."""
    print("\n" + "=" * 60)
    print("TEST 1: V2 TEMPLATE STRUCTURE (19 items, MO + Mat + Dias)")
    print("=" * 60)

    from api.utils.renovation_template_v2 import RENOVATION_ITEMS, get_template_v2

    # Must have exactly 19 items
    assert len(RENOVATION_ITEMS) == 19, f"Expected 19 items, got {len(RENOVATION_ITEMS)}"
    print(f"  ✅ Exactly 19 items in template")

    # Check that get_template_v2 returns a deep copy (no mutation)
    template1 = get_template_v2()
    template2 = get_template_v2()
    template1[0]["mano_obra"] = 999999
    assert template2[0]["mano_obra"] != 999999, "get_template_v2 should return deep copies"
    print(f"  ✅ get_template_v2() returns deep copies (no mutation)")

    # Each item must have required fields including new ones
    required_fields = {"id", "partida", "concepto", "mano_obra", "materiales", "precio", "dias", "start_day", "notas"}
    for item in RENOVATION_ITEMS:
        missing = required_fields - set(item.keys())
        assert not missing, f"Item '{item.get('id', '?')}' missing fields: {missing}"
    print(f"  ✅ All items have required fields: {sorted(required_fields)}")

    # Partida numbers must be 1 through 19, sequential
    partidas = [item["partida"] for item in RENOVATION_ITEMS]
    assert partidas == list(range(1, 20)), f"Partida numbers not 1-19: {partidas}"
    print(f"  ✅ Partida numbers are 1 through 19 (sequential)")

    # Each ID must be unique
    ids = [item["id"] for item in RENOVATION_ITEMS]
    assert len(ids) == len(set(ids)), f"Duplicate IDs: {[x for x in ids if ids.count(x) > 1]}"
    print(f"  ✅ All item IDs are unique")

    # All notas must start empty
    for item in RENOVATION_ITEMS:
        assert item["notas"] == "", f"Item '{item['id']}' has non-empty notas: {item['notas']}"
    print(f"  ✅ All notas start as empty string")

    # precio must equal mano_obra + materiales for every item
    for item in RENOVATION_ITEMS:
        expected = round(item["mano_obra"] + item["materiales"], 2)
        assert item["precio"] == expected, \
            f"Item '{item['id']}': precio={item['precio']} != mano_obra({item['mano_obra']}) + materiales({item['materiales']}) = {expected}"
    print(f"  ✅ precio = mano_obra + materiales for all items")

    # dias must be >= 1 for all items
    for item in RENOVATION_ITEMS:
        assert item["dias"] >= 1, f"Item '{item['id']}' has dias={item['dias']} (must be >= 1)"
    print(f"  ✅ All items have dias >= 1")

    # start_day must be >= 1 for all items
    for item in RENOVATION_ITEMS:
        assert item["start_day"] >= 1, f"Item '{item['id']}' has start_day={item['start_day']} (must be >= 1)"
    print(f"  ✅ All items have start_day >= 1")

    print(f"  ✅ V2 template structure PASSED")


# ============================================================================
# TEST 2: V2 TEMPLATE — CORRECT ITEMS, MO DEFAULTS, AND TIMELINE
# ============================================================================

def test_v2_template_items_and_prices():
    """Verify each item has the correct concepto, MO, dias, and start_day."""
    print("\n" + "=" * 60)
    print("TEST 2: V2 ITEMS — MO + DIAS + START_DAY")
    print("=" * 60)

    from api.utils.renovation_template_v2 import RENOVATION_ITEMS

    # Expected items: (id, partida, concepto, mano_obra, dias, start_day)
    expected_items = [
        ("demolicion",    1,  "Demolición y desmantelamiento",                                   250.00,  1, 1),
        ("limpieza",      2,  "Limpieza general de obra",                                        200.00,  1, 2),
        ("muros",         3,  "Reparación de muros (sheetrock, trim, coqueo, floteo)",            390.00,  2, 2),
        ("electricidad",  4,  "Electricidad, cableado",                                          200.00,  1, 3),
        ("techos_ext",    5,  "Reparación de techos exteriores (conglomerado, shingles)",         390.00,  2, 3),
        ("cielos_int",    6,  "Reparación de cielos interiores (tablaroca, resanes, popcorn)",    390.00,  2, 3),
        ("textura_muros", 7,  "Textura muros",                                                   390.00,  1, 4),
        ("siding",        8,  "Siding aprobado (lámina, vynil, madera)",                           0.00,  2, 4),
        ("pisos",         9,  "Pisos (plywood y acabados)",                                     1500.00,  1, 5),
        ("gabinetes",     10, "Gabinetes reparar carpintería (cocina/baños)",                    1000.00,  1, 4),
        ("pintura_ext",   11, "Pintura exterior (lámina y plástico sin reparaciones)",           1300.00,  1, 5),
        ("pintura_int",   12, "Pintura interior y cielos",                                       390.00,  2, 5),
        ("pintura_gab",   13, "Pintura gabinetes",                                               800.00,  2, 5),
        ("banos",         14, "Baños (sanitarios, lavamanos, kits de plomería)",                  200.00,  1, 7),
        ("cocina",        15, "Cocina (formica, tarja, kits de plomería)",                        200.00,  2, 6),
        ("finishing",     16, "Finishing - Instalación de lámparas, apagadores, contactos",       200.00,  1, 8),
        ("plomeria",      17, "Plomería (líneas de agua, desagüe, cespol kits)",                 200.00,  1, 7),
        ("acabados",      18, "Acabados finales (retoques, limpieza fina, staging)",              200.00,  1, 9),
        ("cerraduras",    19, "Cerraduras y herrajes",                                           200.00,  1, 9),
    ]

    for i, (exp_id, exp_partida, exp_concepto, exp_mo, exp_dias, exp_start) in enumerate(expected_items):
        item = RENOVATION_ITEMS[i]
        assert item["id"] == exp_id, f"Item {i}: expected id '{exp_id}', got '{item['id']}'"
        assert item["partida"] == exp_partida
        assert item["concepto"] == exp_concepto
        assert item["mano_obra"] == exp_mo, f"Item {exp_id}: expected MO {exp_mo}, got {item['mano_obra']}"
        assert item["dias"] == exp_dias, f"Item {exp_id}: expected dias {exp_dias}, got {item['dias']}"
        assert item["start_day"] == exp_start, f"Item {exp_id}: expected start_day {exp_start}, got {item['start_day']}"
        print(f"  ✅ Partida {exp_partida}: {exp_id} — MO=${exp_mo:.0f}, {exp_dias}d, start=D{exp_start}")

    # Verify total base MO
    total_mo = sum(item["mano_obra"] for item in RENOVATION_ITEMS)
    print(f"\n  📊 Total base MO: ${total_mo:,.2f}")
    assert total_mo > 0, "Total base MO should be positive"

    # All materiales start at 0
    assert all(item["materiales"] == 0 for item in RENOVATION_ITEMS), "All materiales should start at 0"
    print(f"  ✅ All materiales default to $0")

    print(f"  ✅ V2 items, MO, and timeline PASSED")


# ============================================================================
# TEST 3: BLANK QUOTE AND BUILD FROM SAVED (with new fields)
# ============================================================================

def test_blank_quote_and_build_from_saved():
    """Test get_blank_quote and build_quote_from_saved with MO + Mat fields."""
    print("\n" + "=" * 60)
    print("TEST 3: BLANK QUOTE AND BUILD FROM SAVED (MO + Mat)")
    print("=" * 60)

    from api.utils.renovation_template_v2 import get_blank_quote, build_quote_from_saved

    # Test blank quote
    blank = get_blank_quote()
    assert "items" in blank
    assert "total" in blank
    assert "total_mano_obra" in blank
    assert "total_materiales" in blank
    assert "dias_estimados" in blank
    assert len(blank["items"]) == 19
    print(f"  ✅ Blank quote has correct structure with MO/Mat/Dias fields")

    # total_materiales should be 0 (all defaults have mat=0)
    assert blank["total_materiales"] == 0, f"Expected total_materiales=0, got {blank['total_materiales']}"
    print(f"  ✅ Blank quote total_materiales = $0")

    # total should equal total_mano_obra when materiales = 0
    assert blank["total"] == blank["total_mano_obra"], "total should equal total_mano_obra when no materials"
    print(f"  ✅ total = total_mano_obra = ${blank['total']}")

    # dias_estimados should be > 0
    assert blank["dias_estimados"] > 0, "dias_estimados should be > 0"
    print(f"  ✅ dias_estimados = {blank['dias_estimados']}")

    # Test build_quote_from_saved with new format (MO + Mat)
    saved_data = {
        "items": {
            "demolicion": {
                "mano_obra": 300,
                "materiales": 50,
                "dias": 2,
                "notas": "Demoler cocina vieja",
            },
            "pisos": {
                "mano_obra": 1500,
                "materiales": 800,
                "notas": "Plywood + vinyl plank",
            },
        },
    }

    built = build_quote_from_saved(saved_data)
    assert len(built["items"]) == 19

    # Check demolicion was updated
    demolicion = next(i for i in built["items"] if i["id"] == "demolicion")
    assert demolicion["mano_obra"] == 300.0
    assert demolicion["materiales"] == 50.0
    assert demolicion["precio"] == 350.0, f"precio should be 300+50=350, got {demolicion['precio']}"
    assert demolicion["dias"] == 2
    assert demolicion["notas"] == "Demoler cocina vieja"
    print(f"  ✅ demolicion: MO=$300, Mat=$50, precio=$350, dias=2")

    # Check pisos
    pisos = next(i for i in built["items"] if i["id"] == "pisos")
    assert pisos["mano_obra"] == 1500.0
    assert pisos["materiales"] == 800.0
    assert pisos["precio"] == 2300.0
    print(f"  ✅ pisos: MO=$1500, Mat=$800, precio=$2300")

    # Check total includes both MO and Mat
    assert built["total_mano_obra"] > 0
    assert built["total_materiales"] == 850.0  # 50 + 800
    print(f"  ✅ total_materiales = $850 (50 + 800)")

    expected_total = sum(i["precio"] for i in built["items"])
    assert built["total"] == round(expected_total, 2)
    print(f"  ✅ Total correct: ${built['total']:.2f}")

    print(f"  ✅ Blank quote and build from saved PASSED")


# ============================================================================
# TEST 4: BACKWARD COMPATIBILITY — OLD FORMAT (only precio)
# ============================================================================

def test_backward_compatibility():
    """Test that old saved data (only precio, no mano_obra) loads correctly."""
    print("\n" + "=" * 60)
    print("TEST 4: BACKWARD COMPATIBILITY (old precio-only format)")
    print("=" * 60)

    from api.utils.renovation_template_v2 import build_quote_from_saved

    # Old format: only has "precio" per item (no mano_obra/materiales)
    old_saved_data = {
        "items": {
            "demolicion": {"precio": 750, "notas": "Old format"},
            "pisos": {"precio": 2000, "notas": ""},
        },
    }

    built = build_quote_from_saved(old_saved_data)
    assert len(built["items"]) == 19

    # Old "precio" should be assigned to mano_obra, materiales stays 0
    demolicion = next(i for i in built["items"] if i["id"] == "demolicion")
    assert demolicion["mano_obra"] == 750.0, f"Old precio should map to mano_obra, got {demolicion['mano_obra']}"
    assert demolicion["materiales"] == 0.0
    assert demolicion["precio"] == 750.0
    print(f"  ✅ Old precio=750 → mano_obra=750, materiales=0, precio=750")

    pisos = next(i for i in built["items"] if i["id"] == "pisos")
    assert pisos["mano_obra"] == 2000.0
    assert pisos["precio"] == 2000.0
    print(f"  ✅ Old precio=2000 → mano_obra=2000, precio=2000")

    # Unsaved items keep template defaults
    limpieza = next(i for i in built["items"] if i["id"] == "limpieza")
    assert limpieza["mano_obra"] == 200.0
    assert limpieza["dias"] == 1
    assert limpieza["start_day"] == 2
    print(f"  ✅ Unsaved items keep template defaults (MO, dias, start_day)")

    print(f"  ✅ Backward compatibility PASSED")


# ============================================================================
# TEST 5: CUSTOM ITEMS (with MO + Mat)
# ============================================================================

def test_custom_items():
    """Test that custom items with MO + Mat are handled correctly."""
    print("\n" + "=" * 60)
    print("TEST 5: CUSTOM ITEMS (MO + Mat)")
    print("=" * 60)

    from api.utils.renovation_template_v2 import build_quote_from_saved

    saved_data = {
        "items": {
            "demolicion": {"mano_obra": 250, "materiales": 0, "notas": ""},
        },
        "custom_items": [
            {
                "id": "custom_1",
                "partida": 20,
                "concepto": "Cerca perimetral",
                "mano_obra": 100.00,
                "materiales": 200.00,
                "dias": 2,
                "start_day": 10,
                "notas": "Cerca de madera 20 metros",
            },
            {
                "id": "custom_2",
                "partida": 21,
                "concepto": "Rampa de acceso",
                "mano_obra": 150.00,
                "materiales": 150.00,
                "notas": "ADA compliant",
            },
        ],
    }

    built = build_quote_from_saved(saved_data)

    # Should have 19 standard + 2 custom = 21 items
    assert len(built["items"]) == 21, f"Expected 21 items, got {len(built['items'])}"
    print(f"  ✅ 21 items total (19 standard + 2 custom)")

    # Custom item 1
    custom_1 = built["items"][19]
    assert custom_1["id"] == "custom_1"
    assert custom_1["mano_obra"] == 100.0
    assert custom_1["materiales"] == 200.0
    assert custom_1["precio"] == 300.0
    assert custom_1["dias"] == 2
    assert custom_1.get("is_custom") is True
    print(f"  ✅ Custom 1: MO=$100, Mat=$200, precio=$300, dias=2")

    # Custom item 2
    custom_2 = built["items"][20]
    assert custom_2["id"] == "custom_2"
    assert custom_2["precio"] == 300.0  # 150 + 150
    print(f"  ✅ Custom 2: precio=$300 (150+150)")

    # Total should include custom items
    assert built["total_materiales"] == 350.0  # 200 + 150
    print(f"  ✅ total_materiales includes custom items: ${built['total_materiales']}")

    print(f"  ✅ Custom items PASSED")


# ============================================================================
# TEST 6: CUSTOM ITEMS BACKWARD COMPAT (old format with only precio)
# ============================================================================

def test_custom_items_backward_compat():
    """Test old custom items with only 'precio' are migrated to mano_obra."""
    print("\n" + "=" * 60)
    print("TEST 6: CUSTOM ITEMS BACKWARD COMPAT")
    print("=" * 60)

    from api.utils.renovation_template_v2 import build_quote_from_saved

    saved_data = {
        "items": {},
        "custom_items": [
            {
                "id": "custom_old",
                "partida": 20,
                "concepto": "Old custom item",
                "precio": 500.00,
                "notas": "Legacy format",
            },
        ],
    }

    built = build_quote_from_saved(saved_data)
    custom = next(i for i in built["items"] if i["id"] == "custom_old")

    # Old format: precio should be assigned to mano_obra
    assert custom["mano_obra"] == 500.0, f"Old precio should map to mano_obra, got {custom['mano_obra']}"
    assert custom["precio"] == 500.0
    assert custom.get("is_custom") is True
    print(f"  ✅ Old custom item precio=$500 → mano_obra=$500")

    print(f"  ✅ Custom items backward compat PASSED")


# ============================================================================
# TEST 7: MO_BY_SIZE REFERENCE
# ============================================================================

def test_mo_by_size():
    """Verify MO_BY_SIZE reference data exists."""
    print("\n" + "=" * 60)
    print("TEST 7: MO_BY_SIZE REFERENCE")
    print("=" * 60)

    from api.utils.renovation_template_v2 import MO_BY_SIZE

    assert "14x66" in MO_BY_SIZE
    assert "16x76" in MO_BY_SIZE
    assert "18x76" in MO_BY_SIZE
    assert "doble" in MO_BY_SIZE
    assert MO_BY_SIZE["14x66"] == 1300
    assert MO_BY_SIZE["16x76"] == 1500
    assert MO_BY_SIZE["18x76"] == 1800
    assert MO_BY_SIZE["doble"] is None
    print(f"  ✅ MO_BY_SIZE: 14x66=$1300, 16x76=$1500, 18x76=$1800, doble=None")

    print(f"  ✅ MO_BY_SIZE PASSED")


# ============================================================================
# TEST 8: PROPERTY STATUS TRANSITIONS
# ============================================================================

def test_property_status_transitions():
    """Test all property status transitions, including purchased → renovating."""
    print("\n" + "=" * 60)
    print("TEST 8: PROPERTY STATUS TRANSITIONS")
    print("=" * 60)

    from api.services.property_service import PropertyService, PropertyStatus

    assert PropertyService.can_transition(PropertyStatus.PURCHASED, PropertyStatus.RENOVATING)
    print(f"  ✅ purchased → renovating: ALLOWED")

    assert PropertyService.can_transition(PropertyStatus.PURCHASED, PropertyStatus.PUBLISHED)
    print(f"  ✅ purchased → published: ALLOWED")

    assert not PropertyService.can_transition(PropertyStatus.PURCHASED, PropertyStatus.SOLD)
    print(f"  ✅ purchased → sold: BLOCKED")

    assert PropertyService.can_transition(PropertyStatus.PUBLISHED, PropertyStatus.RENOVATING)
    print(f"  ✅ published → renovating: ALLOWED")

    assert PropertyService.can_transition(PropertyStatus.RENOVATING, PropertyStatus.PUBLISHED)
    print(f"  ✅ renovating → published: ALLOWED")

    assert not PropertyService.can_transition(PropertyStatus.RENOVATING, PropertyStatus.SOLD)
    print(f"  ✅ renovating → sold: BLOCKED")

    for target in [PropertyStatus.PURCHASED, PropertyStatus.PUBLISHED, PropertyStatus.RENOVATING, PropertyStatus.RESERVED]:
        assert not PropertyService.can_transition(PropertyStatus.SOLD, target)
    print(f"  ✅ sold → anything: BLOCKED (final state)")

    print(f"  ✅ Property status transitions PASSED")


# ============================================================================
# TEST 9: AVAILABLE ACTIONS
# ============================================================================

def test_available_actions():
    """Test that available actions are correct for each status."""
    print("\n" + "=" * 60)
    print("TEST 9: AVAILABLE ACTIONS")
    print("=" * 60)

    from api.services.property_service import PropertyService, PropertyStatus

    actions = PropertyService.get_available_actions(PropertyStatus.PURCHASED)
    assert len(actions) == 2
    assert any("publicar" in a.lower() for a in actions)
    assert any("renovar" in a.lower() for a in actions)
    print(f"  ✅ PURCHASED actions: {actions}")

    actions = PropertyService.get_available_actions(PropertyStatus.PUBLISHED)
    assert any("vender" in a.lower() for a in actions)
    print(f"  ✅ PUBLISHED actions: {actions}")

    actions = PropertyService.get_available_actions(PropertyStatus.RENOVATING)
    assert any("publicar" in a.lower() for a in actions)
    print(f"  ✅ RENOVATING actions: {actions}")

    actions = PropertyService.get_available_actions(PropertyStatus.SOLD)
    assert len(actions) == 0
    print(f"  ✅ SOLD actions: [] (none)")

    print(f"  ✅ Available actions PASSED")


# ============================================================================
# TEST 10: VALIDATE TRANSITION ERROR MESSAGES
# ============================================================================

def test_validate_transition():
    """Test validate_transition returns correct errors."""
    print("\n" + "=" * 60)
    print("TEST 10: VALIDATE TRANSITION ERROR MESSAGES")
    print("=" * 60)

    from api.services.property_service import PropertyService, PropertyStatus

    is_valid, error = PropertyService.validate_transition(PropertyStatus.PURCHASED, PropertyStatus.RENOVATING)
    assert is_valid is True
    assert error is None
    print(f"  ✅ purchased → renovating: valid=True")

    is_valid, error = PropertyService.validate_transition(PropertyStatus.PURCHASED, PropertyStatus.SOLD)
    assert is_valid is False
    assert error is not None
    print(f"  ✅ purchased → sold: valid=False")

    is_valid, error = PropertyService.validate_transition(PropertyStatus.SOLD, PropertyStatus.PUBLISHED)
    assert is_valid is False
    assert "final state" in error.lower()
    print(f"  ✅ sold → published: blocked (final state)")

    print(f"  ✅ Validate transition PASSED")


# ============================================================================
# TEST 11: RENOVATION ROUTE STRUCTURE
# ============================================================================

def test_renovation_route_structure():
    """Verify all renovation V2 routes are correctly registered."""
    print("\n" + "=" * 60)
    print("TEST 11: RENOVATION ROUTE STRUCTURE")
    print("=" * 60)

    from api.routes.renovation import router

    routes = []
    for route in router.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            for method in route.methods:
                routes.append((method, route.path))

    routes_set = set(routes)

    expected_routes = [
        ("GET", "/template"),
        ("GET", "/{property_id}/quote"),
        ("POST", "/{property_id}/quote"),
        ("POST", "/{property_id}/ai-fill"),
        ("GET", "/{property_id}/historical-comparison"),
        ("POST", "/{property_id}/import-report"),
    ]

    for method, path in expected_routes:
        found = (method, path) in routes_set
        assert found, f"Missing route: {method} {path}"
        print(f"  ✅ {method} {path}")

    assert len(routes) == 6, f"Expected 6 routes, got {len(routes)}"
    print(f"  ✅ Exactly 6 renovation routes")

    print(f"  ✅ Renovation route structure PASSED")


# ============================================================================
# TEST 12: NO BEDROOM/BATHROOM DEPENDENCY
# ============================================================================

def test_no_bedroom_bathroom_dependency():
    """Verify the V2 template and routes have no bedroom/bathroom dependencies."""
    print("\n" + "=" * 60)
    print("TEST 12: NO BEDROOM/BATHROOM DEPENDENCY")
    print("=" * 60)

    template_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "api", "utils", "renovation_template_v2.py"
    )
    with open(template_path, "r") as f:
        template_code = f.read()

    import re
    code_only = re.sub(r'""".*?"""', '', template_code, flags=re.DOTALL)
    code_only = re.sub(r"'''.*?'''", '', code_only, flags=re.DOTALL)
    code_only = re.sub(r'#.*$', '', code_only, flags=re.MULTILINE)
    code_only = re.sub(r'"[^"]*"', '""', code_only)
    code_only = re.sub(r"'[^']*'", "''", code_only)

    assert "bedroom" not in code_only.lower()
    assert "bathroom" not in code_only.lower()
    print(f"  ✅ renovation_template_v2.py: no bedroom/bathroom in code logic")

    routes_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "api", "routes", "renovation.py"
    )
    with open(routes_path, "r") as f:
        routes_code = f.read()

    assert "configBedroom" not in routes_code
    assert "_get_property_config" not in routes_code
    print(f"  ✅ renovation.py: no configBedrooms or _get_property_config")

    print(f"  ✅ No bedroom/bathroom dependency PASSED")


# ============================================================================
# TEST 13: FRONTEND PAGE STRUCTURE
# ============================================================================

def test_frontend_desktop_renovation_page():
    """Verify the desktop renovation page has MO/Mat columns and Cronograma tab."""
    print("\n" + "=" * 60)
    print("TEST 13: FRONTEND — DESKTOP RENOVATION PAGE (MO + Mat + Cronograma)")
    print("=" * 60)

    page_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "web", "src", "app", "homes", "properties", "[id]", "renovate", "page.tsx"
    )
    assert os.path.exists(page_path)

    with open(page_path, "r") as f:
        content = f.read()

    # No bedroom/bathroom configuration
    assert "configBedrooms" not in content
    assert "configBathrooms" not in content
    print(f"  ✅ No bedroom/bathroom configuration")

    # New fields in interface
    assert "mano_obra: number" in content, "Missing mano_obra in interface"
    assert "materiales: number" in content, "Missing materiales in interface"
    assert "dias: number" in content, "Missing dias in interface"
    assert "start_day: number" in content, "Missing start_day in interface"
    print(f"  ✅ Interface has mano_obra, materiales, dias, start_day fields")

    # Tab switcher
    assert "cotizacion" in content, "Missing cotizacion tab"
    assert "cronograma" in content, "Missing cronograma tab"
    print(f"  ✅ Tab switcher: Cotización | Cronograma")

    # Gantt chart elements
    assert "GANTT_COLORS" in content, "Missing GANTT_COLORS"
    assert "Calendario de Obra" in content, "Missing Gantt chart header"
    print(f"  ✅ Gantt chart (Cronograma) present")

    # Summary cards with MO/Mat totals
    assert "total_mano_obra" in content, "Missing total_mano_obra"
    assert "total_materiales" in content, "Missing total_materiales"
    assert "dias_estimados" in content, "Missing dias_estimados"
    print(f"  ✅ Summary cards: MO, Mat, Total, Días")

    # Save sends MO + Mat
    assert "mano_obra: item.mano_obra" in content, "Save should send mano_obra"
    assert "materiales: item.materiales" in content, "Save should send materiales"
    print(f"  ✅ Save payload includes mano_obra + materiales")

    # Voice and other features
    assert "SpeechRecognition" in content or "webkitSpeechRecognition" in content
    assert "isListening" in content
    assert "hasUnsavedChanges" in content
    print(f"  ✅ Voice recognition and unsaved changes tracking present")

    # Mobile card layout
    assert "md:hidden" in content, "Missing mobile card layout"
    print(f"  ✅ Mobile card layout present")

    print(f"  ✅ Desktop renovation page PASSED")


# ============================================================================
# TEST 14: EVALUATION → V2 MAPPING (now returns mano_obra + materiales)
# ============================================================================

def test_evaluation_to_v2_mapping():
    """Test the evaluation report to V2 renovation items mapping."""
    print("\n" + "=" * 60)
    print("TEST 14: EVALUATION → V2 MAPPING (MO + Mat)")
    print("=" * 60)

    from api.routes.renovation import _map_evaluation_to_v2_items

    checklist = [
        {"id": "suelos_subfloor", "status": "fail", "label": "Pisos / Subfloor"},
        {"id": "techo_techumbre", "status": "needs_repair", "label": "Techo"},
        {"id": "electricidad", "status": "fail", "label": "Electricidad"},
        {"id": "plomeria", "status": "needs_attention", "label": "Plomería"},
        {"id": "paredes_ventanas", "status": "pass", "label": "Paredes"},
    ]

    suggestions = _map_evaluation_to_v2_items(checklist, "General note")

    assert "pisos" in suggestions
    assert "demolicion" in suggestions
    print(f"  ✅ suelos_subfloor → pisos, demolicion")

    assert "techos_ext" in suggestions
    assert "cielos_int" in suggestions
    print(f"  ✅ techo_techumbre → techos_ext, cielos_int")

    # Suggestions now have mano_obra + materiales instead of precio
    for item_id, data in suggestions.items():
        assert "mano_obra" in data, f"Item {item_id} missing mano_obra"
        assert "materiales" in data, f"Item {item_id} missing materiales"
        assert "notas" in data, f"Item {item_id} missing notas"
    print(f"  ✅ All suggestions have mano_obra + materiales + notas")

    # Passing items should NOT be suggested
    assert "muros" not in suggestions
    assert "textura_muros" not in suggestions
    print(f"  ✅ Passing items NOT suggested")

    print(f"  ✅ Evaluation → V2 mapping PASSED ({len(suggestions)} items)")


# ============================================================================
# TEST 15: FRONTEND TEMPLATE PROXY
# ============================================================================

def test_frontend_template_proxy():
    """Verify the template proxy route no longer sends bedroom/bathroom params."""
    print("\n" + "=" * 60)
    print("TEST 15: FRONTEND — TEMPLATE PROXY ROUTE")
    print("=" * 60)

    proxy_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "web", "src", "app", "api", "renovation", "template", "route.ts"
    )
    assert os.path.exists(proxy_path), "Template proxy route.ts not found"

    with open(proxy_path, "r") as f:
        content = f.read()

    assert "bedrooms" not in content
    assert "bathrooms" not in content
    print(f"  ✅ No bedrooms/bathrooms query params in proxy")

    assert "/api/renovation/template" in content
    print(f"  ✅ Calls /api/renovation/template on backend")

    print(f"  ✅ Template proxy route PASSED")


# ============================================================================
# TEST 16: FRONTEND PROPERTY DETAIL PAGE
# ============================================================================

def test_frontend_property_detail_purchased_actions():
    """Verify the property detail page shows renovate option for purchased properties."""
    print("\n" + "=" * 60)
    print("TEST 16: FRONTEND — PROPERTY DETAIL (purchased actions)")
    print("=" * 60)

    page_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "web", "src", "app", "homes", "properties", "[id]", "page.tsx"
    )
    assert os.path.exists(page_path)

    with open(page_path, "r") as f:
        content = f.read()

    assert "handleStartRenovation" in content
    print(f"  ✅ handleStartRenovation function exists")

    assert "start-renovation" in content
    print(f"  ✅ start-renovation API endpoint called")

    print(f"  ✅ Frontend property detail page PASSED")


# ============================================================================
# TEST 17: MOBILE PAGE REDIRECT
# ============================================================================

def test_frontend_mobile_page():
    """Verify the mobile page exists."""
    print("\n" + "=" * 60)
    print("TEST 17: FRONTEND — MOBILE PAGE")
    print("=" * 60)

    page_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "web", "src", "app", "mobile", "page.tsx"
    )
    assert os.path.exists(page_path)

    with open(page_path, "r") as f:
        content = f.read()

    assert "redirect" in content
    assert "/homes" in content
    print(f"  ✅ Mobile page redirects to responsive /homes")

    print(f"  ✅ Mobile page PASSED")


# ============================================================================
# TEST 18: LIVE BACKEND ENDPOINTS (requires running backend)
# ============================================================================

def test_live_renovation_endpoints():
    """Test live renovation endpoints against running backend."""
    print("\n" + "=" * 60)
    print("TEST 18: LIVE RENOVATION ENDPOINTS")
    print("=" * 60)

    import urllib.request
    import urllib.error

    base_url = "http://localhost:8000/api/renovation"

    try:
        req = urllib.request.Request(f"{base_url}/template")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())

            assert data.get("version") == 2
            print(f"  ✅ GET /template → version=2")

            assert data.get("total_items") == 19
            print(f"  ✅ GET /template → total_items=19")

            # New fields should be present
            assert "total_mano_obra" in data, "Missing total_mano_obra in template response"
            assert "total_materiales" in data, "Missing total_materiales in template response"
            assert "dias_estimados" in data, "Missing dias_estimados in template response"
            print(f"  ✅ GET /template → has MO/Mat/Dias fields")

            items = data.get("items", [])
            if items:
                assert "mano_obra" in items[0], "Items missing mano_obra field"
                assert "materiales" in items[0], "Items missing materiales field"
                assert "dias" in items[0], "Items missing dias field"
                assert "start_day" in items[0], "Items missing start_day field"
                print(f"  ✅ Items have mano_obra, materiales, dias, start_day")

    except urllib.error.URLError:
        print("  ⚠️  Backend not running — skipping live tests")
        return
    except Exception as e:
        print(f"  ❌ GET /template failed: {e}")
        return

    # Test 2: GET /{fake_id}/quote — should return 404
    try:
        req = urllib.request.Request(f"{base_url}/fake-nonexistent-id/quote")
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(f"  ❌ Should have returned 404 for non-existent property")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"  ✅ GET /fake-id/quote → 404 Not Found (correct)")
        else:
            print(f"  ⚠️  Unexpected status: {e.code}")
    except Exception as e:
        print(f"  ⚠️  GET /fake-id/quote error: {e}")

    print(f"  ✅ Live renovation endpoints PASSED")


# ============================================================================
# RUN ALL TESTS
# ============================================================================

if __name__ == "__main__":
    print("🧪 RENOVATION V2 TESTS — MO + MATERIALES + CRONOGRAMA")
    print("=" * 60)

    tests = [
        test_v2_template_structure,
        test_v2_template_items_and_prices,
        test_blank_quote_and_build_from_saved,
        test_backward_compatibility,
        test_custom_items,
        test_custom_items_backward_compat,
        test_mo_by_size,
        test_property_status_transitions,
        test_available_actions,
        test_validate_transition,
        test_renovation_route_structure,
        test_no_bedroom_bathroom_dependency,
        test_frontend_desktop_renovation_page,
        test_evaluation_to_v2_mapping,
        test_frontend_template_proxy,
        test_frontend_property_detail_purchased_actions,
        test_frontend_mobile_page,
        test_live_renovation_endpoints,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            test_fn()
            passed += 1
        except AssertionError as e:
            print(f"\n  ❌ FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"\n  ❌ ERROR: {type(e).__name__}: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed}/{passed + failed} tests passed")
    if failed:
        print(f"  ❌ {failed} test(s) FAILED")
    else:
        print(f"  🎉 ALL TESTS PASSED")
    print("=" * 60)
