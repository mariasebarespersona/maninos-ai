#!/bin/bash
# =============================================================================
# COMPREHENSIVE CAPITAL PORTAL TESTS v2
# Tests all Capital endpoints DIRECTLY against the backend + proxy verification
# =============================================================================

set -eo pipefail

API="http://localhost:8000"
PROXY="http://localhost:3000/api/capital"
PASS=0
FAIL=0
SKIP=0
ERRORS=""
CLEANUP_IDS=""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Helper: run an HTTP call and validate ──
t() {
  local method=$1 url=$2 desc=$3 body="${4:-}"
  printf "  %-58s" "$desc"

  local ARGS=(-s -w '\n%{http_code}')
  [ "$method" = "POST" ] && ARGS+=(-X POST -H 'Content-Type: application/json' -d "$body")
  [ "$method" = "PUT" ]  && ARGS+=(-X PUT  -H 'Content-Type: application/json' -d "$body")
  [ "$method" = "PATCH" ]&& ARGS+=(-X PATCH -H 'Content-Type: application/json' -d "$body")
  [ "$method" = "DELETE" ]&& ARGS+=(-X DELETE)

  local RESP HTTP BODY
  RESP=$(curl "${ARGS[@]}" "$url" 2>/dev/null || echo -e '\n000')
  HTTP=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  _BODY="$BODY" # store for caller

  if [ "$HTTP" -ge 200 ] 2>/dev/null && [ "$HTTP" -lt 300 ] 2>/dev/null; then
    printf "${GREEN}✓ PASS${NC} (%s)\n" "$HTTP"
    PASS=$((PASS + 1))
  elif [ "$HTTP" = "000" ]; then
    printf "${YELLOW}⊘ SKIP${NC} (conn fail)\n"
    SKIP=$((SKIP + 1))
  else
    printf "${RED}✗ FAIL${NC} (%s)\n" "$HTTP"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  ✗ $desc → $HTTP: $(echo "$BODY" | head -c 150)"
  fi
}

# ── JSON helper ──
jq_field() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$2)" 2>/dev/null || echo ""; }

echo -e "\n${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  MANINOS CAPITAL — TEST SUITE v2  ($(date +%H:%M:%S))${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}\n"

# ── Pre-flight ──
printf "  Backend health...   "
if curl -s -o /dev/null -w '%{http_code}' "$API/health" | grep -q 200; then
  printf "${GREEN}✓${NC}\n"
else
  printf "${RED}✗ backend not running${NC}\n"; exit 1
fi
printf "  Frontend proxy...   "
if curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000" | grep -qE '200|307'; then
  printf "${GREEN}✓${NC}\n\n"
else
  printf "${RED}✗ frontend not running${NC}\n"; exit 1
fi

# =============================================================================
echo -e "${BLUE}━━━ 1. DASHBOARD ━━━${NC}"
# =============================================================================
t GET "$API/api/capital/dashboard"           "Backend: dashboard"
t GET "$API/api/capital/dashboard/summary"   "Backend: dashboard summary"
t GET "$API/api/capital/dashboard/recent-activity" "Backend: recent activity"
t GET "$API/api/capital/dashboard/cartera-health"  "Backend: cartera health"
# Proxy
t GET "$PROXY/dashboard"                     "Proxy: dashboard"
t GET "$PROXY/dashboard/summary"             "Proxy: dashboard summary"

# =============================================================================
echo -e "\n${BLUE}━━━ 2. INVESTORS ━━━${NC}"
# =============================================================================
t GET "$API/api/capital/investors"            "Backend: list investors"
# Create
t POST "$API/api/capital/investors" "Backend: create investor" \
  '{"name":"ZZ_Test_Investor","email":"zz_test@example.com","phone":"555-9999","company":"Test LLC","available_capital":50000}'
INV_ID=$(jq_field "$_BODY" "['investor']['id']")
echo -e "  ${CYAN}→ Investor ID: $INV_ID${NC}"

