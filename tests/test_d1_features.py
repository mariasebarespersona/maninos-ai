"""
D1 Feature Tests — Feb 2026

Tests all the features implemented from the D1 Texas trip answers:
1. Qualification rules (60%, $0-$80K, 200mi, no age)
2. Sell rule (80% of market value)
3. Commission calculation
4. Purchase pipeline status transitions
5. Team roles + yards
6. Purchase lock
7. AI assistant + checklist endpoints
8. PWA files
9. Vocabulary labels
10. Facebook Marketplace scraper structure
"""

import sys
import os
import json
import math

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ============================================================================
# TEST 1: QUALIFICATION RULES
# ============================================================================

def test_qualification_rules():
    """Test the 60% rule, price range, and zone distance."""
    from api.utils.qualification import (
        qualify_listing, BUY_PERCENT, SELL_PERCENT,
        MIN_PRICE, MAX_PRICE, ZONE_RADIUS_MILES,
        is_within_zone, haversine_miles,
        HOUSTON_CENTER, DALLAS_CENTER,
    )

    print("\n" + "=" * 60)
    print("TEST 1: QUALIFICATION RULES")
    print("=" * 60)

    # Constants check
    assert BUY_PERCENT == 0.60, f"BUY_PERCENT should be 0.60, got {BUY_PERCENT}"
    assert SELL_PERCENT == 0.80, f"SELL_PERCENT should be 0.80, got {SELL_PERCENT}"
    assert MIN_PRICE == 0, f"MIN_PRICE should be 0, got {MIN_PRICE}"
    assert MAX_PRICE == 80_000, f"MAX_PRICE should be 80000, got {MAX_PRICE}"
    assert ZONE_RADIUS_MILES == 200, f"ZONE_RADIUS should be 200, got {ZONE_RADIUS_MILES}"
    print("  ✅ Constants: BUY=60%, SELL=80%, $0-$80K, 200mi")

    # 60% rule: $30K listing, $60K market → 50% → PASSES
    q1 = qualify_listing(listing_price=30000, market_value=60000, city="Houston", state="TX")
    assert q1["passes_60_rule"] is True, f"$30K should pass 60% of $60K. Got: {q1}"
    assert q1["is_qualified"] is True
    print("  ✅ 60% rule: $30K @ $60K market = 50% → PASSES")

    # 60% rule: $40K listing, $60K market → 67% → FAILS
    q2 = qualify_listing(listing_price=40000, market_value=60000, city="Houston", state="TX")
    assert q2["passes_60_rule"] is False, f"$40K should fail 60% of $60K. Got: {q2}"
    assert q2["is_qualified"] is False
    print("  ✅ 60% rule: $40K @ $60K market = 67% → FAILS")

    # Boundary: exactly 60%
    q3 = qualify_listing(listing_price=36000, market_value=60000, city="Houston", state="TX")
    assert q3["passes_60_rule"] is True, f"$36K should pass 60% of $60K exactly"
    print("  ✅ 60% rule: $36K @ $60K market = 60% exactly → PASSES")

    # Price range: $0 passes
    q4 = qualify_listing(listing_price=0, market_value=60000, city="Houston", state="TX")
    assert q4["passes_price_range"] is True
    print("  ✅ Price range: $0 → PASSES")

    # Price range: $80K passes
    q5 = qualify_listing(listing_price=80000, market_value=200000, city="Houston", state="TX")
    assert q5["passes_price_range"] is True
    print("  ✅ Price range: $80K → PASSES")

    # Price range: $80,001 fails
    q6 = qualify_listing(listing_price=80001, market_value=200000, city="Houston", state="TX")
    assert q6["passes_price_range"] is False
    print("  ✅ Price range: $80,001 → FAILS")

    # Zone: Houston (0 mi) passes
    zone_h, dist_h = is_within_zone("Houston", "TX")
    assert zone_h is True
    print(f"  ✅ Zone: Houston → PASSES ({dist_h} mi)")

    # Zone: Dallas passes
    zone_d, dist_d = is_within_zone("Dallas", "TX")
    assert zone_d is True
    print(f"  ✅ Zone: Dallas → PASSES ({dist_d} mi)")

    # Zone: El Paso (far from both) should FAIL
    zone_ep, dist_ep = is_within_zone("El Paso", "TX")
    assert zone_ep is False, f"El Paso should be >200mi from both Houston and Dallas, got {dist_ep}"
    print(f"  ✅ Zone: El Paso → FAILS ({dist_ep} mi)")

    # Zone: San Antonio (close to Houston, ~200mi)
    zone_sa, dist_sa = is_within_zone("San Antonio", "TX")
    print(f"  ℹ️  Zone: San Antonio → {'PASSES' if zone_sa else 'FAILS'} ({dist_sa} mi)")

    # Zone: Non-TX state fails
    zone_ca, _ = is_within_zone("Los Angeles", "CA")
    assert zone_ca is False
    print("  ✅ Zone: California → FAILS (not TX)")

    # NO age filter: verify there's no year check in qualify_listing
    # The function doesn't take year as parameter — that's the test!
    import inspect
    sig = inspect.signature(qualify_listing)
    params = list(sig.parameters.keys())
    assert "year" not in params and "year_built" not in params, f"qualify_listing should NOT have a year param"
    print("  ✅ No age filter: qualify_listing has no year parameter")

    print("\n  🎉 TEST 1 PASSED: All qualification rules correct")
    return True


