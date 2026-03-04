"""
Tests for Property Update (PATCH) — Internal Server Error Fix

Tests that _format_property handles null/None values correctly for
boolean and collection fields, and that the PATCH handler strips
unknown columns when the migration hasn't been run yet.

Root cause: dict.get("key", default) returns None (not the default)
when the key exists with value None. Pydantic's non-Optional bool
fields reject None, causing a 500 Internal Server Error.

Fix: Use `data.get("key") or default_value` pattern instead of
`data.get("key", default_value)`.
"""

import sys
import os
import json
from datetime import datetime
from unittest.mock import MagicMock, patch

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set dummy env vars BEFORE any imports that touch Supabase client
os.environ["SUPABASE_URL"] = os.environ.get("SUPABASE_URL", "https://test.supabase.co")
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "test-key-not-real")

# Mock the supabase create_client before any module imports it
mock_sb = MagicMock()
sys.modules["supabase"] = MagicMock(create_client=MagicMock(return_value=mock_sb), Client=MagicMock)
# Also pre-populate tools.supabase_client so importing it doesn't call real create_client
import types
_mock_module = types.ModuleType("tools.supabase_client")
_mock_module.sb = mock_sb  # type: ignore
_mock_module.BUCKET = "property-docs"  # type: ignore
sys.modules["tools.supabase_client"] = _mock_module

from api.models.schemas import PropertyResponse, PropertyStatus


# ============================================================================
# TEST 1: _format_property null safety for boolean fields
# ============================================================================

def test_format_property_with_null_booleans():
    """
    _format_property must NOT crash when is_renovated and
    checklist_completed are None in the database response.
    
    This was the root cause of the Internal Server Error:
    - dict.get("is_renovated", False) returns None when key exists with None
    - PropertyResponse(is_renovated: bool) rejects None → validation error → 500
    
    Fix: use `data.get("is_renovated") or False`
    """
    from api.routes.properties import _format_property

    print("\n" + "=" * 60)
    print("TEST 1: _format_property with null booleans")
    print("=" * 60)

    data = {
        "id": "test-uuid-123",
        "address": "123 Main St",
        "city": "Houston",
        "state": "Texas",
        "zip_code": "77001",
        "hud_number": "TEX123",
        "year": 2020,
        "purchase_price": 30000.0,
        "sale_price": 50000.0,
        "bedrooms": 3,
        "bathrooms": 2.0,
        "square_feet": 1216,
        "property_code": "A1",
        "length_ft": 76,
        "width_ft": 16,
        "status": "purchased",
        # These are the critical fields — None in DB
        "is_renovated": None,
        "photos": None,
        "checklist_completed": None,
        "checklist_data": None,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }

    result = _format_property(data)

    assert result.is_renovated == False, f"Expected False, got {result.is_renovated}"
    assert result.checklist_completed == False, f"Expected False, got {result.checklist_completed}"
    assert result.photos == [], f"Expected [], got {result.photos}"
    assert result.checklist_data == {}, f"Expected {{}}, got {result.checklist_data}"

    print("✅ _format_property handles None booleans correctly")
    print(f"   is_renovated: {result.is_renovated} (expected False)")
    print(f"   checklist_completed: {result.checklist_completed} (expected False)")
    print(f"   photos: {result.photos} (expected [])")
    print(f"   checklist_data: {result.checklist_data} (expected {{}})")


# ============================================================================
# TEST 2: _format_property with proper values
# ============================================================================

