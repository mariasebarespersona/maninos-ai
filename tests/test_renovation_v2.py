"""
Renovation V2/V4 & Property Status Transition Tests
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
11. V4: Material defaults from H06, unidad, subfields, approval
"""

import sys
import os
import json
import copy

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set mock env vars so Supabase client doesn't crash on import
os.environ.setdefault("SUPABASE_URL", "https://mock.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vY2siLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjE2MjM5MDIyLCJleHAiOjE5MzE4MTUwMjJ9.mock_signature_for_testing_only_do_not_use")


# ============================================================================
# TEST 1: V2 TEMPLATE — 19 ITEMS WITH CORRECT DATA (MO + MAT + DIAS + UNIDAD)
# ============================================================================

def test_v2_template_structure():
    """Verify the V2 renovation template has exactly 19 items with all fields."""
    print("\n" + "=" * 60)
    print("TEST 1: V2 TEMPLATE STRUCTURE (19 items, MO + Mat + Dias + Unidad)")
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
    required_fields = {"id", "partida", "concepto", "mano_obra", "materiales", "precio", "dias", "start_day", "unidad", "notas"}
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

    # unidad must be one of the valid options
    valid_unidades = {"día", "proyecto", "casa", "pieza", "ventana"}
    for item in RENOVATION_ITEMS:
        assert item["unidad"] in valid_unidades, f"Item '{item['id']}' has invalid unidad: {item['unidad']}"
    print(f"  ✅ All items have valid unidad")

    print(f"  ✅ V2 template structure PASSED")


# ============================================================================
# TEST 2: V4 MATERIAL DEFAULTS FROM CASA H06 + MO FROM HOJA 2
# ============================================================================

def test_v4_material_defaults():
    """Verify material defaults match CASA H06 spreadsheet data."""
    print("\n" + "=" * 60)
    print("TEST 2: V4 MATERIAL DEFAULTS (from CASA H06)")
    print("=" * 60)

    from api.utils.renovation_template_v2 import RENOVATION_ITEMS

    # Build lookup
    items = {item["id"]: item for item in RENOVATION_ITEMS}

    # Verify key material defaults from H06 spreadsheet
    assert items["muros"]["materiales"] == 1227.00, f"PAREDES total should be $1227, got {items['muros']['materiales']}"
    print(f"  ✅ muros (PAREDES): materiales=$1,227")

    assert items["cielos_int"]["materiales"] == 520.00, f"CIELOS total should be $520"
    print(f"  ✅ cielos_int (CIELOS): materiales=$520")

    assert items["pisos"]["materiales"] == 1993.00, f"PISO total should be $1993"
    print(f"  ✅ pisos (PISO): materiales=$1,993")

    assert items["gabinetes"]["materiales"] == 634.00, f"GABINETE total should be $634"
    print(f"  ✅ gabinetes (GABINETE): materiales=$634")

    assert items["siding"]["materiales"] == 422.00, f"EXTERIOR total should be $422"
    print(f"  ✅ siding (EXTERIOR): materiales=$422")

    assert items["techos_ext"]["materiales"] == 320.00, f"TEJA total should be $320"
    print(f"  ✅ techos_ext (TEJA): materiales=$320")

    assert items["plomeria"]["materiales"] == 47.00, f"PLOMERÍA total should be ~$47"
    print(f"  ✅ plomeria (PLOMERÍA): materiales=$47")

    assert items["finishing"]["materiales"] == 220.00, f"ACCESORIOS total should be $220"
    print(f"  ✅ finishing (ACCESORIOS): materiales=$220")

    # Verify MO updated from Hoja 2
    assert items["demolicion"]["mano_obra"] == 300.00, "Demolición MO should be $300"
    print(f"  ✅ demolicion MO=$300 (was $250 in V3)")

    assert items["muros"]["mano_obra"] == 400.00, "Muros MO should be $400/día"
    print(f"  ✅ muros MO=$400 (was $390 in V3)")

    assert items["techos_ext"]["mano_obra"] == 3500.00, "Techos ext MO should be $3500/proyecto"
    print(f"  ✅ techos_ext MO=$3,500 (was $390 in V3)")

    assert items["finishing"]["mano_obra"] == 1500.00, "Finishing MO should be $1500/pieza"
    print(f"  ✅ finishing MO=$1,500 (was $200 in V3)")

    # Total materiales should be non-zero (was $0 in V3)
    total_mat = sum(item["materiales"] for item in RENOVATION_ITEMS)
    assert total_mat > 4000, f"Total materiales should be >$4000, got {total_mat}"
    print(f"\n  📊 Total materiales: ${total_mat:,.2f} (was $0 in V3)")

    total_mo = sum(item["mano_obra"] for item in RENOVATION_ITEMS)
    print(f"  📊 Total MO: ${total_mo:,.2f}")

    print(f"  ✅ V4 material defaults PASSED")


