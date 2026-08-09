---
name: Maninos Architecture (deep)
description: Comprehensive map of Homes/Capital/Clientes portals + FastAPI backend + AI agents + Supabase schema. Updated 2026-04-27.
type: project
originSessionId: f961d8b1-cc89-4a9d-977b-b2ecc108ecdc
---
# Maninos AI — Deep Architecture Reference

> **Verify before quoting**: file:line refs may drift. Treat as starting points.

## Top-level

- **Two LLCs**: Maninos Homes (operations) + Maninos Capital (RTO/investors).
- **Three portals**: `/homes` (staff), `/capital` (RTO/investors, restricted staff), `/clientes` (public + authenticated customers).
- **Stack**: FastAPI (Python 3.12) + Next.js 14 App Router + Supabase (Postgres + Auth + Storage). Railway backend, Vercel frontend.
- **Auth realms**: Supabase Auth — clients vs staff distinguished by which DB table they belong to (auth.users is shared).

---

## Backend (FastAPI)

### Entry & startup
- `main.py` → uvicorn → `api/main.py` (`app`). Lifespan: `init_scheduler()` on startup, `shutdown_scheduler()` on exit.
- Config: `core/config.py` (Pydantic Settings, `@lru_cache` singleton). Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`. Optional: `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `LOGFIRE_TOKEN`, `APIFY_API_TOKEN`.
- Logging: `core/logging.py` — structlog (JSON in prod).
- CORS: localhost + LAN ranges + `*.vercel.app` regex; reads `APP_URL` and `CORS_EXTRA_ORIGINS`.

### Supabase access
- Single global client `sb` in `tools/supabase_client.py` using **service role key** (full access, bypasses RLS).
- Routes import `from tools.supabase_client import sb` directly (no DI).
- Storage buckets: `property-docs` (default), `kyc-documents` (10MB image limit, public read), `transaction-documents`.

### Routes (api/routes/)
- **Homes**: properties, clients, sales, transfers, accounting, market_listings, ai_assistant, team, emails, documents, materials, renovation, evaluations, portal_links, moves, esign, payment_orders, facebook, notifications, purchase_payments (payees).
- **Capital** (`api/routes/capital/`, base `/api/capital`): dashboard, applications, contracts, payments, investors, promissory_notes, reports, capital_flows, analysis, kyc, accounting (the largest file ~132K). Has `_accounting_hooks.py` for auto-GL on payment events.
- **Public** (`api/routes/public/`): unauthenticated client/property/purchase/credit-application endpoints. Lookup by email (`/api/public/clients/lookup?email=`).

### Services
- `email_service.py` — Resend-based. Templates + scheduled email batch processor + RTO reminders + investor monthly statements + promissory maturity alerts.
- `pdf_service.py` — Bill of Sale, RTO contracts, invoices.
- `scheduler_service.py` — APScheduler (AsyncIOScheduler), **timezone US/Central**. 10 jobs:
  1. `process_scheduled_emails()` — every 30 min
  2. `rto_reminders()` — daily 8:00 CT
  3. `rto_overdue_alerts()` — daily 9:00 CT
  4. `portal_sync()` — every 2 hours
  5. `refresh_partner_listings()` — every 6 hours (VMF + 21st Mortgage JSON)
  6. `title_monitor()` — daily 10:00 CT
  7. `investor_followup_emails()` — 1st of month, 10:30 CT
  8. `promissory_maturity_alerts()` — daily 9:30 CT
  9. `facebook_auto_scrape()` — Mon+Thu 7:00 CT (Apify, ~$2-3/run)
  10. `expire_old_listings()` — daily 6:00 CT
- All jobs wrap in `_track_run()` context manager → writes to `scheduler_runs` table.
- `title_monitor.py` — TDHCA name-matching. Key fn `populate_tdhca_fields_from_document_data()` reads `title_app_{type}` first, falls back to `bos_{type}.hud_label_number`. Manual uploads excluded via `title_name_updated=TRUE`.
- `notification_service.py`, `document_service.py`, `esign_service.py`, `property_service.py`.
- `scrapers/` — `partner_scrapers.py` (VMF, 21st Mortgage — JSON APIs), `facebook_scraper.py` (Apify), Playwright for browser automation.

