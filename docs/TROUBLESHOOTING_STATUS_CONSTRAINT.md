# Troubleshooting: Status Constraint Error

## ❌ **Problem:**

When completing Paso 1 (70% Rule Check), the system fails with:

```
ERROR: new row violates check constraint "properties_status_check"
'status': 'Review Required'
```

**Impact:**
- `acquisition_stage` does NOT update from `'initial'` to `'passed_70_rule'`
- Stepper in UI remains stuck on "Paso 1"
- Checklist appears but stage is not advanced
- Data is NOT saved in database

---

## 🔍 **Root Cause:**

The `properties_status_check` constraint was missing `'Review Required'` as an allowed value.

**Current constraint:**
```sql
CHECK (status IN (
    'New',
    'Pending Documents',
    'Proceed to Inspection',  -- ✅ Has this
    'Ready to Buy',
    'Rejected',
    'Under Contract'
))
```

**Missing:** `'Review Required'` (used when 70% Rule fails)

---

## ✅ **Solution:**

### **Step 1: Execute SQL Migration**

Run this migration in Supabase SQL Editor:

```sql
-- File: migrations/2025-12-15_add_review_required_status.sql

-- Drop existing constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;

-- Add updated constraint with 'Review Required'
ALTER TABLE properties ADD CONSTRAINT properties_status_check 
CHECK (status IN (
    'New',
    'Pending Documents',
    'Review Required',           -- ⬅️ ADDED
    'Proceed to Inspection',
    'Ready to Buy',
    'Rejected',
    'Under Contract'
));
```

### **Step 2: Restart Backend**

```bash
# Ctrl + C to stop backend
uvicorn app:app --host 0.0.0.0 --port 8080
```

### **Step 3: Test Again**

1. Create new property or reset existing one
2. Upload 3 documents → "ya subí todo"
3. Provide prices → "Precio $85,000 y market value $120,000"
4. **Expected:**
   - ✅ "PASO 1 COMPLETADO" message
   - ✅ `acquisition_stage` updates to `'passed_70_rule'`
   - ✅ Stepper advances to "Paso 2"
   - ✅ Checklist appears

---

## 📊 **Status Values Reference:**

| Status | When Used | acquisition_stage |
|--------|-----------|-------------------|
| `New` | Property just created | `documents_pending` |
| `Pending Documents` | Waiting for 3 docs | `documents_pending` |
| `Review Required` | 70% Rule FAILED | `initial` |
| `Proceed to Inspection` | 70% Rule PASSED | `passed_70_rule` |
| `Ready to Buy` | 80% ARV Rule PASSED | `passed_80_rule` |
| `Rejected` | Property rejected | `rejected` |
| `Under Contract` | Contract generated | contract phase |

---

## 🐛 **Related Files:**

- `migrations/2025-12-15_add_review_required_status.sql` - Fix migration
- `migrations/2025-12-11_add_documents_pending_stage.sql` - Original (missing value)
- `tools/numbers_tools.py` - Sets `status='Review Required'`

---

## 🔧 **How to Check if Fixed:**

```sql
-- In Supabase SQL Editor:
SELECT 
    conname, 
    pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'properties_status_check';
```

**Expected output should include:**
```
CHECK (status IN (..., 'Review Required', ...))
```