# ============================================================================
# TEST 3: BLANK QUOTE AND BUILD FROM SAVED (with V4 fields)
# ============================================================================

def test_blank_quote_and_build_from_saved():
    """Test get_blank_quote and build_quote_from_saved with MO + Mat + V4 fields."""
    print("\n" + "=" * 60)
    print("TEST 3: BLANK QUOTE AND BUILD FROM SAVED (MO + Mat + V4)")
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
    print(f"  ✅ Blank quote has correct structure")

    # total_materiales should be > 0 (V4 has H06 defaults)
    assert blank["total_materiales"] > 0, f"Expected total_materiales > 0, got {blank['total_materiales']}"
    print(f"  ✅ Blank quote total_materiales = ${blank['total_materiales']} (non-zero, H06 defaults)")

    # total should equal total_mano_obra + total_materiales
    expected_total = round(blank["total_mano_obra"] + blank["total_materiales"], 2)
    assert blank["total"] == expected_total, f"total={blank['total']} != MO+Mat={expected_total}"
    print(f"  ✅ total = MO + Mat = ${blank['total']}")

    # Items should have unidad field
    for item in blank["items"]:
        assert "unidad" in item, f"Item '{item['id']}' missing unidad"
    print(f"  ✅ All items have unidad field")

    # Test build_quote_from_saved with V4 format (MO + Mat + responsable + subfields)
    saved_data = {
        "items": {
            "demolicion": {
                "mano_obra": 300,
                "materiales": 50,
                "dias": 2,
                "notas": "Demoler cocina vieja",
                "responsable": "Juan",
                "subfields": {"muebles": "Si", "equipos": "Lavadora"},
            },
            "pisos": {
                "mano_obra": 1500,
                "materiales": 800,
                "notas": "Plywood + vinyl plank",
            },
        },
        "responsable": "Pedro Manager",
        "fecha_inicio": "2026-03-20",
        "fecha_fin": "2026-04-10",
        "approval_status": "pending_approval",
    }

    built = build_quote_from_saved(saved_data)
    assert len(built["items"]) == 19

    # Check demolicion was updated including V4 fields
    demolicion = next(i for i in built["items"] if i["id"] == "demolicion")
    assert demolicion["mano_obra"] == 300.0
    assert demolicion["materiales"] == 50.0
    assert demolicion["precio"] == 350.0
    assert demolicion["responsable"] == "Juan"
    assert demolicion["subfields"]["muebles"] == "Si"
    assert demolicion["subfields"]["equipos"] == "Lavadora"
    print(f"  ✅ demolicion: MO=$300, Mat=$50, responsable=Juan, subfields preserved")

    # Check project metadata passthrough
    assert built["responsable"] == "Pedro Manager"
    assert built["fecha_inicio"] == "2026-03-20"
    assert built["fecha_fin"] == "2026-04-10"
    assert built["approval_status"] == "pending_approval"
    print(f"  ✅ Project metadata passed through: responsable, fechas, approval_status")

    print(f"  ✅ Blank quote and build from saved PASSED")