### External integrations
- **OpenAI**: GPT-5 in agents, GPT-5-mini in AIChatWidget (`ai_assistant.py`). All async. Whisper (`whisper-1`) for voice transcription, forced `language="es"`.
- **Resend**: transactional email + attachments (base64 PDFs).
- **Stripe**: env vars present (test mode) but NOT wired in Capital code — only appears as a payment-method dropdown option. No actual API calls or Connect.
- **Playwright**: browser automation for scraping.
- **Apify**: Facebook Marketplace scraper (optional, scheduled).
- **Logfire**: optional observability.
- **No LangChain agents on backend** — direct OpenAI calls. LangChain `ChatOpenAI` is used inside the 5 specialized agents but no LangGraph orchestration.

### Schemas (`api/models/schemas.py`)
- Enums: `PropertyStatus` (PENDING_PAYMENT, PURCHASED, PUBLISHED, RESERVED, RENOVATING, SOLD), `ClientStatus`, `SaleStatus`, `SaleType` (CONTADO/RTO), `RenovationStatus`.

---

## AI Agents (`api/agents/`)

**6 specialized agents** (not 5) + `base.py` + `router.py`. All stateless, all `gpt-5`, async-only via `ainvoke()`. Output: JSON parsed manually, validated with Pydantic.

| Agent | Purpose | Key trait |
|-------|---------|-----------|
| **BuscadorAgent** | Scrape MHVillage, MobileHome.net, MHBay, Zillow, FB Marketplace; filter by Maninos rules; auto-replenish dashboard | Playwright + browser-use pattern; rules: 60%, $5K-$80K, 200mi Houston/Dallas |
| **CostosAgent** | Renovation cost estimate | Fetches materials prices from DB |
| **PrecioAgent** | Sale price strategy | **80% market-value ceiling** hard rule |
| **FotosAgent** | Vision: classify before/after photos | Real vision (image → LLM), not keywords |
| **VozAgent** | Whisper transcription + intent extraction | Spanish-forced; supports Spanglish |
| **RenovacionAgent** | Master orchestrator for renovation flow | **Hardcoded material prices in prompt** (different from CostosAgent which queries DB) |

**RenovacionAgent special rules**:
- **NO SQFT = NO PLANNING** — refuses to suggest materials without sqft. Extracts via regex from query, updates DB if found.
- Returns `action: "save_materials"` when user confirms ("vale") → frontend persists.
- Returns `action: "conversation_end"` on rejection.
- Calculation formulas embedded: paint `ceil(sqft * 3.5 / 350 * 2) + 1 gal`, baseboards `sqrt(sqft) * 4 * 1.1 m`, outlets `ceil(sqft / 60)`.

**AIChatWidget** (frontend chat) does NOT use the 6 agents. It hits `/api/ai/chat` (`ai_assistant.py`) which uses `gpt-5-mini` with **tool calling** over **19 DB query tools** (query_properties, query_sales, query_clients, query_rto_contracts, query_rto_payments, query_renovations, query_commissions, query_accounting, etc.).

---

## Frontend — Homes portal (`web/src/app/homes/`)

Internal staff portal. Layout has role-based nav (`treasury`, `operations`, `yard_manager`, `admin`) + email overrides + persistent left sidebar (272px) + AIChatWidget + TourProvider.

**Key sections**:
- `/homes` — dashboard (KPIs, 6-month chart, TexasMap, move stats).
- `/homes/properties` — list (filters skip `pending_payment`); sub: `[id]/edit|photos|checklist|renovate|new`. Photos: `PUT /api/properties/{id}/photos`.
- `/homes/transfers` — Títulos page. SchedulerRunsWidget + ManualTitleUploadModal. Serial/Label is a clickable link to `https://mhweb.tdhca.state.tx.us/mhweb/title_view.jsp` for both auto and manual.
- `/homes/sales` — list, `[new]` wizard, payment tracking with progress bars (down-payment / partial / full / adjustment), commission breakdown (found_by vs sold_by), Bill-of-Sale PDF download.
- `/homes/clients` — internal CRM, **only contado** (`?sale_type=contado`).
- `/homes/accounting` — tabs: overview, transactions, invoices, statements, chart, properties, banks, budget, recurring, audit, estado_cuenta. Period selector month/quarter/year/all + yard filter.
- `/homes/commissions` — per-employee, role-gated (treasury+admin = all, others = own).
- `/homes/market` — `MarketDashboard` component.
- `/homes/notificaciones`, `/homes/resumen-financiero`.

