# 🗄️ Database Migrations for MANINOS AI

This folder contains SQL migrations for the MANINOS AI database schema.

---

## 📋 **How to Run Migrations**

### **Option 1: Using `psql` (PostgreSQL CLI)**

```bash
# Connect to your Supabase database
psql "postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Run a specific migration
\i migrations/2025-12-16_fix_storage_path_column.sql
```

### **Option 2: Using Supabase Dashboard**

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy/paste the contents of the migration file
5. Click **Run**

### **Option 3: Using Python Script (Automated)**

```python
import os
from tools.supabase_client import sb

# Read migration file
with open("migrations/2025-12-16_fix_storage_path_column.sql", "r") as f:
    migration_sql = f.read()

# Execute migration
result = sb.rpc("exec_sql", {"sql": migration_sql}).execute()
print("Migration applied successfully!")
```

---

## 📁 **Available Migrations**

| File | Date | Description | Status |
|------|------|-------------|--------|
| `2025-01-02_property_inspections.sql` | 2025-01-02 | Property inspections table | ✅ Applied |
| `2025-01-05_fix_status_constraint.sql` | 2025-01-05 | Add 'Proceed to Inspection' status | ✅ Applied |
| `2025-01-11_contracts_table.sql` | 2025-01-11 | Contracts table | ✅ Applied |
| `2025-12-11_add_documents_pending_stage.sql` | 2025-12-11 | Add 'documents_pending' stage | ✅ Applied |
| `2025-12-11_maninos_documents_table.sql` | 2025-12-11 | Maninos documents table | ✅ Applied |
| `2025-12-15_add_contract_generated_stage.sql` | 2025-12-15 | Add 'contract_generated' stage | ✅ Applied |
| `2025-12-15_add_review_required_stage.sql` | 2025-12-15 | Add blocking stages for 70%/80% rule | ✅ Applied |
| `2025-12-15_add_review_required_status.sql` | 2025-12-15 | Add 'Review Required' status | ✅ Applied |
| `2025-12-16_fix_storage_path_column.sql` | 2025-12-16 | Fix storage_path column for documents | 🆕 **NEEDS APPLY** |

---

## ⚠️ **IMPORTANT: Run This Migration ASAP**

### **Migration: `2025-12-16_fix_storage_path_column.sql`**

**Why you need to run this:**
- Fixes document download/preview functionality
- Documents uploaded before commit `0f5b16d` have `storage_key` instead of `storage_path`
- Without this migration, old documents **will not be downloadable**

**What it does:**
1. Adds `storage_path` column if missing
2. Copies data from `storage_key` to `storage_path`
3. (Optional) Drops old `storage_key` column

**How to run:**

```bash
# Using psql
psql "postgresql://[YOUR-CONNECTION-STRING]" -f migrations/2025-12-16_fix_storage_path_column.sql

# OR using Supabase SQL Editor
# Copy/paste the file contents and click "Run"
```

**Verification:**

After running the migration, verify all documents have `storage_path`:

```sql
SELECT id, document_name, document_type, storage_path 
FROM maninos_documents 
WHERE storage_path IS NULL;
```

If the query returns 0 rows, ✅ **migration successful!**

---

## 🔧 **Troubleshooting**

### Error: "relation 'maninos_documents' does not exist"

Run the table creation migration first:

```bash
psql "postgresql://[YOUR-CONNECTION-STRING]" -f migrations/2025-12-11_maninos_documents_table.sql
```

### Error: "column 'storage_key' does not exist"

This means the migration was already applied (indirectly). Your documents already use `storage_path`. ✅ No action needed.

### Error: "duplicate column name"

This means `storage_path` already exists. The migration is safe to re-run (it's idempotent).

---

## 📚 **Migration Best Practices**

1. **Always backup your database before running migrations**
2. **Test migrations on a staging database first**
3. **Run migrations in order (by date)**
4. **Verify migrations using the verification queries**
5. **Never edit existing migration files** (create new ones instead)

---

## 🚀 **Quick Fix Script**

If you need to apply ALL pending migrations at once:

```bash
#!/bin/bash
# apply_all_migrations.sh

MIGRATIONS=(
  "migrations/2025-12-16_fix_storage_path_column.sql"
  # Add more migrations here as needed
)

for migration in "${MIGRATIONS[@]}"; do
  echo "Applying $migration..."
  psql "postgresql://[YOUR-CONNECTION-STRING]" -f "$migration"
  echo "✅ $migration applied"
done

echo "🎉 All migrations applied successfully!"
```

---

## 📞 **Need Help?**

If you encounter issues with migrations:
1. Check the Supabase logs for errors
2. Verify your database connection string
3. Ensure you have the correct permissions
4. Review the migration file for syntax errors

---

**Last Updated:** December 16, 2025  
**Version:** 1.0.1