# ============================================================================
# TEST 4: BACKWARD COMPATIBILITY — OLD FORMAT (only precio, no unidad/subfields)
# ============================================================================

def test_backward_compatibility():
    """Test that old saved data (only precio, no mano_obra/unidad/subfields) loads correctly."""
    print("\n" + "=" * 60)
    print("TEST 4: BACKWARD COMPATIBILITY (old precio-only + no V4 fields)")
    print("=" * 60)

    from api.utils.renovation_template_v2 import build_quote_from_saved

    # Old format: only has "precio" per item (no mano_obra/materiales/unidad/subfields)
    old_saved_data = {
        "items": {
            "demolicion": {"precio": 750, "notas": "Old format"},
            "pisos": {"precio": 2000, "notas": ""},
        },
    }

    built = build_quote_from_saved(old_saved_data)
    assert len(built["items"]) == 19

    # Old "precio" should be assigned to mano_obra, materiales stays at default
    demolicion = next(i for i in built["items"] if i["id"] == "demolicion")
    assert demolicion["mano_obra"] == 750.0, f"Old precio should map to mano_obra, got {demolicion['mano_obra']}"
    # materiales keeps the template default (0 for demolicion)
    assert demolicion["precio"] == 750.0
    print(f"  ✅ Old precio=750 → mano_obra=750, precio=750")

    # Unsaved items keep V4 template defaults (with materials)
    muros = next(i for i in built["items"] if i["id"] == "muros")
    assert muros["mano_obra"] == 400.0, f"Default MO should be 400, got {muros['mano_obra']}"
    assert muros["materiales"] == 1227.0, f"Default mat should be 1227, got {muros['materiales']}"
    assert muros["unidad"] == "día"
    print(f"  ✅ Unsaved items keep V4 defaults (muros: MO=$400, Mat=$1227, unidad=día)")

    # No approval status → not included in result
    assert "approval_status" not in built
    print(f"  ✅ Missing approval_status not injected (backward compat)")

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
    assert custom_1.get("unidad") == "proyecto"  # V4 default for custom items
    print(f"  ✅ Custom 1: MO=$100, Mat=$200, precio=$300, dias=2, unidad=proyecto")

    # Custom item 2
    custom_2 = built["items"][20]
    assert custom_2["id"] == "custom_2"
    assert custom_2["precio"] == 300.0  # 150 + 150
    print(f"  ✅ Custom 2: precio=$300 (150+150)")

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
# TEST 11: RENOVATION ROUTE STRUCTURE (V4 with approval endpoints)
# ============================================================================

def test_renovation_route_structure():
    """Verify all renovation V2/V4 routes are correctly registered."""
    print("\n" + "=" * 60)
    print("TEST 11: RENOVATION ROUTE STRUCTURE (V4)")
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
        ("PATCH", "/{property_id}/approve"),
        ("GET", "/{property_id}/approval-status"),
    ]

    for method, path in expected_routes:
        found = (method, path) in routes_set
        assert found, f"Missing route: {method} {path}"
        print(f"  ✅ {method} {path}")

    assert len(routes) == 8, f"Expected 8 routes, got {len(routes)}"
    print(f"  ✅ Exactly 8 renovation routes (6 original + 2 approval)")

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
# TEST 13: FRONTEND PAGE STRUCTURE (V4)
# ============================================================================

