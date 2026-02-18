#!/usr/bin/env bash
# =============================================================================
# Portal Integration Tests — Homes × Clientes × Capital
#
# Tests all API endpoints that connect the 3 portals:
#   - Homes    (public property catalog, purchases)
#   - Clientes (client portal — my account, payments, KYC, documents)
#   - Capital  (admin — KYC review, payments, contracts, applications)
#
# Usage:
#   API_URL=https://your-backend.railway.app ./tests/test_portal_integration.sh
#   # or locally:
#   API_URL=http://localhost:8000 ./tests/test_portal_integration.sh
#
# Requirements: curl, jq
# =============================================================================

set -euo pipefail

API="${API_URL:-http://localhost:8000}"
PASS=0
FAIL=0
WARN=0
RESULTS=()

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Helpers ──────────────────────────────────────────────────────────

check() {
  local name="$1"
  local method="${2:-GET}"
  local url="$3"
  local body="${4:-}"
  local expect_status="${5:-200}"

  printf "  %-60s " "$name"

  if [ "$method" = "GET" ]; then
    resp=$(curl -s -w "\n%{http_code}" "$API$url" 2>/dev/null || echo -e "\n000")
  else
    resp=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$body" "$API$url" 2>/dev/null || echo -e "\n000")
  fi

  status=$(echo "$resp" | tail -1)
  body_resp=$(echo "$resp" | sed '$d')

  if [ "$status" = "$expect_status" ]; then
    # Check if response has ok:true (for JSON endpoints)
    if echo "$body_resp" | jq -e '.ok' > /dev/null 2>&1; then
      ok_val=$(echo "$body_resp" | jq -r '.ok')
      if [ "$ok_val" = "true" ]; then
        echo -e "${GREEN}✓ PASS${NC} (${status})"
        PASS=$((PASS + 1))
        RESULTS+=("✓ $name")
      else
        echo -e "${YELLOW}⚠ WARN${NC} (${status}, ok=$ok_val)"
        WARN=$((WARN + 1))
        RESULTS+=("⚠ $name — ok=$ok_val")
      fi
    else
      echo -e "${GREEN}✓ PASS${NC} (${status})"
      PASS=$((PASS + 1))
      RESULTS+=("✓ $name")
    fi
  elif [ "$status" = "000" ]; then
    echo -e "${RED}✗ FAIL${NC} (connection refused)"
    FAIL=$((FAIL + 1))
    RESULTS+=("✗ $name — connection refused")
  else
    echo -e "${RED}✗ FAIL${NC} (expected ${expect_status}, got ${status})"
    FAIL=$((FAIL + 1))
    # Show error detail if available
    err_detail=$(echo "$body_resp" | jq -r '.detail // .error // empty' 2>/dev/null || true)
    [ -n "$err_detail" ] && echo "    → $err_detail"
    RESULTS+=("✗ $name — HTTP $status")
  fi
}

check_deprecated() {
  local name="$1"
  local method="${2:-POST}"
  local url="$3"

  printf "  %-60s " "$name"

  if [ "$method" = "GET" ]; then
    resp=$(curl -s -w "\n%{http_code}" "$API$url" 2>/dev/null || echo -e "\n000")
  else
    resp=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d '{}' "$API$url" 2>/dev/null || echo -e "\n000")
  fi

  status=$(echo "$resp" | tail -1)

  if [ "$status" = "410" ] || [ "$status" = "422" ] || [ "$status" = "404" ]; then
    echo -e "${GREEN}✓ PASS${NC} (deprecated, ${status})"
    PASS=$((PASS + 1))
    RESULTS+=("✓ $name (deprecated)")
  elif [ "$status" = "000" ]; then
    echo -e "${RED}✗ FAIL${NC} (connection refused)"
    FAIL=$((FAIL + 1))
    RESULTS+=("✗ $name — connection refused")
  else
    echo -e "${YELLOW}⚠ WARN${NC} (expected 410, got ${status})"
    WARN=$((WARN + 1))
    RESULTS+=("⚠ $name — expected deprecated, got $status")
  fi
}