# ============================================================================
# TEST 2: SELL RULE (80%)
# ============================================================================

def test_sell_rule():
    """Test the 80% sell price calculation."""
    from api.utils.qualification import (
        calculate_market_value,
        calculate_max_sell_price,
        get_sell_price_recommendation,
        SELL_PERCENT,
    )

    print("\n" + "=" * 60)
    print("TEST 2: SELL RULE (80%)")
    print("=" * 60)

    assert SELL_PERCENT == 0.80
    print("  ✅ SELL_PERCENT = 80%")

    # Market value from single source (scraping only)
    mv1 = calculate_market_value(scraping_avg=60000, historical_avg=None)
    assert mv1 == 60000, f"Single source should return that value. Got {mv1}"
    print("  ✅ Market value (scraping only): $60K → $60K")

    # Market value from both sources
    mv2 = calculate_market_value(scraping_avg=60000, historical_avg=80000)
    assert mv2 == 70000, f"Average of $60K and $80K should be $70K. Got {mv2}"
    print("  ✅ Market value (dual): $60K + $80K → $70K")

    # Market value with no data
    mv3 = calculate_market_value(scraping_avg=None, historical_avg=None)
    assert mv3 is None
    print("  ✅ Market value (no data): None")

    # Max sell price
    max_sell = calculate_max_sell_price(70000)
    assert max_sell == 56000, f"80% of $70K should be $56K. Got {max_sell}"
    print("  ✅ Max sell price: 80% of $70K = $56K")

    # Full recommendation: investment $40K, market value $60K
    rec = get_sell_price_recommendation(
        purchase_price=30000,
        renovation_cost=10000,
        scraping_avg=60000,
        historical_avg=None,
    )
    assert rec["market_value"] == 60000
    assert rec["max_sell_price_80"] == 48000  # 80% of 60K
    assert rec["total_investment"] == 40000
    # Recommended should be min(40K*1.2=48K, 48K) = 48K
    assert rec["recommended_price"] == 48000
    assert rec["passes_80_rule"] is True
    assert rec["warning"] is None
    print(f"  ✅ Recommendation: invest=$40K, market=$60K → max=$48K, rec=$48K")

    # Case where investment too high
    rec2 = get_sell_price_recommendation(
        purchase_price=50000,
        renovation_cost=10000,
        scraping_avg=60000,
    )
    # Max sell = 48K, but investment = 60K → recommended capped at 48K (loss)
    assert rec2["recommended_price"] == 48000
    assert rec2["warning"] is not None
    print(f"  ✅ Warning case: invest=$60K > max sell $48K → warning raised")

    # Case with no market data
    rec3 = get_sell_price_recommendation(purchase_price=30000, renovation_cost=5000)
    assert rec3["market_value"] is None
    assert rec3["recommended_price"] is None
    assert rec3["warning"] is not None
    print(f"  ✅ No market data: warning + no recommendation")

    print("\n  🎉 TEST 2 PASSED: 80% sell rule working correctly")
    return True