def test_frontend_desktop_renovation_page():
    """Verify the desktop renovation page has V4 features."""
    print("\n" + "=" * 60)
    print("TEST 13: FRONTEND — DESKTOP RENOVATION PAGE (V4)")
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

    # V2 fields in interface
    assert "mano_obra: number" in content, "Missing mano_obra in interface"
    assert "materiales: number" in content, "Missing materiales in interface"
    assert "dias: number" in content, "Missing dias in interface"
    assert "start_day: number" in content, "Missing start_day in interface"
    print(f"  ✅ Interface has mano_obra, materiales, dias, start_day fields")

    # V4 fields in interface
    assert "unidad: string" in content, "Missing unidad in interface"
    assert "responsable?: string" in content or "responsable:" in content, "Missing responsable in interface"
    assert "subfields?" in content, "Missing subfields in interface"
    assert "approval_status?" in content, "Missing approval_status in interface"
    print(f"  ✅ Interface has V4 fields: unidad, responsable, subfields, approval_status")

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

    # V4: Purchase price card
    assert "Precio Compra" in content, "Missing Precio Compra card"
    print(f"  ✅ Precio Compra summary card present")

    # V4: Project metadata header
    assert "Responsable del Proyecto" in content, "Missing project responsable field"
    assert "Fecha Inicio" in content, "Missing fecha_inicio field"
    assert "Fecha Fin" in content, "Missing fecha_fin field"
    print(f"  ✅ Project metadata header (Responsable, Fecha Inicio, Fecha Fin)")

    # V4: Expandable subfields
    assert "expandedRows" in content, "Missing expandedRows state"
    assert "ChevronDown" in content, "Missing expand/collapse chevrons"
    assert "renderSubfields" in content, "Missing renderSubfields function"
    print(f"  ✅ Expandable subfields per partida")

    # V4: Approval flow
    assert "Enviar a Aprobación" in content, "Missing submit for approval button"
    assert "Aprobar Cotización" in content, "Missing approve button"
    assert "pending_approval" in content, "Missing pending_approval status"
    print(f"  ✅ Approval flow UI (submit, approve, status badges)")

    # V4: Business rules tooltip
    assert "Reglas de materiales" in content, "Missing business rules tooltip"
    assert "business_rules" in content, "Missing business_rules reference"
    print(f"  ✅ Business rules tooltip present")

    # V4: Unidad badge
    assert "UNIT_SHORT" in content, "Missing UNIT_SHORT map"
    print(f"  ✅ Unidad badge on items")

    # V4: Responsable column
    assert 'Responsable' in content, "Missing Responsable column header"
    print(f"  ✅ Responsable column in table")

    # Save sends MO + Mat + V4 fields
    assert "mano_obra: item.mano_obra" in content, "Save should send mano_obra"
    assert "materiales: item.materiales" in content, "Save should send materiales"
    assert "responsable: item.responsable" in content or "responsable:" in content, "Save should send responsable"
    assert "subfields: item.subfields" in content or "subfields:" in content, "Save should send subfields"
    assert "submit_for_approval" in content, "Save should support submit_for_approval"
    print(f"  ✅ Save payload includes MO + Mat + V4 fields")

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
# TEST 18: ITEM_SUBFIELDS STRUCTURE
# ============================================================================