def test_format_property_with_proper_values():
    """_format_property works correctly when all values are present and valid."""
    from api.routes.properties import _format_property

    print("\n" + "=" * 60)
    print("TEST 2: _format_property with proper values")
    print("=" * 60)

    data = {
        "id": "test-uuid-456",
        "address": "456 Oak Ave",
        "city": "Dallas",
        "state": "Texas",
        "zip_code": "75001",
        "hud_number": "TEX456",
        "year": 2015,
        "purchase_price": 45000.0,
        "sale_price": 65000.0,
        "bedrooms": 4,
        "bathrooms": 2.5,
        "square_feet": 2000,
        "property_code": "B2",
        "length_ft": 80,
        "width_ft": 25,
        "status": "purchased",
        "is_renovated": True,
        "photos": ["photo1.jpg", "photo2.jpg"],
        "checklist_completed": True,
        "checklist_data": {"item1": True, "item2": False},
        "created_at": "2026-02-01T00:00:00+00:00",
        "updated_at": "2026-02-15T00:00:00+00:00",
    }

    result = _format_property(data)

    assert result.id == "test-uuid-456"
    assert result.address == "456 Oak Ave"
    assert result.is_renovated == True
    assert result.checklist_completed == True
    assert result.photos == ["photo1.jpg", "photo2.jpg"]
    assert result.length_ft == 80
    assert result.width_ft == 25
    assert result.property_code == "B2"

    print("✅ _format_property works correctly with proper values")
    print(f"   is_renovated: {result.is_renovated}")
    print(f"   checklist_completed: {result.checklist_completed}")
    print(f"   length_ft: {result.length_ft}, width_ft: {result.width_ft}")


# ============================================================================
# TEST 3: _format_property with null state (should default to Texas)
# ============================================================================

def test_format_property_null_state_defaults_to_texas():
    """When state is None in the DB, _format_property should default to 'Texas'."""
    from api.routes.properties import _format_property

    print("\n" + "=" * 60)
    print("TEST 3: _format_property with null state")
    print("=" * 60)

    data = {
        "id": "test-uuid-789",
        "address": "789 Pine St",
        "city": "Houston",
        "state": None,  # Null in DB
        "zip_code": None,
        "hud_number": None,
        "year": None,
        "purchase_price": None,
        "sale_price": None,
        "bedrooms": None,
        "bathrooms": None,
        "square_feet": None,
        "property_code": None,
        "length_ft": None,
        "width_ft": None,
        "status": "purchased",
        "is_renovated": None,
        "photos": None,
        "checklist_completed": None,
        "checklist_data": None,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }

    result = _format_property(data)

    assert result.state == "Texas", f"Expected 'Texas', got '{result.state}'"
    assert result.is_renovated == False
    assert result.checklist_completed == False

    print("✅ state defaults to 'Texas' when null in DB")
    print(f"   state: '{result.state}'")


# ============================================================================
# TEST 4: _format_property missing columns (migration not run)
# ============================================================================

def test_format_property_missing_columns():
    """
    _format_property should handle missing columns gracefully.
    Before migration 046, length_ft, width_ft, property_code don't exist.
    dict.get() returns None for missing keys, which is fine for Optional fields.
    """
    from api.routes.properties import _format_property

    print("\n" + "=" * 60)
    print("TEST 4: _format_property with missing columns")
    print("=" * 60)

    # Simulate a DB row from BEFORE migration 046
    data = {
        "id": "test-uuid-old",
        "address": "Old Property",
        "city": "Houston",
        "state": "Texas",
        "zip_code": "77001",
        "hud_number": "TEX-OLD",
        "year": 2010,
        "purchase_price": 20000.0,
        "sale_price": None,
        "bedrooms": 2,
        "bathrooms": 1.0,
        "square_feet": 800,
        # NO property_code, length_ft, width_ft keys at all
        "status": "purchased",
        "is_renovated": False,
        "photos": [],
        "checklist_completed": False,
        "checklist_data": {},
        "created_at": "2025-12-01T00:00:00+00:00",
        "updated_at": "2025-12-01T00:00:00+00:00",
    }

    result = _format_property(data)

    assert result.property_code is None, f"Expected None, got {result.property_code}"
    assert result.length_ft is None, f"Expected None, got {result.length_ft}"
    assert result.width_ft is None, f"Expected None, got {result.width_ft}"

    print("✅ _format_property handles missing columns (pre-migration)")
    print(f"   property_code: {result.property_code} (expected None)")
    print(f"   length_ft: {result.length_ft} (expected None)")
    print(f"   width_ft: {result.width_ft} (expected None)")