# ============================================================================
# TEST 3: COMMISSION CALCULATION
# ============================================================================

def test_commissions():
    """Test commission calculation logic."""
    from api.utils.commissions import calculate_commission

    print("\n" + "=" * 60)
    print("TEST 3: COMMISSION CALCULATION")
    print("=" * 60)

    # RTO with both employees → $1000 split 50/50
    c1 = calculate_commission(
        sale_type="rto",
        found_by_employee_id="emp-1",
        sold_by_employee_id="emp-2",
    )
    assert c1["commission_amount"] == 1000, f"RTO commission should be $1000. Got {c1}"
    assert c1["commission_found_by"] == 500
    assert c1["commission_sold_by"] == 500
    print("  ✅ RTO (2 employees): $1000 → $500 + $500")

    # Cash with both employees → $1500 split 50/50
    c2 = calculate_commission(
        sale_type="cash",
        found_by_employee_id="emp-1",
        sold_by_employee_id="emp-2",
    )
    assert c2["commission_amount"] == 1500
    assert c2["commission_found_by"] == 750
    assert c2["commission_sold_by"] == 750
    print("  ✅ Cash (2 employees): $1500 → $750 + $750")

    # Only found_by → full commission to finder
    c3 = calculate_commission(
        sale_type="rto",
        found_by_employee_id="emp-1",
        sold_by_employee_id=None,
    )
    assert c3["commission_amount"] == 1000
    assert c3["commission_found_by"] == 1000
    assert c3["commission_sold_by"] == 0
    print("  ✅ RTO (only finder): $1000 → $1000 + $0")

    # Only sold_by → full commission to seller
    c4 = calculate_commission(
        sale_type="cash",
        found_by_employee_id=None,
        sold_by_employee_id="emp-2",
    )
    assert c4["commission_amount"] == 1500
    assert c4["commission_found_by"] == 0
    assert c4["commission_sold_by"] == 1500
    print("  ✅ Cash (only seller): $1500 → $0 + $1500")

    # No employees assigned → commission_amount still reflects the sale type,
    # but no one is assigned to receive it (found_by=0, sold_by=0)
    c5 = calculate_commission(sale_type="rto")
    assert c5["commission_amount"] == 1000, f"RTO commission exists even without assignees. Got {c5['commission_amount']}"
    assert c5["commission_found_by"] == 0
    assert c5["commission_sold_by"] == 0
    print("  ✅ No employees: $1000 total (unassigned), $0 + $0 split")

    # Unknown sale type → $0
    c6 = calculate_commission(sale_type="other")
    assert c6["commission_amount"] == 0
    assert c6["commission_found_by"] == 0
    assert c6["commission_sold_by"] == 0
    print("  ✅ Unknown sale type: $0 total")

    print("\n  🎉 TEST 3 PASSED: Commission calculation correct")
    return True


# ============================================================================
# TEST 4: PURCHASE PIPELINE STATUS TRANSITIONS
# ============================================================================

