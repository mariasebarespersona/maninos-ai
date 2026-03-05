# CLAUDE.md — Maninos AI Project Context

> **This is the primary context file for Claude Code Desktop.**
> Read this ENTIRE document before making any changes to the codebase.
> Last updated: March 5, 2026

---

## What Is This Project?

**Maninos AI** is a full-stack web application for **Maninos Homes LLC** and **Maninos Capital LLC**, companies that buy, renovate, and sell mobile homes in Texas. The app replaces their Excel + CRM workflows with an integrated platform.

**Three portals share one database:**

| Portal | URL Path | Users | Purpose |
|--------|----------|-------|---------|
| **Maninos Homes** | `/homes/*` | Employees (Gabriel, Romario, yard managers) | Buy, renovate, sell properties |
| **Maninos Capital** | `/capital/*` | Finance team (Abigail, analysts) | RTO contracts, payments, investors, accounting |
| **Portal Clientes** | `/clientes/*` | Public / clients | Browse houses, buy, view RTO status, KYC |

---

## Tech Stack

| Layer | Technology | Details |
|-------|------------|---------|
| **Backend API** | Python 3.12 + FastAPI | `api/main.py` is the active entrypoint |
| **Frontend** | Next.js 14 (App Router) + TypeScript + Tailwind CSS | `web/` directory |
| **Database** | Supabase (PostgreSQL) | Managed, accessed via `supabase-py` |
| **Auth** | Supabase Auth | Employee login + client portal auth |
| **Storage** | Supabase Storage | Property photos, documents (buckets: `property-photos`, `documents`) |
| **Payments** | Stripe | PaymentIntents for sales, Stripe Identity for KYC |
| **Email** | Resend | Transactional emails |
| **AI/LLM** | OpenAI GPT-4o / GPT-4o-mini | AI agents, voice (Whisper), embeddings |
| **Scraping** | Playwright + BeautifulSoup | MHVillage, Craigslist, 21st Mortgage, VMF Homes |
| **Observability** | Logfire + Langfuse | Optional, degrades gracefully |
| **Deploy (API)** | Railway | Docker container, auto-deploy on push to `main` |
| **Deploy (Web)** | Vercel | Auto-deploy on push to `main` |

---

## Project Structure