section() {
  echo ""
  echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

# =============================================================================
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   MANINOS PORTAL INTEGRATION TESTS                          ║${NC}"
echo -e "${CYAN}║   Homes × Clientes × Capital                               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Backend: $API"
echo "  Date:    $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ─────────────────────────────────────────────────────────────────────
section "1. HOMES → CLIENTES: Property Catalog"
# ─────────────────────────────────────────────────────────────────────

check "GET /public/properties (listed)" \
  "GET" "/api/public/properties?status=listed&limit=5"

check "GET /public/properties/cities/list" \
  "GET" "/api/public/properties/cities/list"

check "GET /public/properties/partners" \
  "GET" "/api/public/properties/partners"

check "GET /public/properties/stats/summary" \
  "GET" "/api/public/properties/stats/summary"

# ─────────────────────────────────────────────────────────────────────
section "2. CLIENT LOOKUP & AUTH"
# ─────────────────────────────────────────────────────────────────────

check "GET /public/clients/lookup (no email → 422)" \
  "GET" "/api/public/clients/lookup" "" "422"

check "GET /public/clients/lookup (fake email → 404)" \
  "GET" "/api/public/clients/lookup?email=nonexistent@test.com" "" "404"

# ─────────────────────────────────────────────────────────────────────
section "3. CLIENT PURCHASES & RTO (requires real client_id)"
# ─────────────────────────────────────────────────────────────────────

# Use a fake UUID — should return 404 or empty list
FAKE_CLIENT="00000000-0000-0000-0000-000000000000"

check "GET /public/clients/{id}/purchases (fake)" \
  "GET" "/api/public/clients/$FAKE_CLIENT/purchases"

check "GET /public/clients/{id}/payments (fake)" \
  "GET" "/api/public/clients/$FAKE_CLIENT/payments"

check "GET /public/clients/{id}/account-statement (fake)" \
  "GET" "/api/public/clients/$FAKE_CLIENT/account-statement"

check "GET /public/clients/{id}/documents (fake)" \
  "GET" "/api/public/clients/$FAKE_CLIENT/documents"

check "GET /public/clients/{id}/kyc-status (fake)" \
  "GET" "/api/public/clients/$FAKE_CLIENT/kyc-status"

check "GET /public/clients/{id}/rto-contract/{saleId} (fake)" \
  "GET" "/api/public/clients/$FAKE_CLIENT/rto-contract/00000000-0000-0000-0000-000000000001"

# ─────────────────────────────────────────────────────────────────────
section "4. CLIENT KYC UPLOAD FLOW"
# ─────────────────────────────────────────────────────────────────────

check "POST /public/clients/{id}/kyc-submit (missing data → 422)" \
  "POST" "/api/public/clients/$FAKE_CLIENT/kyc-submit" '{}' "422"

check "POST /public/clients/{id}/kyc-submit (fake client → 404)" \
  "POST" "/api/public/clients/$FAKE_CLIENT/kyc-submit" \
  '{"id_front_url":"https://example.com/front.jpg","selfie_url":"https://example.com/selfie.jpg","id_type":"drivers_license"}' \
  "404"

# ─────────────────────────────────────────────────────────────────────
section "5. CLIENT PAYMENT REPORTING"
# ─────────────────────────────────────────────────────────────────────

FAKE_PAYMENT="00000000-0000-0000-0000-000000000002"

check "POST /public/clients/{id}/payments/{paymentId}/report (fake → 404)" \
  "POST" "/api/public/clients/$FAKE_CLIENT/payments/$FAKE_PAYMENT/report" \
  '{"payment_method":"cash_office"}' "404"

# ─────────────────────────────────────────────────────────────────────
section "6. PURCHASE INITIATION"
# ─────────────────────────────────────────────────────────────────────

check "POST /public/purchases/initiate (missing data → 422)" \
  "POST" "/api/public/purchases/initiate" '{}' "422"

check "POST /public/purchases/initiate-rto (missing data → 422)" \
  "POST" "/api/public/purchases/initiate-rto" '{}' "422"

# ─────────────────────────────────────────────────────────────────────
section "7. CAPITAL → KYC MANAGEMENT"
# ─────────────────────────────────────────────────────────────────────

check "GET /capital/kyc/status/{clientId} (fake)" \
  "GET" "/api/capital/kyc/status/$FAKE_CLIENT"

check "POST /capital/kyc/request-verification (fake → 404)" \
  "POST" "/api/capital/kyc/request-verification" \
  '{"client_id":"'"$FAKE_CLIENT"'"}' "404"

check "POST /capital/kyc/review (fake → 404)" \
  "POST" "/api/capital/kyc/review" \
  '{"client_id":"'"$FAKE_CLIENT"'","decision":"approved","reviewed_by":"test"}' "404"

check "POST /capital/kyc/manual-verify (fake → 404)" \
  "POST" "/api/capital/kyc/manual-verify" \
  '{"client_id":"'"$FAKE_CLIENT"'","verified_by":"test"}' "404"

# ─────────────────────────────────────────────────────────────────────
section "8. CAPITAL → PAYMENTS"
# ─────────────────────────────────────────────────────────────────────

check "GET /capital/payments" \
  "GET" "/api/capital/payments"

check "GET /capital/payments/overdue" \
  "GET" "/api/capital/payments/overdue"

check "GET /capital/payments/mora-summary" \
  "GET" "/api/capital/payments/mora-summary"

check "POST /capital/payments/update-statuses" \
  "POST" "/api/capital/payments/update-statuses" '{}'

check "GET /capital/payments/commissions" \
  "GET" "/api/capital/payments/commissions"

# ─────────────────────────────────────────────────────────────────────
section "9. CAPITAL → CONTRACTS & APPLICATIONS"
# ─────────────────────────────────────────────────────────────────────

check "GET /capital/contracts" \
  "GET" "/api/capital/contracts"

check "GET /capital/applications" \
  "GET" "/api/capital/applications"

# ─────────────────────────────────────────────────────────────────────
section "10. PORTAL LINKS HEALTH"
# ─────────────────────────────────────────────────────────────────────

check "GET /portal-links/health" \
  "GET" "/api/portal-links/health"

# ─────────────────────────────────────────────────────────────────────
section "11. DEPRECATED ENDPOINTS (should return 410 Gone)"
# ─────────────────────────────────────────────────────────────────────

# These are the old Sumsub endpoints — they should be deprecated
# (Note: they may return 410, 404, or 422 depending on implementation)

# No specific deprecated endpoints on the backend — the deprecated ones
# are on the Next.js proxy layer only.

# ─────────────────────────────────────────────────────────────────────
section "12. CROSS-PORTAL DATA CONSISTENCY"
# ─────────────────────────────────────────────────────────────────────

# Verify that the property catalog returns consistent schema
echo "  Checking property schema..."
prop_resp=$(curl -s "$API/api/public/properties?status=listed&limit=1" 2>/dev/null || echo '{}')
prop_ok=$(echo "$prop_resp" | jq -r '.ok' 2>/dev/null || echo "false")

if [ "$prop_ok" = "true" ]; then
  prop_count=$(echo "$prop_resp" | jq '.properties | length' 2>/dev/null || echo "0")
  if [ "$prop_count" -gt 0 ]; then
    # Check required fields exist
    has_id=$(echo "$prop_resp" | jq '.properties[0] | has("id")' 2>/dev/null || echo "false")
    has_address=$(echo "$prop_resp" | jq '.properties[0] | has("address")' 2>/dev/null || echo "false")
    has_price=$(echo "$prop_resp" | jq '.properties[0] | has("sale_price")' 2>/dev/null || echo "false")
    has_photos=$(echo "$prop_resp" | jq '.properties[0] | has("photos")' 2>/dev/null || echo "false")

    printf "  %-60s " "Property has id, address, sale_price, photos"
    if [ "$has_id" = "true" ] && [ "$has_address" = "true" ] && [ "$has_price" = "true" ] && [ "$has_photos" = "true" ]; then
      echo -e "${GREEN}✓ PASS${NC}"
      PASS=$((PASS + 1))
      RESULTS+=("✓ Property schema validation")
    else
      echo -e "${RED}✗ FAIL${NC} (missing fields)"
      FAIL=$((FAIL + 1))
      RESULTS+=("✗ Property schema — missing fields")
    fi

    # Get first property ID for deeper tests
    PROP_ID=$(echo "$prop_resp" | jq -r '.properties[0].id' 2>/dev/null || echo "")
    if [ -n "$PROP_ID" ] && [ "$PROP_ID" != "null" ]; then
      check "GET /public/properties/{id} (real property)" \
        "GET" "/api/public/properties/$PROP_ID"
    fi
  else
    printf "  %-60s " "Property catalog has listed properties"
    echo -e "${YELLOW}⚠ WARN${NC} (no properties listed)"
    WARN=$((WARN + 1))
    RESULTS+=("⚠ No properties listed in catalog")
  fi
else
  printf "  %-60s " "Property catalog accessible"
  echo -e "${RED}✗ FAIL${NC}"
  FAIL=$((FAIL + 1))
  RESULTS+=("✗ Property catalog not accessible")
fi

# Verify payments endpoint returns correct schema  
echo "  Checking Capital payments schema..."
pay_resp=$(curl -s "$API/api/capital/payments?limit=1" 2>/dev/null || echo '{}')
pay_ok=$(echo "$pay_resp" | jq -r '.ok' 2>/dev/null || echo "false")

if [ "$pay_ok" = "true" ]; then
  pay_count=$(echo "$pay_resp" | jq '.payments | length' 2>/dev/null || echo "0")
  if [ "$pay_count" -gt 0 ]; then
    # Check client_reported status is queryable
    cr_resp=$(curl -s "$API/api/capital/payments?status=client_reported" 2>/dev/null || echo '{}')
    cr_ok=$(echo "$cr_resp" | jq -r '.ok' 2>/dev/null || echo "false")
    printf "  %-60s " "Capital payments filter: client_reported"
    if [ "$cr_ok" = "true" ]; then
      cr_count=$(echo "$cr_resp" | jq '.payments | length' 2>/dev/null || echo "0")
      echo -e "${GREEN}✓ PASS${NC} ($cr_count found)"
      PASS=$((PASS + 1))
      RESULTS+=("✓ client_reported filter works ($cr_count)")
    else
      echo -e "${RED}✗ FAIL${NC}"
      FAIL=$((FAIL + 1))
      RESULTS+=("✗ client_reported filter broken")
    fi
  else
    printf "  %-60s " "Payments exist in Capital"
    echo -e "${YELLOW}⚠ WARN${NC} (no payments yet)"
    WARN=$((WARN + 1))
    RESULTS+=("⚠ No payments in Capital yet")
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  SUMMARY${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS${NC}  ${RED}FAIL: $FAIL${NC}  ${YELLOW}WARN: $WARN${NC}  TOTAL: $((PASS + FAIL + WARN))"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}Failed tests:${NC}"
  for r in "${RESULTS[@]}"; do
    if [[ "$r" == ✗* ]]; then
      echo -e "    ${RED}$r${NC}"
    fi
  done
  echo ""
fi

if [ "$WARN" -gt 0 ]; then
  echo -e "  ${YELLOW}Warnings:${NC}"
  for r in "${RESULTS[@]}"; do
    if [[ "$r" == ⚠* ]]; then
      echo -e "    ${YELLOW}$r${NC}"
    fi
  done
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  CROSS-PORTAL LINK MAP (verified by code review):"
echo ""
echo "  ┌─────────────────────────────────────────────────────────┐"
echo "  │ HOMES (Public)                                          │"
echo "  │  /api/public/properties       → Property catalog        │"
echo "  │  /api/public/properties/partners → Partner listings     │"
echo "  │  /api/public/purchases/initiate  → Cash purchase        │"
echo "  │  /api/public/purchases/initiate-rto → RTO application   │"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │ CLIENTES (Client Portal)                                │"
echo "  │  /api/public/clients/lookup    → Auth lookup            │"
echo "  │  /api/public/clients/{id}/purchases → My purchases      │"
echo "  │  /api/public/clients/{id}/payments  → My payments       │"
echo "  │  /api/public/clients/{id}/payments/{pid}/report → Report│"
echo "  │  /api/public/clients/{id}/account-statement → Statement │"
echo "  │  /api/public/clients/{id}/documents → My documents      │"
echo "  │  /api/public/clients/{id}/kyc-status  → KYC status      │"
echo "  │  /api/public/clients/{id}/kyc-submit  → Submit KYC docs │"
echo "  │  /api/public/clients/{id}/rto-contract/{sid} → My RTO   │"
echo "  ├─────────────────────────────────────────────────────────┤"
echo "  │ CAPITAL (Admin)                                         │"
echo "  │  /api/capital/kyc/status/{cid}         → KYC status     │"
echo "  │  /api/capital/kyc/request-verification → Request KYC    │"
echo "  │  /api/capital/kyc/review               → Approve/Reject │"
echo "  │  /api/capital/kyc/manual-verify        → Manual verify  │"
echo "  │  /api/capital/payments                 → All payments    │"
echo "  │  /api/capital/payments/overdue         → Overdue         │"
echo "  │  /api/capital/payments/{pid}/record    → Record payment  │"
echo "  │  /api/capital/contracts                → All contracts   │"
echo "  │  /api/capital/applications             → All apps        │"
echo "  └─────────────────────────────────────────────────────────┘"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
else
  exit 0
fi