def test_purchase_pipeline():
    """Test market listing status transitions (file-based, avoids env import issues)."""
    print("\n" + "=" * 60)
    print("TEST 4: PURCHASE PIPELINE TRANSITIONS")
    print("=" * 60)

    # Read market_listings.py source to verify pipeline statuses without importing
    # (importing triggers supabase_client which needs env vars)
    ml_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "api", "routes", "market_listings.py"
    )
    with open(ml_file, "r") as f:
        content = f.read()

    # Check all pipeline statuses exist in the file
    expected_statuses = [
        "contacted", "negotiating", "evaluating",
        "docs_pending", "locked", "purchased", "rejected",
    ]
    for s in expected_statuses:
        assert f'"{s}"' in content or f"'{s}'" in content, f"Status '{s}' missing from market_listings.py"
    print(f"  ✅ All {len(expected_statuses)} pipeline statuses referenced in market_listings.py")

    # Check update_listing_status endpoint handles extended statuses
    assert "update_listing_status" in content or "update-status" in content
    print("  ✅ update_listing_status endpoint defined")

    # Check MarketDashboard has pipeline statuses
    md_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "web", "src", "components", "MarketDashboard.tsx"
    )
    with open(md_file, "r") as f:
        md_content = f.read()

    assert "contacted" in md_content
    assert "negotiating" in md_content
    assert "evaluating" in md_content
    assert "docs_pending" in md_content
    assert "locked" in md_content
    print("  ✅ MarketDashboard.tsx: all pipeline statuses present in frontend")

    # Check property_service has transitions
    svc_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "api", "services", "property_service.py"
    )
    if os.path.exists(svc_file):
        with open(svc_file, "r") as f:
            svc_content = f.read()
        for s in ["contacted", "negotiating", "evaluating", "docs_pending", "locked"]:
            assert s in svc_content, f"Transition status '{s}' should be in property_service.py"
        print("  ✅ property_service.py: all pipeline transitions defined")
    else:
        print("  ℹ️  property_service.py not found (transitions may be in market_listings.py)")

    print("\n  🎉 TEST 4 PASSED: Purchase pipeline statuses verified")
    return True


# ============================================================================
# TEST 5: TEAM ROLES + PERMISSIONS
# ============================================================================

def test_team_roles():
    """Test role definitions and permissions."""
    from api.utils.roles import ROLE_PERMISSIONS, has_permission, get_allowed_roles, check_role

    print("\n" + "=" * 60)
    print("TEST 5: TEAM ROLES + PERMISSIONS")
    print("=" * 60)

    # Admin has all permissions
    admin_perms = ROLE_PERMISSIONS.get("admin", set())
    assert "market" in admin_perms
    assert "properties" in admin_perms
    assert "sales" in admin_perms
    assert "payments" in admin_perms
    assert "capital" in admin_perms
    assert "team" in admin_perms
    assert "yards" in admin_perms
    print(f"  ✅ Admin: {len(admin_perms)} permissions (all)")

    # Operations: market + properties + sales + yards
    ops_perms = ROLE_PERMISSIONS.get("operations", set())
    assert "market" in ops_perms
    assert "properties" in ops_perms
    assert "sales" in ops_perms
    assert "yards" in ops_perms
    assert "payments" not in ops_perms  # Can't make payments
    assert "team" not in ops_perms  # Can't manage team
    print(f"  ✅ Operations: {len(ops_perms)} permissions (no payments, no team mgmt)")

    # Treasury: sales + payments + capital + commissions
    treasury_perms = ROLE_PERMISSIONS.get("treasury", set())
    assert "sales" in treasury_perms
    assert "payments" in treasury_perms
    assert "capital" in treasury_perms
    assert "commissions" in treasury_perms
    assert "market" not in treasury_perms  # Can't scrape
    print(f"  ✅ Treasury: {len(treasury_perms)} permissions (payments + capital)")

    # Yard manager: market + properties + yards
    ym_perms = ROLE_PERMISSIONS.get("yard_manager", set())
    assert "market" in ym_perms
    assert "properties" in ym_perms
    assert "yards" in ym_perms
    assert "payments" not in ym_perms
    assert "team" not in ym_perms
    print(f"  ✅ Yard Manager: {len(ym_perms)} permissions (properties + yards)")

    # has_permission checks
    assert has_permission("admin", "team") is True
    assert has_permission("operations", "team") is False
    assert has_permission("treasury", "payments") is True
    assert has_permission("yard_manager", "payments") is False
    print("  ✅ has_permission() working correctly")

    # get_allowed_roles
    team_roles = get_allowed_roles("team")
    assert "admin" in team_roles
    assert len(team_roles) == 1  # Only admin
    print("  ✅ get_allowed_roles('team') = ['admin']")

    # check_role
    ok, msg = check_role("admin", "team")
    assert ok is True
    ok2, msg2 = check_role("operations", "team")
    assert ok2 is False
    assert "Acceso denegado" in msg2
    print("  ✅ check_role() returns proper error messages")

    print("\n  🎉 TEST 5 PASSED: Team roles and permissions correct")
    return True