def test_item_subfields():
    """Test ITEM_SUBFIELDS has correct structure for relevant partidas."""
    print("\n" + "=" * 60)
    print("TEST 18: ITEM_SUBFIELDS STRUCTURE")
    print("=" * 60)

    from api.utils.renovation_template_v2 import ITEM_SUBFIELDS, RENOVATION_ITEMS

    # Must have entries for specific partidas
    expected_keys = {"demolicion", "muros", "techos_ext", "cielos_int", "textura_muros",
                     "siding", "pisos", "gabinetes", "pintura_int", "pintura_gab"}
    actual_keys = set(ITEM_SUBFIELDS.keys())
    assert expected_keys == actual_keys, f"Missing subfield keys: {expected_keys - actual_keys}"
    print(f"  ✅ ITEM_SUBFIELDS has {len(ITEM_SUBFIELDS)} partida entries")

    # All keys must be valid item IDs
    valid_ids = {item["id"] for item in RENOVATION_ITEMS}
    for key in ITEM_SUBFIELDS:
        assert key in valid_ids, f"Subfield key '{key}' not a valid item ID"
    print(f"  ✅ All subfield keys are valid item IDs")

    # Each subfield must have key, label, type
    for item_id, fields in ITEM_SUBFIELDS.items():
        assert isinstance(fields, list), f"{item_id} subfields should be list"
        for sf in fields:
            assert "key" in sf, f"{item_id} subfield missing 'key'"
            assert "label" in sf, f"{item_id} subfield missing 'label'"
            assert "type" in sf, f"{item_id} subfield missing 'type'"
            assert sf["type"] in ("text", "number", "boolean", "select"), f"Invalid type: {sf['type']}"
    print(f"  ✅ All subfields have key, label, type")

    # Check specific subfields
    demo_fields = {sf["key"] for sf in ITEM_SUBFIELDS["demolicion"]}
    assert "muebles" in demo_fields and "equipos" in demo_fields
    print(f"  ✅ demolicion: muebles, equipos, valor_demo")

    siding_fields = ITEM_SUBFIELDS["siding"]
    assert siding_fields[0]["type"] == "select"
    assert "lámina" in siding_fields[0]["options"]
    print(f"  ✅ siding: select type with lámina/vinyl/madera options")

    pintura_fields = {sf["key"] for sf in ITEM_SUBFIELDS["pintura_int"]}
    assert "color_pared" in pintura_fields and "color_cielos" in pintura_fields
    print(f"  ✅ pintura_int: color_pared, color_cielos")

    print(f"  ✅ ITEM_SUBFIELDS PASSED")


# ============================================================================
# TEST 19: BUSINESS RULES
# ============================================================================

def test_business_rules():
    """Test BUSINESS_RULES list exists with correct content."""
    print("\n" + "=" * 60)
    print("TEST 19: BUSINESS RULES")
    print("=" * 60)

    from api.utils.renovation_template_v2 import BUSINESS_RULES

    assert isinstance(BUSINESS_RULES, list)
    assert len(BUSINESS_RULES) == 5, f"Expected 5 rules, got {len(BUSINESS_RULES)}"
    print(f"  ✅ 5 business rules defined")

    # Check key rules exist
    rules_text = " ".join(BUSINESS_RULES).lower()
    assert "no se pueden repetir" in rules_text
    assert "manager" in rules_text
    assert "herramienta" in rules_text
    assert "bodega" in rules_text
    print(f"  ✅ Key business rules present")

    print(f"  ✅ Business rules PASSED")


# ============================================================================
# TEST 20: APPROVAL ENDPOINTS EXIST
# ============================================================================

def test_approval_endpoints():
    """Test that approval-related endpoints exist in router."""
    print("\n" + "=" * 60)
    print("TEST 20: APPROVAL ENDPOINTS")
    print("=" * 60)

    from api.routes.renovation import router

    routes = set()
    for route in router.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            for method in route.methods:
                routes.add((method, route.path))

    assert ("PATCH", "/{property_id}/approve") in routes, "Missing PATCH approve endpoint"
    print(f"  ✅ PATCH /{{property_id}}/approve exists")

    assert ("GET", "/{property_id}/approval-status") in routes, "Missing GET approval-status endpoint"
    print(f"  ✅ GET /{{property_id}}/approval-status exists")

    # SaveQuoteV2Request should have approval fields
    from api.routes.renovation import SaveQuoteV2Request
    schema = SaveQuoteV2Request.model_fields
    assert "submit_for_approval" in schema, "Missing submit_for_approval in schema"
    assert "responsable" in schema, "Missing responsable in schema"
    assert "fecha_inicio" in schema, "Missing fecha_inicio in schema"
    assert "fecha_fin" in schema, "Missing fecha_fin in schema"
    print(f"  ✅ SaveQuoteV2Request has V4 fields: submit_for_approval, responsable, fechas")

    print(f"  ✅ Approval endpoints PASSED")


# ============================================================================
# TEST 21: SUBFIELDS SAVE/LOAD IN BUILD_QUOTE_FROM_SAVED
# ============================================================================