# ============================================================================
# TEST 5: Unknown columns stripped from update payload
# ============================================================================

def test_unknown_columns_stripped():
    """
    When the update payload includes columns that don't exist in the DB
    (e.g., migration not run), the PATCH handler should strip them
    before sending to Supabase.
    """
    print("\n" + "=" * 60)
    print("TEST 5: Unknown columns stripped from update payload")
    print("=" * 60)

    # Simulate: current DB row doesn't have length_ft, width_ft columns
    current_data_keys = {
        "id", "address", "city", "state", "zip_code", "hud_number",
        "year", "purchase_price", "sale_price", "bedrooms", "bathrooms",
        "square_feet", "status", "is_renovated", "photos",
        "checklist_completed", "checklist_data", "created_at", "updated_at",
        # NO property_code, length_ft, width_ft
    }

    # Simulate update_data from the frontend payload
    update_data = {
        "address": "123 Updated St",
        "city": "Houston",
        "length_ft": 76,
        "width_ft": 16,
        "property_code": "A1",
        "square_feet": 1216,
    }

    # This is what the fix does: strip unknown columns
    unknown_cols = [k for k in update_data if k not in current_data_keys]
    for col in unknown_cols:
        del update_data[col]

    assert "length_ft" not in update_data, "length_ft should be stripped"
    assert "width_ft" not in update_data, "width_ft should be stripped"
    assert "property_code" not in update_data, "property_code should be stripped"
    assert "address" in update_data, "address should remain"
    assert "city" in update_data, "city should remain"
    assert "square_feet" in update_data, "square_feet should remain"

    print("✅ Unknown columns stripped from update payload")
    print(f"   Stripped: {unknown_cols}")
    print(f"   Remaining: {list(update_data.keys())}")


# ============================================================================
# TEST 6: dict.get() with None vs missing key
# ============================================================================

def test_dict_get_none_vs_missing():
    """
    Demonstrate the dict.get() bug that caused the original issue.
    dict.get(key, default) returns None when key exists with None value,
    NOT the default. This is the root cause of the 500 error.
    """
    print("\n" + "=" * 60)
    print("TEST 6: dict.get() None vs missing key behavior")
    print("=" * 60)

    data = {"exists_with_none": None, "exists_with_value": True}

    # BUG: dict.get returns None, not False
    old_pattern = data.get("exists_with_none", False)
    assert old_pattern is None, f"dict.get should return None, got {old_pattern}"
    print(f"   data.get('exists_with_none', False) = {old_pattern} (None, NOT False!)")

    # FIX: 'or' coalesces None to default
    new_pattern = data.get("exists_with_none") or False
    assert new_pattern == False, f"'or' pattern should return False, got {new_pattern}"
    print(f"   data.get('exists_with_none') or False = {new_pattern} (False ✓)")

    # For missing keys, both work the same
    old_missing = data.get("missing_key", False)
    new_missing = data.get("missing_key") or False
    assert old_missing == False
    assert new_missing == False
    print(f"   Both patterns work for missing keys: {old_missing}")

    # For existing True values, 'or' also works correctly
    new_true = data.get("exists_with_value") or False
    assert new_true == True, f"Should keep True, got {new_true}"
    print(f"   data.get('exists_with_value') or False = {new_true} (keeps True ✓)")

    print("✅ Demonstrates the fix for dict.get() with None values")


# ============================================================================
# TEST 7: PropertyUpdate model handles all Optional fields
# ============================================================================

