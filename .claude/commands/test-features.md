---
description: Run comprehensive tests after any code change. Covers static analysis, unit tests, API tests, AND full browser-based UI E2E testing with Playwright. Simulates what Sebastian would test manually — every button click, every filter, every visual check. Use after every feature implementation.
---

# Comprehensive Test Suite for Maninos AI

Run ALL layers sequentially. If any layer fails, fix the issue before proceeding. Report results in a summary table at the end.

**IMPORTANT**: This skill replaces manual testing by Sebastian. You MUST be thorough — check every button, every filter, every visual element. If something looks wrong, fix it before reporting success.

---

## Layer 1: Static Analysis

### 1a. TypeScript Type Check
```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web && npx tsc --noEmit --skipLibCheck 2>&1
```
- Report total errors. Flag errors in modified files.

### 1b. Python Syntax Check
```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai && python3 -c "
import py_compile, glob, subprocess
result = subprocess.run(['git', 'diff', '--name-only', 'HEAD~1'], capture_output=True, text=True)
py_files = [f for f in result.stdout.strip().split('\n') if f.endswith('.py')]
if not py_files: py_files = glob.glob('api/**/*.py', recursive=True)
errors = 0
for f in py_files:
    try: py_compile.compile(f, doraise=True)
    except py_compile.PyCompileError as e: print(f'ERROR: {e}'); errors += 1
print(f'Checked {len(py_files)} Python files, {errors} errors')
"
```

---

## Layer 2: Unit Tests

### 2a. Frontend Jest
```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web && npx jest --passWithNoTests --silent 2>&1 | tail -15
```