```
maninos-ai/
├── api/                          # FastAPI backend (THE active app)
│   ├── main.py                   # ⭐ Main FastAPI app — registers ALL routes
│   ├── routes/                   # API route handlers
│   │   ├── properties.py         # CRUD properties
│   │   ├── clients.py            # CRUD clients
│   │   ├── sales.py              # Sales management
│   │   ├── market_listings.py    # Market scraping dashboard
│   │   ├── ai_assistant.py       # AI chat endpoint
│   │   ├── accounting.py         # Homes accounting (P&L, balance sheet)
│   │   ├── evaluations.py        # Property evaluation reports
│   │   ├── documents.py          # Document uploads/management
│   │   ├── moves.py              # Property moves between yards
│   │   ├── renovation.py         # Renovation tracking
│   │   ├── materials.py          # Renovation materials/costs
│   │   ├── transfers.py          # Title transfers
│   │   ├── purchase_payments.py  # Purchase payment registration
│   │   ├── team.py               # Team/user management
│   │   ├── emails.py             # Email scheduling
│   │   ├── extract_listing.py    # Extract data from listing URLs/images
│   │   ├── facebook_auth.py      # Facebook scraping auth
│   │   ├── portal_links.py       # Portal link management
│   │   ├── capital/              # ⭐ Capital portal routes
│   │   │   ├── accounting.py     # Capital-specific accounting
│   │   │   ├── analysis.py       # RTO financial analysis
│   │   │   ├── applications.py   # Client credit applications
│   │   │   ├── contracts.py      # RTO contract generation
│   │   │   ├── dashboard.py      # Capital dashboard KPIs
│   │   │   ├── investors.py      # Investor management
│   │   │   ├── kyc.py            # KYC verification flow
│   │   │   ├── payments.py       # RTO payment tracking
│   │   │   ├── promissory_notes.py # Investor promissory notes
│   │   │   ├── reports.py        # Financial reports
│   │   │   └── capital_flows.py  # Capital flow tracking
│   │   └── public/               # ⭐ Public (client-facing) routes
│   │       ├── clients.py        # Client self-service
│   │       ├── properties.py     # Public property catalog
│   │       └── purchases.py      # Purchase flow
│   ├── agents/                   # AI agents
│   │   ├── base.py               # Base agent class
│   │   ├── router.py             # Agent routing
│   │   ├── buscador/             # Property search agent (web scraping)
│   │   │   ├── agent.py
│   │   │   ├── scraper.py        # MHVillage, MobileHome.net scraping
│   │   │   ├── craigslist_scraper.py
│   │   │   ├── fb_scraper.py     # Facebook Marketplace scraper
│   │   │   └── fb_auth.py
│   │   ├── costos/agent.py       # Renovation cost estimation
│   │   ├── fotos/agent.py        # Photo analysis agent
│   │   ├── precio/agent.py       # Pricing agent
│   │   ├── renovacion/agent.py   # Renovation management
│   │   └── voz/agent.py          # Voice processing agent
│   ├── services/                 # Business logic services
│   │   ├── property_service.py
│   │   ├── document_service.py
│   │   ├── email_service.py
│   │   ├── pdf_service.py
│   │   └── scheduler_service.py  # APScheduler for cron jobs
│   ├── utils/                    # Utility functions
│   │   ├── qualification.py      # Property qualification rules
│   │   ├── tdhca_parser.py       # Texas TDHCA title lookup parser
│   │   ├── commissions.py        # Commission calculations
│   │   ├── price_predictor.py    # Price prediction
│   │   ├── image_storage.py      # Image upload to Supabase Storage
│   │   ├── roles.py              # Role-based access
│   │   └── renovation_template*.py # Renovation templates
│   └── models/                   # Pydantic models
│
├── web/                          # Next.js 14 frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── homes/            # ⭐ Portal Maninos Homes
│   │   │   │   ├── page.tsx              # Dashboard
│   │   │   │   ├── market/page.tsx       # Market listings scraper dashboard
│   │   │   │   ├── properties/           # Property inventory + detail pages
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── new/page.tsx      # 4-step new property form
│   │   │   │   │   └── [id]/            # Property detail with tabs
│   │   │   │   ├── clients/page.tsx      # Client management
│   │   │   │   ├── sales/page.tsx        # Sales tracking
│   │   │   │   ├── transfers/page.tsx    # Title transfers
│   │   │   │   ├── commissions/page.tsx  # Commission reports
│   │   │   │   ├── accounting/page.tsx   # Financial statements
│   │   │   │   └── layout.tsx            # Homes portal layout + nav
│   │   │   ├── capital/          # ⭐ Portal Maninos Capital
│   │   │   │   ├── page.tsx              # Capital dashboard
│   │   │   │   ├── applications/         # Client applications + DTI
│   │   │   │   ├── contracts/            # RTO contracts
│   │   │   │   ├── payments/page.tsx     # Payment tracking
│   │   │   │   ├── mora/page.tsx         # Delinquency management
│   │   │   │   ├── investors/            # Investor management
│   │   │   │   ├── promissory-notes/     # Promissory notes
│   │   │   │   ├── reports/page.tsx      # Financial reports
│   │   │   │   ├── flows/page.tsx        # Capital flows
│   │   │   │   ├── kyc/page.tsx          # KYC verification
│   │   │   │   ├── analysis/page.tsx     # RTO analysis
│   │   │   │   ├── accounting/page.tsx   # Capital accounting
│   │   │   │   └── layout.tsx
│   │   │   ├── clientes/         # ⭐ Portal Clientes (public)
│   │   │   │   ├── page.tsx              # Landing page
│   │   │   │   ├── casas/               # Property catalog
│   │   │   │   ├── comprar/             # Purchase flow (5 steps)
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── mi-cuenta/           # Client dashboard, docs, RTO status
│   │   │   │   └── layout.tsx
│   │   │   ├── api/              # ⭐ Next.js API proxy routes
│   │   │   │   └── (mirrors all FastAPI routes as proxies)
│   │   │   ├── login/page.tsx    # Employee login
│   │   │   ├── layout.tsx        # Root layout
│   │   │   └── page.tsx          # Root redirect
│   │   ├── components/           # React components
│   │   │   ├── MarketDashboard.tsx        # Market scraping dashboard
│   │   │   ├── PropertyChecklist.tsx      # 26-point evaluation checklist
│   │   │   ├── BillOfSaleTemplate.tsx     # Bill of Sale document template
│   │   │   ├── TitleApplicationTemplate.tsx # TDHCA title application
│   │   │   ├── AIChatWidget.tsx           # Floating AI chat
│   │   │   ├── RenovationMaterials.tsx    # Renovation cost tracking
│   │   │   ├── StripePaymentForm.tsx      # Stripe Elements payment
│   │   │   ├── Auth/                      # Auth components
│   │   │   ├── charts/                    # KPI cards, Texas map, sales charts
│   │   │   ├── capital/                   # Capital-specific components
│   │   │   └── ui/                        # Shared UI (Modal, Toast, FormInput, etc.)
│   │   ├── hooks/                # Custom React hooks
│   │   ├── lib/                  # Shared utilities
│   │   │   ├── supabase/         # Supabase client setup (client, server, middleware)
│   │   │   ├── rto-calculator.ts # RTO payment calculations
│   │   │   └── titleApplicationValidation.ts
│   │   ├── types/index.ts        # TypeScript type definitions
│   │   └── middleware.ts         # Next.js middleware (auth session)
│   ├── __tests__/                # Jest + React Testing Library tests
│   ├── jest.config.ts
│   ├── jest.setup.ts
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── package.json
│
├── tools/                        # Shared Python utilities
│   ├── supabase_client.py        # ⭐ Supabase client singleton (import: from tools.supabase_client import sb)
│   ├── stripe_payments.py        # Stripe payment handling
│   ├── stripe_identity.py        # Stripe KYC identity
│   ├── email_tool.py             # Resend email integration
│   ├── pdf_generator.py          # PDF generation (ReportLab)
│   ├── cache.py                  # Optional Redis caching
│   ├── logfire_client.py         # Logfire setup
│   └── logfire_metrics.py
│
├── core/                         # Core infrastructure
│   ├── config.py                 # ⭐ Pydantic Settings (from core.config import settings)
│   └── logging.py                # Structured logging (structlog)
│
├── prompts/                      # AI agent system prompts
│   ├── system_v2.md              # Main PropertyAgent prompt
│   ├── core.md                   # Core agent rules
│   └── policies/                 # Safety, tone, property policies
│
├── migrations/                   # ⭐ SQL migrations (001-047)
│   ├── 001_initial_schema.sql    # Core tables (users, properties, clients, sales, etc.)
│   ├── ...                       # Incremental schema changes
│   └── 047_property_document_data.sql  # Latest migration
│
├── docs/                         # Documentation
│   ├── DEVELOPER_BIBLE_V2.md     # Development principles (MUST READ)
│   ├── AGENT_BIBLE_V1.md         # AI agent development principles
│   ├── ARQUITECTURA_PORTALES_V1.md # Portal architecture overview
│   ├── BUSCADOR_AGENT_V2.md      # Search agent documentation
│   └── PLAN_PORTAL_CLIENTES.md   # Client portal plan
│
├── data/                         # Static data files
│   └── historico_2025.json       # Historical sales data
│
├── tests/                        # Backend tests (pytest)
├── Dockerfile                    # Production Docker image
├── Procfile                      # Railway: uvicorn api.main:app
├── railway.json                  # Railway config
├── requirements.txt              # Python dependencies
├── startup.py                    # Production startup wrapper
├── start_dev.sh                  # Dev: starts API + frontend
└── start.sh                      # Production start script
```