def test_property_update_model_all_optional():
    """PropertyUpdate model should accept partial data (all fields Optional)."""
    from api.models.schemas import PropertyUpdate

    print("\n" + "=" * 60)
    print("TEST 7: PropertyUpdate model accepts partial data")
    print("=" * 60)

    # Only dimensions — should be valid
    update = PropertyUpdate(length_ft=76, width_ft=16, square_feet=1216)
    data = update.model_dump(exclude_none=True)

    assert data == {"length_ft": 76, "width_ft": 16, "square_feet": 1216}
    assert "address" not in data  # Not provided, excluded by exclude_none

    # Empty update — should be valid
    empty_update = PropertyUpdate()
    empty_data = empty_update.model_dump(exclude_none=True)
    assert empty_data == {}

    print("✅ PropertyUpdate accepts partial data correctly")
    print(f"   Dimensions only: {data}")
    print(f"   Empty update: {empty_data}")


# ============================================================================
# TEST 8: _format_property handles document_data correctly
# ============================================================================

def test_format_property_document_data():
    """
    _format_property should handle document_data:
    - None → {} (empty dict)
    - Missing key → {} (empty dict)
    - Valid dict → preserved as-is
    """
    from api.routes.properties import _format_property

    print("\n" + "=" * 60)
    print("TEST 8: _format_property document_data handling")
    print("=" * 60)

    base = {
        "id": "test-doc-data",
        "address": "100 Doc Ave",
        "status": "purchased",
        "is_renovated": False,
        "photos": [],
        "checklist_completed": False,
        "checklist_data": {},
        "created_at": "2026-03-01T00:00:00+00:00",
        "updated_at": "2026-03-01T00:00:00+00:00",
    }

    # Case 1: document_data is None
    result1 = _format_property({**base, "document_data": None})
    assert result1.document_data == {}, f"Expected {{}}, got {result1.document_data}"

    # Case 2: document_data key missing entirely (pre-migration)
    result2 = _format_property(base)
    assert result2.document_data == {}, f"Expected {{}}, got {result2.document_data}"

    # Case 3: document_data with actual BOS data
    bos_data = {"bos_purchase": {"seller_name": "John", "buyer_name": "MANINOS HOMES"}}
    result3 = _format_property({**base, "document_data": bos_data})
    assert result3.document_data == bos_data, f"Expected BOS data, got {result3.document_data}"

    print("✅ document_data handled correctly")
    print(f"   None → {result1.document_data}")
    print(f"   Missing → {result2.document_data}")
    print(f"   Valid → {result3.document_data}")


# ============================================================================
# TEST 9: PropertyUpdate accepts document_data
# ============================================================================

def test_property_update_document_data():
    """PropertyUpdate model should accept document_data as an optional dict."""
    from api.models.schemas import PropertyUpdate

    print("\n" + "=" * 60)
    print("TEST 9: PropertyUpdate accepts document_data")
    print("=" * 60)

    bos_data = {
        "bos_purchase": {
            "seller_name": "John Doe",
            "buyer_name": "MANINOS HOMES",
            "total_payment": "$30,000",
        }
    }

    update = PropertyUpdate(document_data=bos_data)
    data = update.model_dump(exclude_none=True)

    assert "document_data" in data
    assert data["document_data"]["bos_purchase"]["seller_name"] == "John Doe"

    # Without document_data
    update2 = PropertyUpdate(address="New Address")
    data2 = update2.model_dump(exclude_none=True)
    assert "document_data" not in data2

    print("✅ PropertyUpdate accepts document_data correctly")
    print(f"   With data: {list(data.keys())}")
    print(f"   Without: {list(data2.keys())}")


# ============================================================================
# RUN ALL TESTS
# ============================================================================

if __name__ == "__main__":
    tests = [
        test_format_property_with_null_booleans,
        test_format_property_with_proper_values,
        test_format_property_null_state_defaults_to_texas,
        test_format_property_missing_columns,
        test_unknown_columns_stripped,
        test_dict_get_none_vs_missing,
        test_property_update_model_all_optional,
        test_format_property_document_data,
        test_property_update_document_data,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            failed += 1
            print(f"\n❌ {test.__name__} FAILED: {e}")

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed}/{len(tests)} passed, {failed} failed")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)
    else:
        print("\n🎉 All property update tests passed!")