### 2b. Backend pytest
```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai && python3 -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

---

## Layer 3: Live API Endpoint Tests

```bash
API="https://maninos-ai-production.up.railway.app"
```

Test these endpoints with curl and verify response shape:
1. `GET $API/health` — expect `{"status": "ok"}`
2. `GET $API/api/market-listings?qualified_only=true&limit=5` — all `is_qualified=true`
3. `GET $API/api/market-listings?bedrooms=3&limit=5` — all `bedrooms=3`
4. `GET $API/api/market-listings?source=facebook&limit=5` — all `source=facebook`
5. `GET $API/api/market-listings?min_price=10000&max_price=30000&limit=5` — all prices in range
6. `GET $API/api/market-listings?min_year=2000&max_year=2015&limit=5` — all years in range
7. `GET $API/api/market-listings/stats` — expect `qualified_in_db`, `by_source`
8. `GET $API/api/public/properties/partners?limit=5` — partner listings exist

---

## Layer 4: Browser E2E Tests (Playwright)

**THIS IS THE MOST IMPORTANT LAYER.** Use Playwright to open a real browser, log in, and test the UI exactly as Sebastian would.

### Authentication
Use the Supabase REST API to authenticate, then inject the session into the browser:
- Email: `e2e-test@maninos.com`
- Password: `E2eTest2026!Maninos`
- Supabase URL: `https://tpsszoxyqdutqlwfgrvm.supabase.co`
- Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwc3N6b3h5cWR1dHFsd2ZncnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTEwODcsImV4cCI6MjA4NTA4NzA4N30.NNaIewOfNdTP1qrciMaWq_ZPYv6Li4q0_g27nBD-2Dw`

If localStorage injection doesn't work, fall back to browser login (fill email/password, click submit, wait for redirect).

After login, dismiss any Joyride tour overlay (`Escape` key or click skip).

### 4a. Page Load & Layout Checks
Navigate to `/homes/market` and verify:
- [ ] Page title "Casas del Mercado" is visible
- [ ] Market analysis panel shows 3 columns: Valor Mercado, Máx Oferta, Calificadas
- [ ] Badge shows "X calificadas de Y analizadas" (NOT "X / 10")
- [ ] "Rango Precio" does NOT appear in the summary panel
- [ ] "Buscar Casas" button shows correct number of fuentes (5 if FB connected, 4 if not)
- [ ] Listings load (cards appear with images, prices, addresses)
- [ ] Facebook listings appear at the top (before other sources)
- [ ] Source labels (Facebook, 21st Mortgage, VMF Homes, etc.) display correctly on badges

Take screenshot: `page-loaded.png`

### 4b. Design & Visual Checks
For each visible listing card, verify:
- [ ] Price text is fully visible, not truncated
- [ ] Address text wraps properly (not overflowing card)
- [ ] Source badge doesn't overlap with score badge
- [ ] "Calificada" badge is green and fully readable
- [ ] All buttons ("Ver Original", "Revisar Casa", "Negociar", trash) are visible and not overlapping
- [ ] If "En Negociación" badge exists, text fits in the badge (not cut off)
- [ ] Pencil edit icons are visible next to specs (hab, baño, sqft, year)
- [ ] Card images display or fallback placeholder shows
- [ ] No horizontal scroll on any card

For the filter bar:
- [ ] "Filtros" button is visible and clickable
- [ ] When expanded, all filter inputs are visible and labels are readable
- [ ] Limpiar filtros link is visible
- [ ] "No calificadas" toggle does NOT exist

Take screenshot: `design-check.png`

### 4c. Filter Interaction Tests
Test each filter by setting it, waiting for debounce (2s), and verifying results:

**Bedrooms filter:**
- Set Habitaciones dropdown to "3"
- Wait 2s
- Verify "activos" badge appears
- Verify all visible listings show "3 hab"
- Clear filters

**Price range filter:**
- Set Precio mín to "10000"
- Set Precio máx to "30000"
- Wait 2s
- Verify all visible listing prices are between $10K-$30K
- Take screenshot: `filter-price.png`
- Clear filters

**Year filter:**
- Set Año mín to "2005"
- Set Año máx to "2015"
- Wait 2s
- Verify visible listings show years in range
- Clear filters

**Source filter:**
- Set Fuente dropdown to "Facebook"
- Wait 2s
- Verify all visible listings show Facebook badge
- Clear filters

**Limpiar filtros:**
- Set any filter
- Click "Limpiar filtros"
- Verify "activos" badge disappears
- Verify all listings reload

### 4d. Negociar Button Test
- Find a listing card with "Negociar" button
- Click it
- Verify button changes to "Negociando" (yellow)
- Verify "En Negociación" badge appears on the card image
- Verify the card moves to the top of the list
- Click "Negociando" to revert
- Verify it goes back to "Negociar"

Take screenshot: `negociar-test.png`

### 4e. "Buscar Casas" Search Test
**CRITICAL TEST — this is the core feature.**
- Click "Buscar Casas (5 fuentes)" button
- Wait for search to complete (button shows spinning + "Buscando...")
- When done, verify:
  - [ ] Toast message shows results with source breakdown
  - [ ] Facebook listings appear FIRST in the grid (before VMF/21st)
  - [ ] Facebook count > 25 (the whole point of the improvement)
  - [ ] Multiple sources appear (not just 1-2)
  - [ ] MHVillage and/or MobileHome.net listings appear if available
  - [ ] All listings are "Calificada" (green badge)
  - [ ] No "No califica" badges anywhere

Take screenshot: `search-results.png`

### 4f. Listing Card Actions
- Click "Ver Original" on a listing → verify new tab opens with source URL
- Click pencil icon on a spec (e.g., bedrooms) → verify inline input appears
- Type a value and press Enter → verify it saves (toast "Campo guardado")

### 4g. Cross-Page Verification
- Navigate to Portal Clientes (`/clientes/casas`) — verify no unqualified listings
- Navigate back to `/homes/market` — verify listings preserved

---

## Layer 5: Fix Issues Found

If ANY visual or functional issue is found during Layer 4:
1. Take a screenshot documenting the issue
2. Fix the code
3. Re-run the specific test to verify the fix
4. DO NOT proceed until the issue is resolved

---

## Layer 6: Commit & Deploy

If all tests pass:
```bash
git add -A && git commit -m "description" && git push origin main
```
Verify Railway + Vercel deploy:
```bash
curl -s "https://maninos-ai-production.up.railway.app/health"
curl -s -o /dev/null -w "%{http_code}" "https://maninos-ai.vercel.app"
```

---

## Summary Report

Output a comprehensive table:

```
| Test                          | Result | Details                          |
|-------------------------------|--------|----------------------------------|
| TypeScript                    | ✅/❌  | X errors                         |
| Python syntax                 | ✅/❌  | X files checked                  |
| Jest tests                    | ✅/❌  | X/Y passed                       |
| API: health                   | ✅/❌  |                                  |
| API: filters (bed/price/year) | ✅/❌  |                                  |
| API: stats                    | ✅/❌  |                                  |
| UI: Page loads                | ✅/❌  |                                  |
| UI: Badge text correct        | ✅/❌  | "X calificadas de Y analizadas"  |
| UI: No "Rango Precio"         | ✅/❌  |                                  |
| UI: No "No calificadas"       | ✅/❌  |                                  |
| UI: Filters work              | ✅/❌  | bed/price/year/source tested     |
| UI: Negociar toggle           | ✅/❌  |                                  |
| UI: Buscar Casas results      | ✅/❌  | FB first, >25, all qualified     |
| UI: Design/visual             | ✅/❌  | No overflow, truncation, overlap |
| UI: Card actions              | ✅/❌  | Edit, negociar, dismiss          |
| Deploy                        | ✅/❌  | Railway + Vercel                 |
```

**If ANY test fails, fix it and re-test. Do NOT report success with known failures.**