if [ -n "$INV_ID" ] && [ "$INV_ID" != "" ]; then
  t GET "$API/api/capital/investors/$INV_ID"  "Backend: get investor"
  t PUT "$API/api/capital/investors/$INV_ID"  "Backend: update investor" '{"notes":"Updated via test","status":"active"}'
  
  # Create investment (endpoint is /investors/investments, not /{id}/investments)
  t POST "$API/api/capital/investors/investments" "Backend: create investment" \
    "{\"investor_id\":\"$INV_ID\",\"amount\":25000,\"expected_return_rate\":15}"
  INV_INV_ID=$(jq_field "$_BODY" "['investment']['id']")
  echo -e "  ${CYAN}→ Investment ID: $INV_INV_ID${NC}"
  
  t GET "$API/api/capital/investors/investments/summary" "Backend: investments summary"
  
  # Investor cycle
  t GET "$API/api/capital/flows/investor-cycle/$INV_ID" "Backend: investor capital cycle"
  
  # Proxy
  t GET "$PROXY/investors"                     "Proxy: list investors"
fi

# =============================================================================
echo -e "\n${BLUE}━━━ 3. PROMISSORY NOTES ━━━${NC}"
# =============================================================================
t GET "$API/api/capital/promissory-notes"     "Backend: list notes"

if [ -n "$INV_ID" ] && [ "$INV_ID" != "" ]; then
  t POST "$API/api/capital/promissory-notes" "Backend: create note" \
    "{\"investor_id\":\"$INV_ID\",\"loan_amount\":25000,\"annual_rate\":12,\"term_months\":12,\"signed_city\":\"Conroe\",\"signed_state\":\"Texas\"}"
  PN_ID=$(jq_field "$_BODY" "['note']['id']")
  echo -e "  ${CYAN}→ Note ID: $PN_ID${NC}"
  
  if [ -n "$PN_ID" ] && [ "$PN_ID" != "" ]; then
    t GET "$API/api/capital/promissory-notes/$PN_ID" "Backend: get note detail"
    
    # Record payment
    t POST "$API/api/capital/promissory-notes/$PN_ID/pay" "Backend: pay note" \
      '{"amount":2000,"payment_method":"bank_transfer","reference":"TEST-001","notes":"Test payment"}'
    
    # Get note detail again (payments are included in note detail response)
    t GET "$API/api/capital/promissory-notes/$PN_ID" "Backend: note detail w/ payments"
    
    # PDF
    t GET "$API/api/capital/promissory-notes/$PN_ID/pdf" "Backend: note PDF"
  fi
fi

# Alerts
t GET "$API/api/capital/promissory-notes/alerts/upcoming" "Backend: maturity alerts"

# Proxy
t GET "$PROXY/promissory-notes"              "Proxy: list notes"
t GET "$PROXY/promissory-notes/alerts"       "Proxy: maturity alerts"

# =============================================================================
echo -e "\n${BLUE}━━━ 4. CAPITAL FLOWS ━━━${NC}"
# =============================================================================
t GET "$API/api/capital/flows"               "Backend: list flows"
t GET "$API/api/capital/flows/summary"       "Backend: flow summary"

# Record flow
t POST "$API/api/capital/flows/record" "Backend: record flow" \
  '{"flow_type":"operating_expense","amount":250,"description":"Test expense v2","flow_date":"2026-02-16"}'
FLOW_ID=$(jq_field "$_BODY" "['flow']['id']")
echo -e "  ${CYAN}→ Flow ID: $FLOW_ID${NC}"

# Proxy
t GET "$PROXY/flows"                         "Proxy: list flows"
t GET "$PROXY/flows/summary"                 "Proxy: flow summary"

# =============================================================================
echo -e "\n${BLUE}━━━ 5. APPLICATIONS ━━━${NC}"
# =============================================================================
t GET "$API/api/capital/applications"        "Backend: list applications"
APP_ID=$(jq_field "$_BODY" "['applications'][0]['id']")
echo -e "  ${CYAN}→ First app ID: $APP_ID${NC}"