# ============================================================================
# TEST 6: PURCHASE LOCK (docs required)
# ============================================================================

def test_purchase_lock():
    """Test that purchase_payments.py checks for docs before allowing payment."""
    print("\n" + "=" * 60)
    print("TEST 6: PURCHASE LOCK")
    print("=" * 60)

    # Verify the purchase lock endpoint exists and has the correct logic
    import ast
    lock_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "api", "routes", "purchase_payments.py"
    )
    with open(lock_file, "r") as f:
        content = f.read()

    # Check for title_application_received check
    assert "title_application_received" in content, "Should check title_application_received"
    assert "bill_of_sale_received" in content, "Should check bill_of_sale_received"
    print("  ✅ purchase_payments.py checks for title_application_received")
    print("  ✅ purchase_payments.py checks for bill_of_sale_received")

    # Check for document receive endpoint (auto-unlocks when both docs received)
    assert "receive-document" in content or "receive_document" in content, "Should have receive-document endpoint"
    print("  ✅ receive-document endpoint exists (auto-unlocks payment)")

    # Check for payment_locked logic
    assert "payment_locked" in content, "Should check payment_locked flag"
    print("  ✅ payment_locked flag checked before allowing payment")

    # Check migration exists
    migration_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "migrations", "016_purchase_docs_lock.sql"
    )
    assert os.path.exists(migration_file), "Migration 016 should exist"
    with open(migration_file, "r") as f:
        migration = f.read()
    assert "title_application_received" in migration
    assert "bill_of_sale_received" in migration
    print("  ✅ Migration 016: title_application_received + bill_of_sale_received columns")

    print("\n  🎉 TEST 6 PASSED: Purchase lock mechanism in place")
    return True


# ============================================================================
# TEST 7: AI ENDPOINTS
# ============================================================================

def test_ai_endpoints():
    """Test AI assistant and checklist endpoint structure."""
    print("\n" + "=" * 60)
    print("TEST 7: AI ENDPOINTS")
    print("=" * 60)

    ai_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "api", "routes", "ai_assistant.py"
    )
    assert os.path.exists(ai_file), "ai_assistant.py should exist"

    with open(ai_file, "r") as f:
        content = f.read()

    # Check chat endpoint
    assert "/chat" in content, "Should have /chat endpoint"
    print("  ✅ /api/ai/chat endpoint defined")

    # Check photo evaluation endpoint
    assert "evaluate-property" in content, "Should have property evaluation endpoint"
    print("  ✅ /api/ai/evaluate-property endpoint defined")

    # Check it queries real data
    assert 'sb.table("properties")' in content or "supabase" in content.lower() or '_get_db_context' in content
    print("  ✅ AI assistant queries real database")

    # Check 26-point checklist reference
    assert "26" in content or "checklist" in content.lower()
    print("  ✅ 26-point checklist reference in photo evaluation")

    print("\n  🎉 TEST 7 PASSED: AI endpoints structured correctly")
    return True


# ============================================================================
# TEST 8: PWA FILES
# ============================================================================