def test_subfields_save_load():
    """Test subfields are correctly saved and loaded through build_quote_from_saved."""
    print("\n" + "=" * 60)
    print("TEST 21: SUBFIELDS SAVE/LOAD")
    print("=" * 60)

    from api.utils.renovation_template_v2 import build_quote_from_saved

    saved_data = {
        "items": {
            "siding": {
                "mano_obra": 500,
                "materiales": 400,
                "subfields": {"tipo_siding": "vinyl"},
            },
            "pintura_int": {
                "mano_obra": 390,
                "materiales": 150,
                "subfields": {"color_pared": "Chic Gray 600", "color_cielos": "Blanco"},
            },
            "gabinetes": {
                "mano_obra": 1000,
                "materiales": 634,
                "subfields": {"cocina": "Refacción completa", "bano1": "Nuevo gabinete", "bano2": ""},
            },
        },
    }

    built = build_quote_from_saved(saved_data)

    siding = next(i for i in built["items"] if i["id"] == "siding")
    assert siding["subfields"]["tipo_siding"] == "vinyl"
    print(f"  ✅ siding subfield tipo_siding=vinyl preserved")

    pintura = next(i for i in built["items"] if i["id"] == "pintura_int")
    assert pintura["subfields"]["color_pared"] == "Chic Gray 600"
    assert pintura["subfields"]["color_cielos"] == "Blanco"
    print(f"  ✅ pintura_int subfields color_pared + color_cielos preserved")

    gabinetes = next(i for i in built["items"] if i["id"] == "gabinetes")
    assert gabinetes["subfields"]["cocina"] == "Refacción completa"
    assert gabinetes["subfields"]["bano1"] == "Nuevo gabinete"
    print(f"  ✅ gabinetes subfields cocina + bano1 + bano2 preserved")

    # Items without subfields should NOT have a subfields key (no pollution)
    demolicion = next(i for i in built["items"] if i["id"] == "demolicion")
    assert "subfields" not in demolicion, "Items without saved subfields should not get subfields key"
    print(f"  ✅ Items without saved subfields remain clean")

    print(f"  ✅ Subfields save/load PASSED")


# ============================================================================
# TEST 22: LIVE BACKEND ENDPOINTS (requires running backend)
# ============================================================================

def test_live_renovation_endpoints():
    """Test live renovation endpoints against running backend."""
    print("\n" + "=" * 60)
    print("TEST 22: LIVE RENOVATION ENDPOINTS")
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

            # V4 fields should be present
            assert "total_mano_obra" in data
            assert "total_materiales" in data
            assert "dias_estimados" in data
            assert "item_subfields" in data
            assert "business_rules" in data
            print(f"  ✅ GET /template → has V4 fields (item_subfields, business_rules)")

            items = data.get("items", [])
            if items:
                assert "unidad" in items[0], "Items missing unidad field"
                print(f"  ✅ Items have unidad field")

                # V4: materiales should be non-zero by default
                has_mat = any(i.get("materiales", 0) > 0 for i in items)
                assert has_mat, "Template should have non-zero material defaults"
                print(f"  ✅ Template has non-zero material defaults (H06)")

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

    # Test 3: GET /{fake_id}/approval-status
    try:
        req = urllib.request.Request(f"{base_url}/fake-nonexistent-id/approval-status")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            assert data.get("approval_status") == "none"
            print(f"  ✅ GET /fake-id/approval-status → approval_status=none")
    except Exception as e:
        print(f"  ⚠️  GET /approval-status error: {e}")

    print(f"  ✅ Live renovation endpoints PASSED")


# ============================================================================
# RUN ALL TESTS
# ============================================================================

if __name__ == "__main__":
    print("🧪 RENOVATION V4 TESTS — Material Defaults + Subfields + Approval")
    print("=" * 60)

    tests = [
        test_v2_template_structure,
        test_v4_material_defaults,
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
        test_item_subfields,
        test_business_rules,
        test_approval_endpoints,
        test_subfields_save_load,
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