**Layout notifications**: pending count from `/api/sales/pending-transfers`, `/api/payment-orders?status=pending`, `/api/renovation/pending-approvals`.

---

## Frontend — Capital portal (`web/src/app/capital/`)

**Auth gate** (CRITICAL, non-obvious): `layout.tsx:75-81` uses email-pattern allow-list:
```
CAPITAL_ALLOWED_PATTERNS = ['lupita', 'sebastian', 'mariasebares', 'cazabrothers', 'e2e-test', 'sgonzalez']
```
Substring match against email; redirects to `/capital/login` if no match. **Distinct from Homes auth**.

**Pages**:
- `/capital` — dashboard summary, cartera health, recent activity, KPIs.
- `/capital/applications` — RTO submissions (pending/under_review/approved/rejected/needs_info), sub `[id]` for review/approval.
- `/capital/kyc` — manual document review (no Stripe Identity, no 3rd-party KYC). Statuses: unverified|requested|verified|failed.
- `/capital/contracts` — RTO contracts, sub `[id]` for amortization, down-payment tracking, PDF.
- `/capital/payments` — record payments (methods: stripe/zelle/transfer/cash/check; "stripe" is a label only), mora-summary, commissions, client-reported payments confirmations.
- `/capital/investors` — capital deployment, ROI, investments summary.
- `/capital/promissory-notes` — investor loans + maturity alerts (90/60/30 days).
- `/capital/accounting` — full GL: chart of accounts, journal entries, bank statements + reconcile, reports (income statement, balance sheet, cash flow), budgets.
- `/capital/reports` — investor statements PDF, unified summaries.
- `/capital/analysis`, `/capital/flows`, `/capital/kpis`, `/capital/mora`.

State: pure React hooks (no Zustand/Redux).

---

## Frontend — Clientes portal (`web/src/app/clientes/`)

Public catalog + authenticated customer dashboard.

**Public**:
- `/clientes` — landing.
- `/clientes/casas` — catalog, **auto-refresh every 2 min**, filters (city/price). Endpoints: `/api/public/properties`, `/api/public/properties/cities/list`, `/api/public/properties/partners`.
- `/clientes/casas/[id]` — detail + RTO simulator (down 30-100%, term 12-60 mo). Stores `maninos_rto_sim` in sessionStorage.

**Purchase flow**:
1. `/clientes/comprar/[propertyId]` — capture contact + register/login. Pre-fills if Supabase session present. Endpoints: `POST /api/public/purchases/initiate`, `GET /api/public/clients/lookup?email=`. Stores `maninos_client_data` in sessionStorage.
2. `/clientes/comprar/[propertyId]/metodo` — choose Contado vs RTO.
   - Contado → bank transfer details → `POST /api/public/purchases/report-transfer`.
   - RTO → `POST /api/public/purchases/initiate-rto` → credit-application flow.
3. `/clientes/comprar/[propertyId]/rto-solicitud` — credit application (employment, housing history, assets, debts, references).
4. `/clientes/comprar/[propertyId]/confirmacion` — success + confetti, clears session storage.

**Login** (`/clientes/login`):
- Modes: login | register | forgot. **Registration gated**: email must already exist in `clients` table (must have submitted purchase intent first).
- Rate limit: 5 fails → 60s lockout.
- Post-login uses full-page nav (`window.location.href`) to ensure Supabase cookies are read.
- `useClientAuth()` hook: gets Supabase user → looks up `clients` row by email → exposes domain data.