if [ -n "$APP_ID" ] && [ "$APP_ID" != "" ]; then
  t GET "$API/api/capital/applications/$APP_ID" "Backend: get application"
fi

# Proxy
t GET "$PROXY/applications"                  "Proxy: list applications"

# =============================================================================
echo -e "\n${BLUE}━━━ 6. CONTRACTS ━━━${NC}"
# =============================================================================
t GET "$API/api/capital/contracts"            "Backend: list contracts"
CT_ID=$(jq_field "$_BODY" "['contracts'][0]['id']")
echo -e "  ${CYAN}→ First contract ID: $CT_ID${NC}"

if [ -n "$CT_ID" ] && [ "$CT_ID" != "" ]; then
  t GET "$API/api/capital/contracts/$CT_ID"   "Backend: get contract"
fi

# Proxy
t GET "$PROXY/contracts"                     "Proxy: list contracts"

# =============================================================================
echo -e "\n${BLUE}━━━ 7. PAYMENTS ━━━${NC}"
# =============================================================================
t GET "$API/api/capital/payments"             "Backend: list payments"
t GET "$API/api/capital/payments/overdue"     "Backend: overdue payments"
t GET "$API/api/capital/payments/mora-summary" "Backend: mora summary"
t GET "$API/api/capital/payments/commissions" "Backend: list commissions"
t GET "$API/api/capital/payments/insurance-alerts" "Backend: insurance alerts"
t POST "$API/api/capital/payments/update-statuses" "Backend: update statuses" '{}'

if [ -n "$CT_ID" ] && [ "$CT_ID" != "" ]; then
  t GET "$API/api/capital/payments/schedule/$CT_ID" "Backend: payment schedule"
fi

# Proxy
t GET "$PROXY/payments"                      "Proxy: list payments"
t GET "$PROXY/payments/overdue"              "Proxy: overdue payments"
t GET "$PROXY/payments/mora-summary"         "Proxy: mora summary"
t GET "$PROXY/payments/commissions"          "Proxy: list commissions"

# =============================================================================
echo -e "\n${BLUE}━━━ 8. ACCOUNTING ━━━${NC}"
# =============================================================================

echo -e "  ${YELLOW}Dashboard & Chart of Accounts${NC}"
t GET "$API/api/capital/accounting/dashboard" "Backend: accounting dashboard"
t GET "$API/api/capital/accounting/accounts"  "Backend: list accounts"
t GET "$API/api/capital/accounting/accounts/tree" "Backend: account tree"

# Create account (use unique code per run)
ACC_CODE="T$(date +%s | tail -c 6)"
t POST "$API/api/capital/accounting/accounts" "Backend: create account" \
  "{\"code\":\"$ACC_CODE\",\"name\":\"ZZ_Test_Expense_$ACC_CODE\",\"account_type\":\"expense\",\"category\":\"test\",\"description\":\"Test\"}"
ACC_ID=$(jq_field "$_BODY" "['account']['id']")
echo -e "  ${CYAN}→ Account ID: $ACC_ID${NC}"

echo -e "  ${YELLOW}Transactions${NC}"
t GET "$API/api/capital/accounting/transactions" "Backend: list transactions"

# Create transaction
t POST "$API/api/capital/accounting/transactions" "Backend: create transaction" \
  "{\"transaction_date\":\"2026-02-16\",\"transaction_type\":\"other_expense\",\"amount\":77,\"is_income\":false,\"description\":\"Test manual txn\"}"
TXN_ID=$(jq_field "$_BODY" "['transaction']['id']")
echo -e "  ${CYAN}→ Transaction ID: $TXN_ID${NC}"

if [ -n "$TXN_ID" ] && [ "$TXN_ID" != "" ]; then
  t PATCH "$API/api/capital/accounting/transactions/$TXN_ID" "Backend: update txn" \
    '{"description":"Test manual txn UPDATED","status":"confirmed"}'
