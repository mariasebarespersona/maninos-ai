---
description: Run comprehensive tests after any code change. Covers TypeScript, Python syntax, Jest unit tests, live API endpoint tests, and Next.js production build. Use after every feature implementation.
---

# Comprehensive Test Suite for Maninos AI

Run ALL of the following test layers. Report results in a summary table at the end.

## Layer 1: Static Analysis

### 1a. TypeScript Type Check
```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web && npx tsc --noEmit --skipLibCheck 2>&1
```
- Report total errors
- Flag any errors in files modified in the current session

### 1b. Python Syntax Check
Check all modified Python files compile:
```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai && python3 -c "
import py_compile, glob, subprocess
result = subprocess.run(['git', 'diff', '--name-only', 'HEAD~1'], capture_output=True, text=True)
py_files = [f for f in result.stdout.strip().split('\n') if f.endswith('.py')]
if not py_files:
    py_files = glob.glob('api/**/*.py', recursive=True)
errors = 0
for f in py_files:
    try:
        py_compile.compile(f, doraise=True)
    except py_compile.PyCompileError as e:
        print(f'ERROR: {e}')
        errors += 1
print(f'Checked {len(py_files)} Python files, {errors} errors')
"
```

## Layer 2: Unit Tests

### 2a. Frontend Jest Tests
```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web && npx jest --passWithNoTests --silent 2>&1 | tail -15
```
- Report pass/fail counts
- Identify if any NEW failures were introduced (vs pre-existing)

### 2b. Backend pytest (if tests exist)
```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai && python3 -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

## Layer 3: Live API Endpoint Tests

Test the deployed Railway backend:
```bash
API="https://maninos-ai-production.up.railway.app"
```

Run these endpoint tests and report status code + response shape:

1. `GET $API/health` — expect `{"status": "ok"}`
2. `GET $API/api/market-listings?qualified_only=true&limit=3` — expect listings array
3. `GET $API/api/market-listings?qualified_only=false&limit=3` — expect unqualified listings
4. `GET $API/api/market-listings/stats` — expect stats object with `qualified_in_db`
5. `GET $API/api/public/properties?limit=3` — expect published properties
6. `GET $API/api/public/properties/partners?limit=3` — expect partner listings

For each: report status code, whether response has expected shape, and any errors.

## Layer 4: Production Build Check

```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai/web && npx next build 2>&1 | tail -5
```
- Report if build succeeded or failed
- If failed, show the specific error

## Layer 5: Git Status Verification

```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai && git status -s && git log --oneline -3
```
- Verify all changes are committed
- Show latest commits

## Summary Report

After ALL layers complete, output a summary table:

```
| Test Layer              | Result | Details                    |
|-------------------------|--------|----------------------------|
| TypeScript              | PASS/FAIL | X errors                |
| Python syntax           | PASS/FAIL | X files checked         |
| Jest unit tests         | PASS/FAIL | X/Y passed              |
| pytest backend          | PASS/FAIL | X/Y passed              |
| API: health             | PASS/FAIL | status code             |
| API: market-listings    | PASS/FAIL | X listings returned     |
| API: stats              | PASS/FAIL | qualified count         |
| API: public properties  | PASS/FAIL | X properties            |
| API: partners           | PASS/FAIL | X partner listings      |
| Next.js build           | PASS/FAIL |                         |
| Git status              | CLEAN/DIRTY |                       |
```

If ANY test fails, clearly explain what broke and suggest a fix.