**Dashboard `/clientes/mi-cuenta`** (auth required):
- Tabs: Purchases, Payments. Shows KYC status, payment alerts (overdue/upcoming/remaining balance), RTO contract signing CTA.
- Sub-routes:
  - `/verificacion` — KYC upload (drivers_license/passport/state_id, JPG/PNG/WebP/HEIC, 10MB max). Direct upload to `kyc-documents` Supabase bucket via anon key. Statuses: unverified|requested|verified|failed.
  - `/firmar-contrato/[contractId]` — e-sign RTO contract.
  - `/solicitud-credito/[applicationId]` — extended credit application.
  - `/estado-de-cuenta` — payment history.
  - `/rto/[saleId]` — RTO detail.
  - `/documentos` — signed contract PDFs.
- `/clientes/crear-contrasena` — post-recovery password set.

**Payment processing on Clientes**: NO Stripe. All payments are manual bank-transfer reports + offline RTO collections.

---

## Database (Supabase Postgres)

87 migrations (001-087, 082 skipped), 58 tables. RLS: "authenticated full access" + "service role bypass" baseline on every table.

### Domain groups
- **Properties/Sales**: properties, sales, sale_payments, title_transfers
- **Clients/Credit**: clients, client_notes, credit_applications
- **RTO/Capital**: rto_contracts, rto_payments, rto_applications, rto_commissions, investors, investments, promissory_notes, promissory_note_payments, capital_accounts, capital_transactions, capital_down_payment_installments, capital_flows, capital_budgets
- **Accounting (Homes)**: accounting_accounts, accounting_transactions, bank_accounts, recurring_expenses, accounting_budgets, accounting_audit_log
- **Renovations**: renovations (materials JSONB), materials catalog, moves
- **Commissions/Payments**: commission_payments (sale × employee × role), payment_orders, receipts, payees
- **Documents**: documents (polymorphic entity_type/entity_id), document_signatures, signature_envelopes (e-sign with token, 7-day expiration)
- **Market/Ops**: market_listings, market_analysis, evaluation_reports, acquisition_analyses, notifications, scheduler_runs
- **Org**: users, yards, yard_assignments, system_config

### Key JSONB fields
- `properties.document_data` keys: `bos_purchase`, `bos_sale`, `title_app_purchase`, `title_app_sale` (each with file URL + extracted fields like hud_label_number).
- `properties.photos` — array of URLs.
- `properties.checklist_data` — Revisar Casa wizard answers.
- `renovations.materials` — array `{item, quantity, unit_cost, total}`.
- `title_transfers.documents_checklist` — bill_of_sale, title_application, tax_receipt, id_copies, lien_release, notarized_forms (each `{checked, file_url, uploaded_at}`).
- `clients.kyc_documents`, `clients.personal_references`, `clients.kpi_fields`.
- `notifications.metadata`.
- `scheduler_runs.summary` (job metrics).

### Critical recent migrations
- 026 — accounting (chart of accounts + transactions for Homes)
- 028 — QuickBooks-style hierarchy
- 042 — capital bank statements + import pipeline
- 077 — sale_payments (granular tracking, auto-recalc trigger)
- 084 — backfill_sale_serials (UPDATE sale transfers from purchase data)
- 085 — scheduler_runs (persist cron audit log across Railway restarts)
- 086 — manual_title_upload (`is_manual_upload`, `manual_upload_notes`)

---

## Business rules
- Geographic: 200mi radius from Houston/Dallas, TX only.
- Buy at max 60% market value, sell at max 80% (PrecioAgent enforces 80% ceiling).
- Price range: $5K–$80K.
- Renovation budget: $5K–$15K.
- Commissions: $1,500 contado / $1,000 RTO, split 50/50 found_by + sold_by.
- Sale types: Contado (cash) or RTO (Rent-to-Own).
- RTO defaults: $15/day late fee, 5-day grace, due day 15, $250 NSF, $695 holdover.

## Frontend ↔ Backend wiring
- Next.js API routes at `/api/*` proxy to FastAPI at `API_URL` (default `http://localhost:8000`).
- `maxDuration = 120` on long-running proxies (e.g. title-monitor/trigger).