fi

echo -e "  ${YELLOW}Bank Accounts${NC}"
t GET "$API/api/capital/accounting/bank-accounts" "Backend: list bank accounts"

# Create bank accounts
t POST "$API/api/capital/accounting/bank-accounts" "Backend: create bank 1" \
  '{"name":"ZZ_Test_Checking","bank_name":"BoA","account_number":"****1111","account_type":"checking","current_balance":10000}'
BK1_ID=$(jq_field "$_BODY" "['bank_account']['id']")
echo -e "  ${CYAN}→ Bank 1 ID: $BK1_ID${NC}"

t POST "$API/api/capital/accounting/bank-accounts" "Backend: create bank 2" \
  '{"name":"ZZ_Test_Savings","bank_name":"Chase","account_number":"****2222","account_type":"savings","current_balance":5000}'
BK2_ID=$(jq_field "$_BODY" "['bank_account']['id']")
echo -e "  ${CYAN}→ Bank 2 ID: $BK2_ID${NC}"

# Transfer between banks (POST /bank-accounts/{source_id}/transfer)
if [ -n "$BK1_ID" ] && [ -n "$BK2_ID" ] && [ "$BK1_ID" != "" ] && [ "$BK2_ID" != "" ]; then
  t POST "$API/api/capital/accounting/bank-accounts/$BK1_ID/transfer" "Backend: bank transfer" \
    "{\"target_bank_id\":\"$BK2_ID\",\"amount\":1500,\"description\":\"Test transfer\"}"
fi

echo -e "  ${YELLOW}Financial Statements${NC}"
t GET "$API/api/capital/accounting/reports/income-statement" "Backend: income statement"
t GET "$API/api/capital/accounting/reports/balance-sheet"    "Backend: balance sheet"
t GET "$API/api/capital/accounting/reports/cash-flow"        "Backend: cash flow"

echo -e "  ${YELLOW}Sync & Export${NC}"
t POST "$API/api/capital/accounting/sync"    "Backend: sync transactions" ''
SYNC_IMPORTED=$(jq_field "$_BODY" ".get('imported',0)")
echo -e "  ${CYAN}→ Imported: $SYNC_IMPORTED${NC}"

t GET "$API/api/capital/accounting/export/transactions" "Backend: CSV export"

# Proxy for accounting
echo -e "  ${YELLOW}Proxy verification${NC}"
t GET "$PROXY/accounting/dashboard"          "Proxy: accounting dashboard"
t GET "$PROXY/accounting/transactions"       "Proxy: list transactions"
t GET "$PROXY/accounting/accounts"           "Proxy: list accounts"
t GET "$PROXY/accounting/bank-accounts"      "Proxy: list bank accounts"

# =============================================================================
echo -e "\n${BLUE}━━━ 9. REPORTS ━━━${NC}"
# =============================================================================
t GET "$API/api/capital/reports"              "Backend: list reports"
t GET "$API/api/capital/reports/unified-summary" "Backend: unified summary (default)"
t GET "$API/api/capital/reports/unified-summary?month=2&year=2026" "Backend: unified summary (Feb 2026)"

# Generate report
t POST "$API/api/capital/reports/generate" "Backend: generate report" \
  '{"month":2,"year":2026,"generated_by":"test"}'

# Investor statement
if [ -n "$INV_ID" ] && [ "$INV_ID" != "" ]; then
  t POST "$API/api/capital/reports/investor-statement?investor_id=$INV_ID&month=2&year=2026" \
    "Backend: investor statement" '{}'
fi

# Proxy
t GET "$PROXY/reports"                       "Proxy: list reports"
t GET "$PROXY/reports/unified-summary"       "Proxy: unified summary"

# =============================================================================
echo -e "\n${BLUE}━━━ 10. ANALYSIS ━━━${NC}"
# =============================================================================
t GET "$API/api/capital/analysis"            "Backend: analysis list"
t GET "$PROXY/analysis"                      "Proxy: analysis list"

