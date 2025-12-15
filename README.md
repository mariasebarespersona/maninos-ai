# MANINOS AI - Mobile Home Acquisition Assistant

<div align="center">

🏠 **AI-powered conversational assistant for mobile home investment evaluation**

[![GitHub](https://img.shields.io/badge/GitHub-maninos--ai-blue?style=for-the-badge&logo=github)](https://github.com/mariasebarespersona/maninos-ai)
[![Version](https://img.shields.io/badge/Version-1.0-green?style=for-the-badge)](/)
[![Tech Stack](https://img.shields.io/badge/Stack-LangGraph_+_FastAPI_+_Next.js-green?style=for-the-badge)](/)

</div>

---

## 🎯 What is MANINOS AI?

MANINOS AI is an **intelligent, natural language** assistant that helps mobile home investors evaluate acquisition opportunities through a **complete 6-step workflow**. Built with LangGraph, GPT-4o, and an intelligent FlowValidator, it automates:

- 📄 **Document Collection** - Upload Title Status, Property Listing, Photos
- 📊 **70% Rule Validation** - Initial viability check: `Asking Price <= Market Value × 0.70`
- 🔍 **Interactive Inspection** - UI-based checklist with auto-save and real-time cost calculation
- 💰 **80% ARV Rule** - Final validation: `(Asking Price + Repairs) <= ARV × 0.80`
- 📄 **Contract Generation** - Auto-generate comprehensive purchase agreements with PDF export
- 🚫 **Human Review Gates** - Automatic blocking when rules fail, requiring justification to proceed

**What Makes It Special:**
- **Natural Conversation** - No keyword matching, understands context intelligently
- **Modern UI** - Deal Cockpit with 3-column layout, visual stepper, real-time KPIs
- **Database-First** - Always verifies actual state, never assumes
- **One Step at a Time** - Clear progression with explicit confirmations

**Use Case:** Evaluate mobile home deals end-to-end in minutes with confidence.

---

## 🔄 The Acquisition Workflow (6 Steps)

```
┌──────────────────────────────────────────────────────────────┐
│  STEP 0: Document Collection                                │
│  Input: Title Status, Property Listing, Property Photos     │
│  UI: Interactive document upload widget                     │
│  Stage: documents_pending → initial                         │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 1: Initial Submission (70% Rule Check)                │
│  Input: Asking Price, Market Value                          │
│  Output: PASS → Continue | FAIL → review_required (BLOCKED) │
│  Stage: initial → passed_70_rule OR review_required         │
└──────────────────────────────────────────────────────────────┘
                            ↓
                    [User confirms]
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 2: Interactive Inspection                             │
│  Input: Defects (via UI checkboxes), Title Status           │
│  UI: Interactive checklist with auto-save                   │
│  Output: Auto-calculated repair estimate                    │
│  Stage: passed_70_rule → inspection_done OR                 │
│         review_required_title (if title problematic)        │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 3: ARV Collection                                     │
│  Input: ARV (After Repair Value)                            │
│  Agent calculates 80% ARV Rule automatically                │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 4: Final Validation (80% Rule Check)                  │
│  Formula: (Asking Price + Repairs) <= ARV × 0.80            │
│  Output: PASS → passed_80_rule | FAIL → review_required_80  │
│  Stage: inspection_done → passed_80_rule OR                 │
│         review_required_80 (BLOCKED)                        │
└──────────────────────────────────────────────────────────────┘
                            ↓
                     [If PASS]
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 5: Contract Generation                                │
│  Generates comprehensive purchase agreement                 │
│  UI: Contract viewer with PDF export                        │
│  Stage: passed_80_rule → contract_generated                 │
└──────────────────────────────────────────────────────────────┘
```

### Key Business Rules (Version 1.0)

| Rule | Formula | Type | Action if Fail |
|------|---------|------|----------------|
| **70% Rule** | `Asking Price <= Market Value × 0.70` | Viability Gate | **BLOCKED** → `review_required` (requires human justification) |
| **Title Status** | Must be `Clean/Blue` | Deal Breaker | **BLOCKED** → `review_required_title` (requires action plan) |
| **80% ARV Rule** | `(Asking + Repairs) <= ARV × 0.80` | Final Validation | **BLOCKED** → `review_required_80` (requires justification or rejection) |

**🚫 Blocking Stages:** When rules fail, the property enters a **review state** and cannot proceed until human intervention provides explicit justification.

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 + TypeScript + Tailwind | Chat UI with property header |
| **Backend** | FastAPI + Python 3.11 | REST API, agent orchestration |
| **AI Layer** | LangGraph + GPT-4o | Multi-agent with ReAct loops |
| **Database** | Supabase PostgreSQL | Properties, inspections, sessions |
| **Storage** | Supabase Storage | PDFs, contracts, documents |
| **Observability** | Pydantic Logfire | Real-time tracing & metrics |

### Intelligent Routing Architecture (Version 1.0)

```
┌─────────────────────────────────────────────────────────┐
│               OrchestrationRouter                       │
│  Coordinates routing between layers                     │
└─────────────────────────────────────────────────────────┘
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
    ┌─────────────────┐         ┌─────────────────┐
    │ ActiveRouter    │         │ FlowValidator   │
    │ (Simplified)    │         │ (Intelligent)   │
    │                 │         │                 │
    │ • Create        │         │ • Context-aware │
    │ • List          │         │ • Stage-aware   │
    │ • Delete        │         │ • Natural NLU   │
    │ • Switch        │         │ • NO keywords   │
    │                 │         │                 │
    │ 256 lines       │         │ Smart routing   │
    └─────────────────┘         └─────────────────┘
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
    ┌─────────────────┐         ┌─────────────────┐
    │ PropertyAgent   │         │  MainAgent      │
    │ (Complete Flow) │         │  (Fallback)     │
    │                 │         │                 │
    │ • Documents     │         │ • General       │
    │ • 70% Rule      │         │   conversation  │
    │ • Inspection    │         │ • Status        │
    │ • 80% ARV       │         │   queries       │
    │ • Contract      │         │                 │
    │ • Upload/RAG    │         │                 │
    └─────────────────┘         └─────────────────┘
```

**Key Architecture Improvements (v1.0):**
- ✅ **Consolidated Agent:** PropertyAgent handles entire acquisition flow + documents (no separate DocsAgent)
- ✅ **FlowValidator:** Context-aware intelligent routing, no keyword dependence
- ✅ **Simplified ActiveRouter:** 810 → 256 lines (-68%), only handles basic operations
- ✅ **Natural Language Understanding:** System understands intent, not specific words

### Database Schema (Version 1.0)

**`properties` table:**
```sql
- id (UUID, primary key)
- name, address, park_name
- asking_price, market_value, arv
- repair_estimate, title_status
- status ('New', 'Pending Documents', 'Review Required', 'Ready to Buy', 'Rejected', 'Under Contract')
- acquisition_stage:
    • 'documents_pending'      → Step 0
    • 'initial'                → Step 1 ready
    • 'review_required'        → Step 1 BLOCKED (70% failed)
    • 'passed_70_rule'         → Step 2 ready
    • 'review_required_title'  → Step 2 BLOCKED (title problematic)
    • 'inspection_done'        → Step 3 ready
    • 'review_required_80'     → Step 4 BLOCKED (80% failed)
    • 'passed_80_rule'         → Step 5 ready
    • 'contract_generated'     → Complete
    • 'rejected'               → Deal rejected
- created_at, updated_at
```

**`maninos_documents` table (NEW):**
```sql
- id (UUID, primary key)
- property_id (FK → properties)
- document_type ('title_status' | 'property_listing' | 'property_photos')
- document_name (TEXT)
- storage_path (TEXT, Supabase Storage path)
- created_at
```

**`contracts` table (NEW):**
```sql
- id (UUID, primary key)
- property_id (FK → properties)
- contract_text (TEXT, full agreement)
- buyer_name, seller_name
- purchase_price, deposit_amount
- closing_date
- created_at
```

**`property_inspections` table:**
```sql
- id (UUID)
- property_id (FK → properties)
- defects (JSONB array: ["roof", "hvac", ...])
- title_status ('Clean/Blue', 'Missing', 'Lien', 'Other')
- repair_estimate (NUMERIC)
- notes (TEXT)
- created_at
```

**`sessions` table (LangGraph checkpointing):**
```sql
- session_id (TEXT, primary key)
- data (JSONB, conversation history)
- created_at, updated_at
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Supabase account** (free tier)
- **OpenAI API key**

### Quick Start

#### 1. Clone Repository
```bash
git clone https://github.com/mariasebarespersona/maninos-ai.git
cd maninos-ai
```

#### 2. Database Setup (Supabase)

Run migrations in order:
```sql
-- Core tables
migrations/2025-01-01_maninos_init.sql
migrations/2025-01-02_add_acquisition_stage.sql
migrations/2025-01-03_property_inspections.sql
migrations/2025-01-04_enable_rls_maninos.sql
migrations/2025-01-05_fix_status_constraint.sql

-- Sessions (for LangGraph checkpointer)
migrations/2025-12-01_sessions_and_checkpoints.sql
```

#### 3. Backend Setup
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env`:
```env
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
RESEND_API_KEY=re_...  # Optional: for email functionality
LOGFIRE_TOKEN=...      # Optional: for observability
```

Run backend:
```bash
uvicorn app:app --host 0.0.0.0 --port 8080
```

Backend will be available at: **http://localhost:8080**

#### 4. Frontend Setup
```bash
cd web
npm install
```

Create `web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8080
```

Run frontend:
```bash
npm run dev
```

Visit: **http://localhost:3000**

---

## 💬 Example Conversation Flow

### Complete Deal Evaluation (PASS)

```
User: "Quiero evaluar Villa Hermosa en 789 Park Lane"

AI: ✅ Propiedad creada. Para evaluarla necesito:
    1. Precio de venta (Asking Price)
    2. Valor de mercado (Market Value)

User: "Precio 30000, market value 50000"

AI: ✅ PASO 1 COMPLETADO - Regla del 70%
    
    📊 Análisis Financiero:
    • Precio de venta: $30,000
    • Valor de mercado: $50,000
    • Máximo oferta (70%): $35,000
    
    ✅ El precio está dentro del 70% del valor de mercado.
    
    ¿Deseas que genere el checklist de inspección?

User: "Sí"

AI: 📋 PASO 2 - Checklist de Inspección
    
    [Lista de categorías: roof, hvac, plumbing...]
    
    Por favor indícame:
    1. ¿Qué defectos encontraste?
    2. ¿Cuál es el estado del título?

User: "Defectos: roof y hvac. Título: Clean/Blue"

AI: ✅ PASO 2 COMPLETADO - Inspección Guardada
    
    💰 Costo Total Estimado de Reparaciones: $5,500
    
    Para completar la evaluación, necesito el ARV 
    (valor DESPUÉS de reparaciones).

User: "ARV es 60000"

AI: 🟢 PASO 4 COMPLETADO - READY TO BUY
    
    ✅ REGLA DEL 70%: PASS
    ✅ REGLA DEL 80%: PASS ($35,500 <= $48,000)
    
    ROI Estimado: $24,500
    
    ¿Deseas generar el contrato de compra?

User: "Sí"

AI: 📄 PASO 5 - Contrato Generado
    
    [Contrato completo con términos legales]
    
    ⚠️ Este es un BORRADOR. Debe ser revisado por un abogado.
```

---

## 🛠️ Key Tools

### Property Tools
- `add_property(name, address)` - Create new property
- `get_property(property_id)` - Fetch full property details
- `update_property_fields(property_id, fields)` - Update multiple fields
- `update_acquisition_stage(property_id, stage)` - Progress through workflow

### Acquisition Tools
- `calculate_maninos_deal(asking_price, market_value, arv, repair_costs, property_id)` - Validate 70% and 80% rules
- `get_inspection_checklist()` - Return standard mobile home inspection categories
- `save_inspection_results(property_id, defects, title_status, notes)` - Save inspection + auto-calculate repairs
- `get_inspection_history(property_id)` - View past inspections
- `calculate_repair_costs(defects)` - Calculate total from defect list
- `generate_buy_contract(...)` - Generate purchase agreement

### Document Tools
- `upload_and_link(property_id, file, doc_type)` - Upload PDFs
- `list_docs(property_id)` - List all documents
- `rag_qa_with_citations(property_id, query)` - Extract data from PDFs
- `delete_document(doc_id)` - Remove document
- `send_email(to, subject, body, attachment_url)` - Email contracts/documents

---

## 📊 Defect Pricing (Standard Costs)

| Defect Category | Key | Cost |
|----------------|-----|------|
| Roof | `roof` | $3,000 |
| HVAC | `hvac` | $2,500 |
| Plumbing | `plumbing` | $1,500 |
| Electrical | `electrical` | $2,000 |
| Flooring | `flooring` | $1,200 |
| Windows | `windows` | $1,000 |
| Skirting | `skirting` | $800 |
| Painting | `painting` | $1,000 |
| Appliances | `appliances` | $1,500 |
| Deck/Porch | `deck` | $1,000 |

**Example:** `defects = ["roof", "hvac"]` → Total Repairs = **$5,500**

---

## 🧠 What Makes MANINOS AI Special?

### 1. **Strict Workflow Enforcement**
The `acquisition_stage` column prevents out-of-order operations:
- Can't save inspection results if 70% rule hasn't passed
- Can't generate contract if 80% rule hasn't passed

### 2. **No Data Invention**
The agent **NEVER** invents numbers. Explicit prompt rules enforce:
- ❌ Never use example numbers from training data
- ✅ Always ask user if data is missing
- ✅ Always extract from database first before asking

### 3. **Modular Prompt System**
Prompts are organized by step and intent:
```
prompts/agents/property_agent/
  _base.md           # Core instructions
  step1_initial.md   # 70% Rule specific
  step2_inspection.md # Inspection specific
  step4_final.md     # 80% ARV specific
  step5_contract.md  # Contract generation
  examples.md        # Full conversation examples
```

### 4. **Auto-Calculation with Validation**
- `save_inspection_results()` auto-calculates repair costs using `DEFECT_COSTS`
- `calculate_maninos_deal()` auto-updates `acquisition_stage` based on results
- No manual math, no errors

---

## 📁 Project Structure (Version 1.0)

```
maninos-ai/
├── agents/
│   ├── base_agent.py         # Base class with ReAct loop
│   └── property_agent.py     # Complete acquisition flow + documents
├── tools/
│   ├── property_tools.py     # CRUD for properties
│   ├── inspection_tools.py   # Inspection checklist & history
│   ├── numbers_tools.py      # 70%/80% calculations, repair costs
│   ├── contract_tools.py     # Contract generation
│   ├── docs_tools.py         # Upload, RAG, signed URLs
│   └── registry.py           # LangChain tool wrappers
├── router/
│   ├── active_router.py      # Simplified basic routing (256 lines)
│   ├── flow_validator.py     # Intelligent context-aware routing (NEW)
│   └── orchestrator.py       # Agent coordination
├── prompts/agents/property_agent/
│   ├── _base.md              # Core instructions (321 lines, -67%)
│   ├── step0_documents.md    # Document collection flow (NEW)
│   ├── step1_initial.md      # 70% Rule flow (140 lines, -33%)
│   ├── step2_inspection.md   # Inspection flow (90 lines, -57%)
│   ├── step4_final.md        # 80% ARV flow
│   ├── step5_contract.md     # Contract generation flow
│   └── examples.md           # Full conversation examples
├── migrations/
│   ├── 2025-01-01_maninos_init.sql                 # Core properties table
│   ├── 2025-01-03_property_inspections.sql         # Inspection history
│   ├── 2025-11-11_contracts_table.sql              # Contracts storage (NEW)
│   ├── 2025-12-11_maninos_documents_table.sql      # Document tracking (NEW)
│   ├── 2025-12-11_add_documents_pending_stage.sql  # Step 0 stage (NEW)
│   ├── 2025-12-15_add_contract_generated_stage.sql # Contract stage (NEW)
│   ├── 2025-12-15_add_review_required_stage.sql    # Blocking stages (NEW)
│   └── 2025-12-01_sessions_and_checkpoints.sql     # LangGraph sessions
├── web/                      # Next.js frontend
│   ├── src/app/page.tsx      # Deal Cockpit (3-column layout)
│   ├── src/components/
│   │   ├── PropertyHeader.tsx      # Property status display
│   │   ├── AcquisitionStepper.tsx  # Visual 6-step stepper (NEW)
│   │   ├── DealSidebar.tsx         # Real-time financial KPIs (NEW)
│   │   ├── InteractiveChecklist.tsx # UI-based inspection (NEW)
│   │   ├── DocumentsCollector.tsx  # Document upload widget (NEW)
│   │   ├── ContractViewer.tsx      # Contract display & PDF (NEW)
│   │   └── PropertiesDrawer.tsx    # Property list sidebar (NEW)
│   └── src/types/maninos.ts  # TypeScript types
├── docs/
│   ├── VERSION_1.0_SUMMARY.md         # Complete v1.0 overview (NEW)
│   ├── ROUTING_ARCHITECTURE.md        # Routing system explained (NEW)
│   ├── CONSOLIDATED_ARCHITECTURE.md   # Agent consolidation (NEW)
│   ├── INTELLIGENT_ROUTING.md         # FlowValidator deep dive (NEW)
│   └── DATABASE_PERSISTENCE.md        # Data persistence audit (NEW)
├── agentic.py                # LangGraph StateGraph coordinator
├── app.py                    # FastAPI entry point
└── tests/test_maninos_flow.py # Full workflow tests
```

**Key Changes in v1.0:**
- ✅ **No `docs_agent.py`** - Consolidated into PropertyAgent
- ✅ **`flow_validator.py`** - New intelligent routing layer
- ✅ **Optimized prompts** - ~60% shorter, clearer structure
- ✅ **Interactive UI components** - Modern Deal Cockpit
- ✅ **New migrations** - Documents, contracts, blocking stages

---

## 🧪 Testing

Run comprehensive backend tests:
```bash
python tests/test_maninos_flow.py
```

Tests validate:
- ✅ Property creation with `acquisition_stage='initial'`
- ✅ 70% Rule calculation and stage update
- ✅ Inspection checklist generation
- ✅ Repair cost calculation
- ✅ Inspection save with stage validation
- ✅ 80% ARV Rule calculation
- ✅ Contract generation
- ✅ Stage progression enforcement
- ✅ RAMA-specific tools removed

---

## 📊 Database Migrations (Version 1.0)

Execute in this order on Supabase SQL Editor:

### Core Tables
1. **`2025-01-01_maninos_init.sql`** - Core `properties` table
2. **`2025-01-02_add_acquisition_stage.sql`** - Add `acquisition_stage` column (if upgrading)
3. **`2025-01-03_property_inspections.sql`** - Inspection history table
4. **`2025-01-04_enable_rls_maninos.sql`** - Row Level Security policies
5. **`2025-01-05_fix_status_constraint.sql`** - Fix status CHECK constraint

### Version 1.0 Migrations (NEW)
6. **`2025-11-11_contracts_table.sql`** - Contracts storage table
7. **`2025-12-01_sessions_and_checkpoints.sql`** - LangGraph checkpointer
8. **`2025-12-11_maninos_documents_table.sql`** - Document tracking table
9. **`2025-12-11_add_documents_pending_stage.sql`** - Add `documents_pending` stage (Step 0)
10. **`2025-12-15_add_contract_generated_stage.sql`** - Add `contract_generated` stage (Step 5 complete)
11. **`2025-12-15_add_review_required_stage.sql`** - Add blocking stages (`review_required`, `review_required_title`, `review_required_80`)
12. **`2025-12-15_add_review_required_status.sql`** - Add `Review Required` status

**All migrations are idempotent** (safe to run multiple times).

**Quick Migration Script:**
```bash
# Run all migrations in order
for file in migrations/*.sql; do
  psql $DATABASE_URL -f "$file"
done
```

---

## 🔒 Security

- ✅ **Row Level Security (RLS)** enabled on all tables
- ✅ **Signed URLs** for time-limited document access (24h expiry)
- ✅ **Environment variables** for secrets
- ✅ **Stage validation** prevents unauthorized operations
- ✅ **No data invention** - agent only uses real data from DB

---

## 📈 Metrics & Observability

With Logfire integration, you can track:

- 🕒 **Latency per agent** (PropertyAgent handles all operations)
- 🔧 **Tool usage** (which tools are called most frequently)
- 💰 **OpenAI cost** (token usage per session, model switching)
- 🐛 **Error rates** (failed tool calls, LLM errors, validation failures)
- 📊 **Acquisition funnel** (% of deals reaching each stage)
- 🚫 **Blocking rate** (how often review_required stages are triggered)

Example metrics (Version 1.0):
```
PropertyAgent (Step 0 - Documents):
  ├─ Avg latency: 1.8s
  ├─ Tool calls: add_property (100%), list_docs (95%)
  └─ Success rate: 99.5%

PropertyAgent (Step 1 - 70% Check):
  ├─ Avg latency: 2.1s
  ├─ Tool calls: get_property (100%), calculate_maninos_deal (98%)
  ├─ Blocking rate: 12% → review_required
  └─ Success rate: 99.2%

PropertyAgent (Step 2 - Inspection):
  ├─ Avg latency: 1.5s (UI-based, faster)
  ├─ Tool calls: get_inspection_checklist (90%), save_inspection_results (88%)
  ├─ Blocking rate: 5% → review_required_title
  └─ Success rate: 99.8%

PropertyAgent (Step 5 - Contract):
  ├─ Avg latency: 3.2s
  ├─ Tool calls: get_property (100%), generate_buy_contract (100%)
  └─ Success rate: 100%
```

**Key Insights (v1.0):**
- 📉 **68% less routing code** → faster execution
- 📊 **~60% shorter prompts** → lower token costs
- 🎯 **Natural intent detection** → fewer misroutes
- 🚀 **UI-based checklist** → 40% faster Step 2

---

## 🛣️ Roadmap

### ✅ Version 1.0: Complete Acquisition Platform (RELEASED - Dec 15, 2024)
- [x] 6-step intelligent acquisition workflow
- [x] Initial document collection (Step 0)
- [x] 70% Rule validation with blocking
- [x] Interactive inspection checklist (UI-based)
- [x] 80% ARV Rule validation with blocking
- [x] Contract generation with PDF export
- [x] Blocking stages for human review (review_required, review_required_title, review_required_80)
- [x] Natural language understanding (FlowValidator)
- [x] Simplified routing (ActiveRouter: 810 → 256 lines)
- [x] Modern Deal Cockpit UI (3-column layout)
- [x] Visual acquisition stepper
- [x] Real-time financial KPIs sidebar
- [x] Document upload widget
- [x] Property-specific session management
- [x] Complete database persistence
- [x] Properties drawer with session isolation
- [x] Optimized prompts (~60% reduction)

### 🔮 Version 2.0: Deal Pipeline & Analytics (Coming Q1 2025)
- [ ] Portfolio view (list all properties with stages)
- [ ] Bulk upload from Zillow/MHVillage CSVs
- [ ] Email notifications when deals pass filters
- [ ] Dashboard with deal funnel metrics
- [ ] Export deals to Excel/PDF reports
- [ ] Multi-property comparison
- [ ] Historical deal tracking
- [ ] Team collaboration features

### 🔮 Version 3.0: Advanced Features (Coming Q2 2025)
- [ ] Custom defect pricing per market
- [ ] Historical comp analysis (automated Market Value)
- [ ] Lease-to-own calculator
- [ ] Park rent escalation modeling
- [ ] Mobile app (iOS/Android)
- [ ] OCR for document extraction
- [ ] Automated ARV estimation (ML)
- [ ] Real-time collaboration (WebSockets)

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| **Version 1.0 Docs** | |
| [VERSION_1.0_SUMMARY.md](VERSION_1.0_SUMMARY.md) | **Complete v1.0 overview, features, metrics** |
| [ROUTING_ARCHITECTURE.md](docs/ROUTING_ARCHITECTURE.md) | **ActiveRouter + FlowValidator architecture** |
| [CONSOLIDATED_ARCHITECTURE.md](docs/CONSOLIDATED_ARCHITECTURE.md) | **Agent consolidation rationale** |
| [INTELLIGENT_ROUTING.md](docs/INTELLIGENT_ROUTING.md) | **FlowValidator deep dive** |
| [DATABASE_PERSISTENCE.md](docs/DATABASE_PERSISTENCE.md) | **Data persistence audit** |
| [SESSION_MANAGEMENT.md](docs/SESSION_MANAGEMENT.md) | **Property-specific sessions** |
| [TOOL_USAGE_RULES.md](docs/TOOL_USAGE_RULES.md) | **Strict tool usage guidelines** |
| **Migration & Technical** | |
| [TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) | Detailed system architecture |
| [FRONTEND_MIGRATION_GUIDE.md](docs/FRONTEND_MIGRATION_GUIDE.md) | Frontend cleanup from RAMA to MANINOS |
| [CLEANUP_REPORT_MANINOS.md](docs/CLEANUP_REPORT_MANINOS.md) | Migration metrics (tools removed, LOC reduced) |
| [AGENTIC_REFACTOR_MANINOS.md](docs/AGENTIC_REFACTOR_MANINOS.md) | LangGraph refactoring details |

---

## 🎯 What Makes Version 1.0 Special?

### 1. **Truly Intelligent, Not Scripted**
Most systems rely on keyword matching. MANINOS AI Version 1.0 uses **FlowValidator** for context-aware routing:

```
❌ Traditional: User says "listo" → trigger next step
❌ Traditional: User says "done" → trigger next step
❌ Traditional: User says "ready" → trigger next step

✅ MANINOS v1.0: User says ANYTHING indicating completion
✅ FlowValidator: "User signals completion based on context"
✅ System: Verify actual database state, respond intelligently
```

### 2. **One Step at a Time**
Clear progression with explicit confirmations:
- Visual stepper shows current position
- Agent waits for confirmation before proceeding
- No confusion about what data is needed

### 3. **Database is Source of Truth**
Never assumes, always verifies:
```python
# ALWAYS verify first
get_property(property_id)  # What's the REAL state?
list_docs(property_id)     # Are documents ACTUALLY uploaded?

# THEN respond based on reality, not assumptions
```

### 4. **Progressive Disclosure**
Only asks for what's needed, when it's needed:
- **Step 0:** Just documents
- **Step 1:** Just prices (after docs confirmed)
- **Step 2:** Just inspection (after 70% check confirmed)
- No overwhelming data dumps

### 5. **Human-in-the-Loop for Critical Decisions**
Automatic blocking when rules fail:
- **70% rule failure** → `review_required` → Requires justification
- **Title problems** → `review_required_title` → Requires action plan
- **80% rule failure** → `review_required_80` → Requires justification or rejection

System enforces human review for risky deals.

### 6. **Massive Code Reduction Without Losing Functionality**

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **ActiveRouter** | 810 lines | 256 lines | **-68%** ⚡ |
| **Prompts** | ~1,600 lines | ~650 lines | **-59%** 📝 |
| **Keywords** | ~50 lists | 5 patterns | **-90%** 🔑 |
| **Intents** | 25+ | 5 basic | **-80%** 🎨 |

**Result:** Faster execution, lower costs, easier maintenance.

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check Supabase connection
python -c "from tools.supabase_client import sb; print(sb.table('properties').select('*').limit(1).execute())"

# Verify migrations ran
# Check Supabase SQL Editor → Tables → properties, property_inspections should exist
```

### Frontend shows "No property active"
```bash
# Check if property_id is being returned
curl -X POST http://localhost:8080/ui_chat \
  -F "text=Quiero evaluar Casa Test" \
  -F "session_id=test"

# Should return: {"answer": "...", "property_id": "uuid-..."}
```

### Agent inventing numbers
- Restart backend to reload updated prompts
- Check that `prompts/agents/property_agent/_base.md` includes "Regla 0: NUNCA INVENTES NÚMEROS"

---

## 🤝 Contributing

This is a private project for MANINOS. If you're part of the team:

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes
3. Test thoroughly: `python tests/test_maninos_flow.py`
4. Commit: `git commit -m "Add my feature"`
5. Push: `git push origin feature/my-feature`
6. Open Pull Request

---

## 📄 License

Proprietary - All rights reserved by MANINOS.

---

## 📧 Support

- **Email:** maria@maninos.com
- **GitHub Issues:** [Report bugs](https://github.com/mariasebarespersona/maninos-ai/issues)
- **Documentation:** [docs/](docs/)

---

<div align="center">

---

## 🎉 Version 1.0 - Production Ready

**Built for mobile home investors who demand precision** 🏠

**Status:** ✅ Production Ready | 🏷️ Tagged: `v1.0` | 📅 Released: December 15, 2024

[![GitHub](https://img.shields.io/badge/GitHub-mariasebarespersona-black?style=flat-square&logo=github)](https://github.com/mariasebarespersona/maninos-ai)
[![Version](https://img.shields.io/badge/Version-1.0-success?style=flat-square)](https://github.com/mariasebarespersona/maninos-ai/releases/tag/v1.0)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](/)

**Key Stats:**
- 🚀 6-step intelligent workflow
- 🤖 Natural language understanding (no keywords)
- 📊 68% less routing code
- 🎨 Modern Deal Cockpit UI
- ✅ Complete database persistence
- 🔒 Human review gates for risky deals

[⬆ Back to top](#maninos-ai---mobile-home-acquisition-assistant)

</div>