---

## How To Run Locally

### Backend (FastAPI)

```bash
# From project root
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Start API server (port 8000)
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (Next.js)

```bash
cd web
npm install
npm run dev
# Runs on http://localhost:3000
```

### Both at once

```bash
bash start_dev.sh
# API on :8000, Frontend on :3000
```

---

## Environment Variables

Create a `.env` file in the project root:

```bash
# Required
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_anon_key              # Used as SUPABASE_KEY in backend
SUPABASE_SERVICE_ROLE_KEY=your_key       # For privileged backend operations
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...

# Optional
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
LOGFIRE_TOKEN=...
REDIS_URL=redis://...
APP_URL=https://your-vercel-app.vercel.app
CORS_EXTRA_ORIGINS=https://custom-domain.com
ENVIRONMENT=development                  # or production
DEBUG=true
LOG_LEVEL=INFO
```

For the frontend (`web/.env.local`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000    # Backend URL
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

---

## Architecture Patterns

### API Proxy Pattern

The frontend NEVER calls the FastAPI backend directly from the browser. Instead:

```
Browser → Next.js API Route (web/src/app/api/...) → FastAPI (api/routes/...)
```

Every FastAPI route has a corresponding Next.js proxy route in `web/src/app/api/`. The proxy routes forward requests to `process.env.NEXT_PUBLIC_API_URL` (the FastAPI server).

### Database Access

- **Backend**: Uses `from tools.supabase_client import sb` (Supabase Python client with `service_role` key)
- **Frontend server components**: Uses `@/lib/supabase/server.ts`
- **Frontend client components**: Uses `@/lib/supabase/client.ts` (anon key, respects RLS)
- **Configuration**: Uses `from core.config import settings` (Pydantic Settings, cached singleton)

### Migrations

- All migrations are in `migrations/` directory, numbered sequentially (001-047)
- **IMPORTANT**: Migrations are run MANUALLY in the Supabase SQL Editor
- Never attempt to run migrations programmatically
- When creating new migrations, increment the number and create a `.sql` file
- Always remind the user (Maria) to run the migration in Supabase

### Two Backend Entrypoints (Important!)

- **`api/main.py`** — The ACTIVE production entrypoint. Used by `Procfile`, `startup.py`, and `Dockerfile`. This is where all routes are registered.
- **`app.py`** — LEGACY entrypoint from an earlier version. Contains old chat/agent code and some webhook handlers. It is NOT used in production but still exists in the repo. **Do not add new routes to `app.py`**.

---

## Business Context & Rules

### Company Structure

- **Maninos Homes LLC** — Buys, renovates, and sells mobile homes in Texas
- **Maninos Capital LLC** — Finances RTO (Rent-to-Own) deals, manages investors
- **Key team**: Sebastian (CEO), Gabriel (Operations Head), Abigail (Treasury), Romario (Cromwell yard manager)
- **3 yards**: Cromwell, Houston, Dallas

### Property Purchase Flow (Portal Homes)

```
1. Find house (Market Dashboard / Facebook Marketplace)
2. Evaluate (26-point checklist with photos/video)
3. Documents (Bill of Sale + Title from TDHCA)
4. Pay seller (bank transfer, 80% of cases)
5. Renovate ($5K-$15K budget)
6. Publish & Sell (Contado or RTO)
```

### Key Business Rules

| Rule | Value | Notes |
|------|-------|-------|
| **Max purchase price** | 60% of market value | Renovation cost NOT included |
| **Max sale price** | 80% of market value | Client gets 20% below market |
| **Target profit** | 20% margin | |
| **Price range** | $5,000 - $80,000 | For searching |
| **Zone** | 200 miles from Houston + 200 miles from Dallas | |
| **Property types** | Single wide (80%) + Double wide (20%) | |
| **Renovation budget** | $5,000 - $15,000 | |
| **Year filter** | NONE (removed) | No year_built >= 1995 filter |
| **Market value** | Average of historical sales + web scraping average | |

### Formulas (SOURCE OF TRUTH — never modify without explicit request)

1. **Late fees**: `days_late × $15/day` (5-day grace period)
2. **DTI**: `(total_debts / total_income) × 100` (threshold ≤ 43%)
3. **Compound interest** (promissory notes): `balance × monthly_rate` compounded monthly, balloon at maturity
4. **RTO Analysis**: ROI, LTV, suggested rent, breakeven, risk score (see `api/routes/capital/analysis.py`)
5. **Capital flow balance**: Sum of all flow amounts
6. **Commissions**: $1,000 RTO / $1,500 cash, 50/50 split between `found_by` and `sold_by`
7. **Collection rate**: `(actual_income / expected_income) × 100`
8. **Delinquency rate**: `(overdue_amount / monthly_expected) × 100`
9. **Investor ROI**: `((total_returned / total_invested) × 100) − 100`
10. **P&L**: `total_income − total_expenses = net_profit`

### Commission Rules

- NO commission on purchases (only Gabriel buys)
- Sales: $1,000 for RTO, $1,500 for cash
- Split: `found_by` gets 50%, `sold_by` gets 50%
- If same person → 100%
- Fields: `found_by_employee_id`, `sold_by_employee_id` on sales records

### TDHCA Integration

The app integrates with Texas TDHCA (Department of Housing and Community Affairs) for title lookups:
- URL: `https://mhweb.tdhca.state.tx.us/mhweb/title_view.jsp`
- Parser: `api/utils/tdhca_parser.py`
- Auto-fills Title Application template from TDHCA data
- Uses serial number / label number for lookups