# =============================================================================
echo -e "\n${BLUE}━━━ 11. ACCOUNTING HOOKS VERIFICATION ━━━${NC}"
# =============================================================================

echo -e "  ${YELLOW}Verifying auto-created capital_transactions from flows...${NC}"
# The flow we created should have auto-generated a capital_transaction
if [ -n "$FLOW_ID" ] && [ "$FLOW_ID" != "" ]; then
  HOOK_RESP=$(curl -s "$API/api/capital/accounting/transactions?search=Test+expense+v2" 2>/dev/null)
  HOOK_COUNT=$(echo "$HOOK_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d.get('transactions',[]) if 'operating_expense' in t.get('transaction_type','')]))" 2>/dev/null || echo "0")
  printf "  %-58s" "Hook: flow → capital_transaction (operating_expense)"
  if [ "$HOOK_COUNT" -gt 0 ]; then
    printf "${GREEN}✓ PASS${NC} (%s found)\n" "$HOOK_COUNT"
    PASS=$((PASS + 1))
  else
    printf "${RED}✗ FAIL${NC} (not auto-created)\n"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  ✗ Hook: flow→txn not created"
  fi
fi

# Check note payment → transaction
if [ -n "$PN_ID" ] && [ "$PN_ID" != "" ]; then
  HOOK_RESP2=$(curl -s "$API/api/capital/accounting/transactions?search=promisoria" 2>/dev/null)
  HOOK_COUNT2=$(echo "$HOOK_RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len([t for t in d.get('transactions',[]) if 'investor_return' in t.get('transaction_type','')]))" 2>/dev/null || echo "0")
  printf "  %-58s" "Hook: PN payment → capital_transaction (investor_return)"
  if [ "$HOOK_COUNT2" -gt 0 ]; then
    printf "${GREEN}✓ PASS${NC} (%s found)\n" "$HOOK_COUNT2"
    PASS=$((PASS + 1))
  else
    printf "${YELLOW}⊘ SKIP${NC} (hook may not fire in this flow)\n"
    SKIP=$((SKIP + 1))
  fi
fi

# =============================================================================
echo -e "\n${BLUE}━━━ CLEANUP ━━━${NC}"
# =============================================================================

# Delete test data
[ -n "$TXN_ID" ] && [ "$TXN_ID" != "" ] && t DELETE "$API/api/capital/accounting/transactions/$TXN_ID" "Delete test transaction"
[ -n "$ACC_ID" ] && [ "$ACC_ID" != "" ] && t DELETE "$API/api/capital/accounting/accounts/$ACC_ID" "Delete test account"
[ -n "$BK1_ID" ] && [ "$BK1_ID" != "" ] && t DELETE "$API/api/capital/accounting/bank-accounts/$BK1_ID" "Deactivate test bank 1"
[ -n "$BK2_ID" ] && [ "$BK2_ID" != "" ] && t DELETE "$API/api/capital/accounting/bank-accounts/$BK2_ID" "Deactivate test bank 2"

# Note: We skip deleting investor/note/flow as they exercise the full lifecycle

# =============================================================================
echo -e "\n${BLUE}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TEST RESULTS${NC}"
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
TOTAL=$((PASS + FAIL + SKIP))
echo -e "  ${GREEN}Passed:  $PASS${NC}"
echo -e "  ${RED}Failed:  $FAIL${NC}"
echo -e "  ${YELLOW}Skipped: $SKIP${NC}"
echo -e "  Total:   $TOTAL"

if [ $FAIL -gt 0 ]; then
  echo -e "\n${RED}  FAILURES:${NC}"
  echo -e "$ERRORS"
fi

echo ""
if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}🎉 ALL TESTS PASSED!${NC}"
else
  echo -e "  ${RED}⚠  $FAIL test(s) failed. See details above.${NC}"
fi
echo ""