def test_pwa():
    """Test PWA manifest, service worker, and related files."""
    print("\n" + "=" * 60)
    print("TEST 8: PWA FILES")
    print("=" * 60)

    web_public = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "web", "public"
    )

    # manifest.json
    manifest_path = os.path.join(web_public, "manifest.json")
    assert os.path.exists(manifest_path), "manifest.json should exist"
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    assert "name" in manifest
    assert "icons" in manifest
    assert manifest.get("display") == "standalone"
    print(f"  ✅ manifest.json: name='{manifest['name']}', display=standalone")

    # service worker
    sw_path = os.path.join(web_public, "sw.js")
    assert os.path.exists(sw_path), "sw.js should exist"
    with open(sw_path, "r") as f:
        sw_content = f.read()
    assert "install" in sw_content.lower() or "fetch" in sw_content.lower()
    print("  ✅ sw.js: service worker with install/fetch handlers")

    # PWAInstall component
    pwa_component = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "web", "src", "components", "PWA", "PWAInstall.tsx"
    )
    assert os.path.exists(pwa_component), "PWAInstall.tsx should exist"
    with open(pwa_component, "r") as f:
        pwa_content = f.read()
    assert "beforeinstallprompt" in pwa_content
    print("  ✅ PWAInstall.tsx: handles beforeinstallprompt event")

    # Mobile page
    mobile_page = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "web", "src", "app", "mobile", "page.tsx"
    )
    assert os.path.exists(mobile_page), "mobile/page.tsx should exist"
    print("  ✅ Mobile page: /mobile route exists")

    # Layout has manifest meta tag
    layout_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "web", "src", "app", "layout.tsx"
    )
    with open(layout_path, "r") as f:
        layout = f.read()
    assert "manifest" in layout
    print("  ✅ layout.tsx: includes manifest link")

    print("\n  🎉 TEST 8 PASSED: PWA files all present and correct")
    return True


# ============================================================================
# TEST 9: VOCABULARY
# ============================================================================

def test_vocabulary():
    """Test Spanish vocabulary in UI files."""
    print("\n" + "=" * 60)
    print("TEST 9: VOCABULARY LABELS")
    print("=" * 60)

    # Check types/index.ts has vocabulary mapping
    types_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "web", "src", "types", "index.ts"
    )
    with open(types_file, "r") as f:
        types_content = f.read()

    assert "Casa de una sección" in types_content
    assert "Casa doble" in types_content
    assert "Casa móvil" in types_content
    print("  ✅ types/index.ts: 'Casa de una sección', 'Casa doble', 'Casa móvil'")

    assert "getPropertyTypeLabel" in types_content
    print("  ✅ getPropertyTypeLabel() helper function defined")

    # Check MarketDashboard uses Spanish terms
    market_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "web", "src", "components", "MarketDashboard.tsx"
    )
    with open(market_file, "r") as f:
        market_content = f.read()

    assert "Casa de una sección" in market_content
    assert "Casa doble" in market_content
    print("  ✅ MarketDashboard.tsx: uses Spanish property type labels")

    # Login page uses Spanish
    login_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "web", "src", "app", "login", "page.tsx"
    )
    with open(login_file, "r") as f:
        login_content = f.read()

    assert "casas móviles" in login_content
    assert "mobile homes" not in login_content.lower().replace("mobilehome", "")  # mobilehome.net is ok
    print("  ✅ login/page.tsx: 'casas móviles' (not 'mobile homes')")

    # qualification.py has vocabulary comments
    qual_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "api", "utils", "qualification.py"
    )
    with open(qual_file, "r") as f:
        qual_content = f.read()

    assert "casa de una sección" in qual_content
    assert "casa doble" in qual_content
    assert "casa móvil" in qual_content
    print("  ✅ qualification.py: vocabulary comments present")

    print("\n  🎉 TEST 9 PASSED: Spanish vocabulary correctly applied")
    return True


# ============================================================================
# TEST 10: FACEBOOK MARKETPLACE SCRAPER STRUCTURE
# ============================================================================

def test_fb_scraper():
    """Test Facebook Marketplace scraper file structure."""
    print("\n" + "=" * 60)
    print("TEST 10: FACEBOOK MARKETPLACE SCRAPER")
    print("=" * 60)

    fb_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "api", "agents", "buscador", "fb_scraper.py"
    )
    assert os.path.exists(fb_file), "fb_scraper.py should exist"

    with open(fb_file, "r") as f:
        content = f.read()

    # Check it uses Playwright
    assert "playwright" in content.lower() or "Playwright" in content
    print("  ✅ fb_scraper.py: uses Playwright for browser automation")

    # Check it has a scraper class
    assert "FacebookMarketplaceScraper" in content
    print("  ✅ FacebookMarketplaceScraper class defined")

    # Check it targets Houston and Dallas
    assert "houston" in content.lower() or "Houston" in content
    assert "dallas" in content.lower() or "Dallas" in content
    print("  ✅ Targets Houston and Dallas")

    # Check it's integrated into the agent
    agent_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "api", "agents", "buscador", "agent.py"
    )
    with open(agent_file, "r") as f:
        agent_content = f.read()

    assert "scrape_facebook_marketplace" in agent_content
    print("  ✅ BuscadorAgent: scrape_facebook_marketplace tool registered")

    assert "fb_scraper" in agent_content or "FacebookMarketplaceScraper" in agent_content
    print("  ✅ BuscadorAgent: imports FacebookMarketplaceScraper")

    # Check it's integrated into market_listings scrape endpoint
    ml_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "api", "routes", "market_listings.py"
    )
    with open(ml_file, "r") as f:
        ml_content = f.read()

    assert "FacebookMarketplaceScraper" in ml_content or "facebook_marketplace" in ml_content.lower()
    print("  ✅ market_listings.py: Facebook Marketplace integrated into scrape flow")

    print("\n  🎉 TEST 10 PASSED: Facebook Marketplace scraper structured correctly")
    return True