---

## Deployment & CI/CD

### Auto-deploy on push to main

```bash
git add -A && git commit -m "description" && git push origin main
```

- **Railway** automatically rebuilds the Docker image and deploys the API
- **Vercel** automatically builds and deploys the Next.js frontend

### Railway (API)

- Uses `Dockerfile` → `startup.py` → `uvicorn api.main:app`
- Port from `$PORT` env var
- Health check: `GET /health`

### Vercel (Web)

- Uses `web/` directory as root
- Next.js 14 standalone build
- `next.config.js` has `output: 'standalone'`

---

## Testing

### Frontend (Jest + React Testing Library)

```bash
cd web
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

- Tests in `web/__tests__/`
- Config: `web/jest.config.ts`
- Setup: `web/jest.setup.ts`
- Uses `jsdom` environment

### Backend (pytest)

```bash
cd /path/to/project
python -m pytest tests/
```

- Tests in `tests/`

### Type checking

```bash
cd web
npx tsc --noEmit  # TypeScript type check
```

---

## Key Conventions

### Code Style

- **Python**: Type hints everywhere, Pydantic for validation, async FastAPI handlers
- **TypeScript**: Strict mode enabled, interfaces in `types/index.ts`
- **Components**: Server components by default, `"use client"` only when needed
- **Styling**: Tailwind CSS classes (no CSS modules)
- **Language**: Code in English, UI text in Spanish, comments in English or Spanish

### API Response Format

```python
# Success
{"ok": True, "data": {...}, "message": "..."}

