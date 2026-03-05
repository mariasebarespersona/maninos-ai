# Migraciones Maninos AI

## Cómo ejecutar

### IMPORTANTE: Las migraciones se ejecutan manualmente

1. Ve a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard)
2. Navega a **SQL Editor**
3. Copia y pega el contenido del archivo `.sql` correspondiente
4. Ejecuta el SQL

> ⚠️ **Nunca ejecutes migraciones programáticamente.** Siempre usa el Supabase SQL Editor.

### Para nuevas migraciones

1. Crea un nuevo archivo con el siguiente número secuencial: `048_descripcion.sql`
2. Escribe el SQL (usa `IF NOT EXISTS` / `IF EXISTS` para idempotencia)
3. Recuerda a Maria ejecutar la migración en Supabase SQL Editor

---

## Orden de Migraciones (001-047)

| Archivo | Descripción |
|---------|-------------|
| `001_initial_schema.sql` | Schema inicial (users, properties, clients, sales, renovations, documents, audit_logs) |
| `002_renovation_materials.sql` | Materiales de renovación |
| `003_title_transfers.sql` | Transferencias de título |
| `004_document_uploads.sql` | Uploads de documentos |
| `005_fix_full_name_to_name.sql` | Fix nombre de campo |
| `006_market_listings.sql` | Tabla market_listings para scraping |
| `007_market_analysis.sql` | Análisis de mercado |
| `008_fix_qualification_trigger.sql` | Fix trigger de calificación |
| `008_scheduled_emails.sql` | Emails programados |
| `009_market_listings_checklist.sql` | Checklist en market listings |
| `010_add_facebook_source.sql` | Facebook como fuente de listings |
| `010_add_notes_to_properties.sql` | Notas en propiedades |
| `011_rto_support.sql` | Soporte RTO (contratos, pagos) |
| `012_maninos_capital.sql` | Tablas Maninos Capital |
| `013_capital_features.sql` | Features Capital (DTI, análisis) |
| `014_property_reserved_status.sql` | Status "reserved" en propiedades |
| `015_sales_commission_fields.sql` | Campos de comisión en ventas |
| `016_purchase_docs_lock.sql` | Lock de documentos de compra |
| `017_team_roles_yards.sql` | Roles de equipo y yards |
| `018_fix_qualification_feb2026.sql` | Fix calificación Feb 2026 |
| `019_add_craigslist_source.sql` | Craigslist como fuente |
| `020_add_dismissed_status.sql` | Status "dismissed" en listings |
| `021_client_created_by.sql` | Campo created_by en clientes |
| `022_add_vmf_homes_source.sql` | VMF Homes (Vanderbilt) como fuente |
| `023_add_21st_mortgage_source.sql` | 21st Mortgage como fuente |
| `024_fix_21st_mortgage_urls.sql` | Fix URLs de 21st Mortgage |
| `025_evaluation_reports.sql` | Reportes de evaluación |
| `026_accounting.sql` | Contabilidad (cuentas, transacciones) |
| `027_accounting_v2.sql` | Contabilidad v2 |
| `028_quickbooks_accounts.sql` | Cuentas tipo QuickBooks |
| `029_bank_statements.sql` | Estados de cuenta bancarios |
| `030_evaluation_photos.sql` | Fotos de evaluaciones |
| `031_moves.sql` | Movimientos/traslados de propiedades |
| `032_system_config.sql` | Configuración del sistema |
| `033_bank_statements_dynamic_accounts.sql` | Cuentas dinámicas bancarias |
| `034_promissory_notes.sql` | Pagarés (promissory notes) |
| `035_investor_improvements.sql` | Mejoras de inversionistas |
| `036_commissions_and_insurance.sql` | Comisiones y seguros |
| `037_capital_accounting.sql` | Contabilidad Capital |
| `038_kyc_request_flow.sql` | Flujo KYC |
| `039_market_listings_price_type.sql` | Tipo de precio en listings |
| `040_client_reported_payment.sql` | Pagos reportados por clientes |
| `041_manual_kyc.sql` | KYC manual |
| `042_capital_statements_and_bank_imports.sql` | Estados financieros Capital |
| `042b_fix_report_section.sql` | Fix sección de reportes |
| `043_saved_financial_statements.sql` | Estados financieros guardados |
| `044_capital_budgets.sql` | Presupuestos Capital |
| `045_capital_income_accounts_placeholder.sql` | Placeholder cuentas de ingreso |
| `046_property_code_and_dimensions.sql` | Código de propiedad y dimensiones |
| `047_property_document_data.sql` | Datos de documentos en propiedades (JSONB) |

---

## Storage Buckets (Supabase)

| Bucket | Público | Uso |
|--------|---------|-----|
| `property-photos` | ✅ Sí | Fotos de propiedades |
| `documents` | ❌ No | Documentos privados |
| `evaluation-photos` | ✅ Sí | Fotos de evaluaciones |
| `listing-images` | ✅ Sí | Imágenes de listings del mercado |

---

## Variables de Entorno Requeridas

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Para el frontend (web/.env.local):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```