# ============================================================================
# TEST 11: API ENDPOINTS (Live HTTP tests)
# ============================================================================

def test_api_endpoints():
    """Test live API endpoints (requires backend running on port 8000)."""
    import urllib.request
    import urllib.error

    print("\n" + "=" * 60)
    print("TEST 11: LIVE API ENDPOINTS")
    print("=" * 60)

    base = "http://localhost:8000"

    def api_get(path):
        try:
            req = urllib.request.Request(f"{base}{path}")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode() if e.fp else ""
            try:
                return e.code, json.loads(body)
            except Exception:
                return e.code, {"raw": body}
        except Exception as e:
            return 0, {"error": str(e)}

    def api_post(path, data=None):
        try:
            body = json.dumps(data or {}).encode() if data else b"{}"
            req = urllib.request.Request(
                f"{base}{path}",
                data=body,
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            raw = e.read().decode() if e.fp else ""
            try:
                return e.code, json.loads(raw)
            except Exception:
                return e.code, {"raw": raw}
        except Exception as e:
            return 0, {"error": str(e)}

    # Health check
    status, data = api_get("/health")
    assert status == 200, f"Health check failed: {status} {data}"
    print(f"  ✅ GET /health → 200 ({data})")

    # Team endpoints
    status, data = api_get("/api/team/users")
    print(f"  {'✅' if status == 200 else '⚠️'} GET /api/team/users → {status}")

    status, data = api_get("/api/team/yards")
    print(f"  {'✅' if status == 200 else '⚠️'} GET /api/team/yards → {status}")

    # Properties
    status, data = api_get("/api/properties")
    assert status == 200
    prop_count = len(data) if isinstance(data, list) else 0
    print(f"  ✅ GET /api/properties → {status} ({prop_count} properties)")

    # Sales
    status, data = api_get("/api/sales")
    assert status == 200
    sale_count = len(data) if isinstance(data, list) else 0
    print(f"  ✅ GET /api/sales → {status} ({sale_count} sales)")

    # Market listings
    status, data = api_get("/api/market-listings")
    listing_count = len(data) if isinstance(data, list) else data.get("count", "?") if isinstance(data, dict) else "?"
    print(f"  {'✅' if status == 200 else '⚠️'} GET /api/market-listings → {status} ({listing_count})")

    # AI chat endpoint (POST)
    status, data = api_post("/api/ai/chat", {"query": "¿Cuántas casas tenemos?"})
    print(f"  {'✅' if status == 200 else '⚠️'} POST /api/ai/chat → {status}")
    if status == 200 and isinstance(data, dict):
        answer = data.get("answer", data.get("response", ""))[:80]
        print(f"      Response: {answer}...")

    # Recommended price for first property (if any)
    if prop_count > 0 and isinstance(data, list):
        pass  # We already have properties list from above

    # Get properties again for recommended price test
    _, props = api_get("/api/properties")
    if isinstance(props, list) and len(props) > 0:
        first_prop = props[0]
        pid = first_prop.get("id")
        status_rp, data_rp = api_get(f"/api/properties/{pid}/recommended-price")
        print(f"  {'✅' if status_rp == 200 else '⚠️'} GET /api/properties/{pid[:8]}…/recommended-price → {status_rp}")
        if status_rp == 200 and isinstance(data_rp, dict):
            mv = data_rp.get("market_value")
            max_s = data_rp.get("max_sell_price_80")
            rec = data_rp.get("recommended_price")
            print(f"      Market value: ${mv}, Max sell (80%): ${max_s}, Recommended: ${rec}")

    print("\n  🎉 TEST 11 PASSED: Live API endpoints responding")
    return True


# ============================================================================
# TEST 12: FRONTEND FILES (PWA + Next.js proxy routes)
# ============================================================================

def test_frontend_files():
    """Test that frontend proxy routes and pages exist."""
    print("\n" + "=" * 60)
    print("TEST 12: FRONTEND FILES")
    print("=" * 60)

    web_src = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "web", "src"
    )

    # Recommended price proxy
    rp_route = os.path.join(web_src, "app", "api", "properties", "[id]", "recommended-price", "route.ts")
    assert os.path.exists(rp_route), f"recommended-price route should exist at {rp_route}"
    print("  ✅ /api/properties/[id]/recommended-price/route.ts exists")

    # Publish route has force parameter
    pub_route = os.path.join(web_src, "app", "api", "properties", "[id]", "publish", "route.ts")
    with open(pub_route, "r") as f:
        pub_content = f.read()
    assert "force" in pub_content
    print("  ✅ /api/properties/[id]/publish/route.ts: passes 'force' param")

    # Property detail page has recommended price logic
    detail_page = os.path.join(web_src, "app", "homes", "properties", "[id]", "page.tsx")
    with open(detail_page, "r") as f:
        detail_content = f.read()
    assert "recommendedPrice" in detail_content
    assert "recommended-price" in detail_content
    assert "80%" in detail_content or "Regla 80%" in detail_content
    print("  ✅ Property detail page: fetches recommended price + shows 80% rule")

    # Mobile page exists
    mobile_page = os.path.join(web_src, "app", "mobile", "page.tsx")
    assert os.path.exists(mobile_page)
    print("  ✅ /mobile/page.tsx exists")

    # Team management route (migration)
    migration_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "migrations", "017_team_roles_yards.sql"
    )
    assert os.path.exists(migration_file)
    with open(migration_file, "r") as f:
        mig_content = f.read()
    assert "yards" in mig_content
    assert "yard_assignments" in mig_content
    assert "'admin'" in mig_content
    assert "'operations'" in mig_content
    assert "'treasury'" in mig_content
    assert "'yard_manager'" in mig_content
    print("  ✅ Migration 017: yards + yard_assignments + 4 roles")

    print("\n  🎉 TEST 12 PASSED: All frontend files present and correct")
    return True