# Error  
{"ok": False, "error": "...", "detail": "..."}
```

### File Naming

- Python: `snake_case.py`
- TypeScript pages: `page.tsx` (Next.js convention)
- Components: `PascalCase.tsx`
- API routes: `route.ts` (Next.js convention)

### Important Imports

```python
# Supabase client
from tools.supabase_client import sb

# Settings
from core.config import settings

# Logging
from core.logging import get_logger
logger = get_logger(__name__)
```

```typescript
// Types
import { Property, Client, Sale } from '@/types'

// Supabase
import { createClient } from '@/lib/supabase/client'  // client-side
import { createClient } from '@/lib/supabase/server'  // server-side
```

---

## Database Tables (Current Schema)

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | Employees (admin, operations, treasury, yard_manager) |
| `properties` | Mobile home inventory (status: purchased → published → sold) |
| `clients` | Buyers/tenants (status: lead → active → completed) |
| `sales` | Sale records (type: contado/rto) |
| `renovations` | Renovation tracking per property |
| `documents` | Document uploads (entity_type + entity_id polymorphic) |
| `title_transfers` | Title transfer tracking |
| `audit_logs` | Audit trail |

### Market/Acquisition Tables

| Table | Purpose |
|-------|---------|
| `market_listings` | Scraped listings from web (MHVillage, Craigslist, etc.) |
| `evaluation_reports` | Property evaluation reports (26-point checklist) |
| `evaluation_photos` | Photos from field evaluations |
| `moves` | Property move/transport records between yards |

### Capital/RTO Tables

| Table | Purpose |
|-------|---------|
| `rto_contracts` | RTO lease agreements |
| `payments` | Monthly RTO payments |
| `investors` | Investor records |
| `investments` | Investment → property mapping |
| `promissory_notes` | Investor promissory notes |
| `capital_flows` | Capital flow tracking |
| `capital_budgets` | Capital budgets |

### Accounting Tables

| Table | Purpose |
|-------|---------|
| `accounting_accounts` | Chart of accounts |
| `accounting_transactions` | Financial transactions |
| `bank_accounts` | Bank account records |
| `bank_statements` | Imported bank statements |
| `saved_financial_statements` | Saved P&L / Balance Sheet reports |

### System Tables

| Table | Purpose |
|-------|---------|
| `system_config` | Key-value system configuration |
| `scheduled_emails` | Email scheduling queue |
| `rag_chunks` | Vector embeddings for RAG search (pgvector) |

---

## Recent Work (Feb-Mar 2026)

The most recent development has focused on:

1. **TDHCA title parser** — Robust 3-strategy extraction (tables + regex + line-pairs) to auto-fill Title Application from Texas TDHCA records
2. **26-point property checklist** — 3 macro-groups (Field Inspection, Office Review, Purchase Close) with collapsible UI and progress bars
3. **Property documents** — Bill of Sale and Title Application templates with auto-fill from TDHCA data, saveable to `properties.document_data` JSONB
4. **Accounting** — Full P&L, Balance Sheet, budgets, bank statements for both Homes and Capital portals
5. **Promissory notes** — Simple interest, flexible payments for investors
6. **Listing images** — Persisting scraped listing images in Supabase Storage
7. **Property code system** — Auto-generated codes (A1, A2...) + dimensions (length × width)

---

## Developer Principles (from Developer Bible)

1. **DATABASE IS SOURCE OF TRUTH** — Always query DB before making decisions
2. **DATA-DRIVEN, NOT KEYWORD-DRIVEN** — Route by actual entity state, not string matching
3. **ONE STEP AT A TIME** — Pause for confirmation between critical steps
4. **NO DATA INVENTION** — Never estimate; use real calculations
5. **EXPLICIT OVER IMPLICIT** — Clear returns, documented side effects
6. **FAIL FAST, FAIL LOUD** — Validate early, error clearly
7. **TYPE EVERYTHING** — TypeScript strict, Python type hints
8. **SIMPLE FIRST** — Optimize only when metrics demand it

---

## Gotchas & Warnings

1. **`app.py` is NOT the active backend** — Use `api/main.py`. The `app.py` file is legacy code.
2. **Migrations are manual** — Create `.sql` files, remind Maria to run them in Supabase SQL Editor.
3. **Next.js API routes are proxies** — They just forward to FastAPI. Business logic lives in `api/routes/`.
4. **CORS** — Configured in `api/main.py` with regex for Vercel preview deploys.
5. **Supabase client uses `SUPABASE_KEY`** — Not `SUPABASE_ANON_KEY`. Check `tools/supabase_client.py`.
6. **The `web/` directory is the Next.js project root** — Run `npm` commands from there.
7. **No year filter** on property searches — It was removed per client request.
8. **Price filter** is $5K-$80K (not $0-$80K).
9. **Purchase rule** is max 60% of market value (not 70%).
10. **Always git push after changes** — Auto-deploys to Railway + Vercel.