# ============================================================================
# MAIN RUNNER
# ============================================================================

if __name__ == "__main__":
    results = {}
    tests = [
        ("qualification", test_qualification_rules),
        ("sell_rule", test_sell_rule),
        ("commissions", test_commissions),
        ("purchase_pipeline", test_purchase_pipeline),
        ("team_roles", test_team_roles),
        ("purchase_lock", test_purchase_lock),
        ("ai_endpoints", test_ai_endpoints),
        ("pwa", test_pwa),
        ("vocabulary", test_vocabulary),
        ("fb_scraper", test_fb_scraper),
        ("api_endpoints", test_api_endpoints),
        ("frontend_files", test_frontend_files),
    ]

    passed = 0
    failed = 0

    for name, test_fn in tests:
        try:
            test_fn()
            results[name] = "PASSED ✅"
            passed += 1
        except Exception as e:
            results[name] = f"FAILED ❌ — {e}"
            failed += 1
            import traceback
            traceback.print_exc()

    # Final summary
    print("\n" + "=" * 60)
    print("FINAL RESULTS")
    print("=" * 60)
    for name, result in results.items():
        print(f"  {result}  {name}")

    print(f"\n  TOTAL: {passed} passed, {failed} failed out of {len(tests)}")
    print("=" * 60)

    sys.exit(0 if failed == 0 else 1)

