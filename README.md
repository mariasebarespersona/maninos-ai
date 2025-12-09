# MANINOS AI - Mobile Home Acquisition Assistant

<div align="center">

🏠 **AI-powered conversational assistant for mobile home investment evaluation**

[![GitHub](https://img.shields.io/badge/GitHub-maninos--ai-blue?style=for-the-badge&logo=github)](https://github.com/mariasebarespersona/maninos-ai)
[![Tech Stack](https://img.shields.io/badge/Stack-LangGraph_+_FastAPI_+_Next.js-green?style=for-the-badge)](/)

</div>

---

## 🎯 What is MANINOS AI?

MANINOS AI is an intelligent assistant that helps mobile home investors evaluate acquisition opportunities through a **strict 5-step workflow**. Built with LangGraph and GPT-4o, it automates:

- 📊 **70% Rule Validation** - Initial soft filter: `Asking Price <= Market Value × 0.70`
- 🔍 **Inspection Management** - Generate checklists, calculate repair costs automatically
- 💰 **80% ARV Rule** - Final hard filter: `(Asking Price + Repairs) <= ARV × 0.80`
- 📄 **Contract Generation** - Auto-generate comprehensive purchase agreements
- 📧 **Document Management** - Upload Zillow/MHVillage PDFs, extract data with RAG

**Use Case:** Evaluate mobile home deals in minutes with confidence in the numbers.

---

## 🔄 The Acquisition Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Initial Submission (70% Rule - Soft Filter)       │
│  Input: Address, Asking Price, Market Value                │
│  Output: PASS → Continue | FAIL → Warning (can proceed)    │
│  Stage: initial → passed_70_rule                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    [User confirms]
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Inspection & Data Collection                      │
│  Input: Defects (roof, hvac, plumbing...), Title Status    │
│  Output: Auto-calculated repair estimate                   │
│  Stage: passed_70_rule → inspection_done                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Repair Calculation (Automatic)                    │
│  Uses DEFECT_COSTS dictionary to calculate total repairs   │
│  Saved to: property.repair_estimate                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 4: Final Validation (80% Rule - Hard Filter)         │
│  Input: ARV (After Repair Value)                           │
│  Formula: (Asking Price + Repairs) <= ARV × 0.80           │
│  Output: PASS → Ready to Buy | FAIL → Rejected             │
│  Stage: inspection_done → passed_80_rule or rejected       │
└─────────────────────────────────────────────────────────────┘
                            ↓
                     [If PASS]
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 5: Contract Generation                               │
│  Generates comprehensive mobile home purchase contract     │
│  Includes: Terms, financials, legal disclaimers            │
│  Stage: passed_80_rule (required)                          │
└─────────────────────────────────────────────────────────────┘
```

### Key Business Rules

| Rule | Formula | Type | Action if Fail |
|------|---------|------|----------------|
| **70% Rule** | `Asking Price <= Market Value × 0.70` | Soft Filter | Warn but allow proceed |
| **80% ARV Rule** | `(Asking + Repairs) <= ARV × 0.80` | Hard Filter | REJECT deal |
| **Title Status** | Must be `Clean/Blue` for contract | Deal Breaker | Block contract generation |

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

### Agents

```
┌─────────────────────────────────────────────┐
│          OrchestrationRouter                │
│  (Intent classification & agent routing)    │
└─────────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌──────────────────┐    ┌──────────────────┐
│  PropertyAgent   │    │   DocsAgent      │
│  (Acquisition)   │    │  (Documents)     │
│                  │    │                  │
│ • 70% Rule       │    │ • Upload PDFs    │
│ • Inspection     │    │ • RAG Q&A        │
│ • 80% ARV        │    │ • List/Delete    │
│ • Contract       │    │ • Email          │
└──────────────────┘    └──────────────────┘
```

### Database Schema

**`properties` table:**
```sql
- id (UUID)
- name, address, park_name
- asking_price, market_value, arv
- repair_estimate, title_status
- status ('New', 'Ready to Buy', 'Rejected', 'Proceed to Inspection')
- acquisition_stage ('initial', 'passed_70_rule', 'inspection_done', 'passed_80_rule', 'rejected')
- created_at, updated_at
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

## 📁 Project Structure

```
maninos-ai/
├── agents/
│   ├── base_agent.py         # Base class with ReAct loop
│   ├── property_agent.py     # Acquisition flow coordinator
│   └── docs_agent.py         # Document management
├── tools/
│   ├── property_tools.py     # CRUD for properties
│   ├── inspection_tools.py   # Inspection checklist & history
│   ├── numbers_tools.py      # 70%/80% calculations, repair costs
│   ├── contract_tools.py     # Contract generation
│   ├── docs_tools.py         # Upload, RAG, signed URLs
│   └── registry.py           # LangChain tool wrappers
├── router/
│   ├── active_router.py      # Intent classification
│   └── orchestrator.py       # Agent coordination
├── prompts/agents/property_agent/
│   ├── _base.md              # Core PropertyAgent instructions
│   ├── step1_initial.md      # 70% Rule flow
│   ├── step2_inspection.md   # Inspection flow
│   ├── step4_final.md        # 80% ARV flow
│   ├── step5_contract.md     # Contract generation flow
│   └── examples.md           # Full conversation examples
├── migrations/
│   ├── 2025-01-01_maninos_init.sql           # Core properties table
│   ├── 2025-01-03_property_inspections.sql   # Inspection history
│   └── 2025-01-05_fix_status_constraint.sql  # Status values
├── web/                      # Next.js frontend
│   ├── src/app/page.tsx      # Chat interface
│   ├── src/components/PropertyHeader.tsx  # Property status display
│   └── src/types/maninos.ts  # TypeScript types
├── agentic.py                # LangGraph StateGraph coordinator
├── app.py                    # FastAPI entry point
└── tests/test_maninos_flow.py # Full workflow tests
```

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

## 📊 Database Migrations

Execute in this order on Supabase SQL Editor:

1. **`2025-01-01_maninos_init.sql`** - Core `properties` table
2. **`2025-01-02_add_acquisition_stage.sql`** - Add `acquisition_stage` column (if upgrading)
3. **`2025-01-03_property_inspections.sql`** - Inspection history table
4. **`2025-01-04_enable_rls_maninos.sql`** - Row Level Security policies
5. **`2025-01-05_fix_status_constraint.sql`** - Fix status CHECK constraint
6. **`2025-12-01_sessions_and_checkpoints.sql`** - LangGraph checkpointer

**All migrations are idempotent** (safe to run multiple times).

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

- 🕒 **Latency per agent** (PropertyAgent, DocsAgent)
- 🔧 **Tool usage** (which tools are called most)
- 💰 **OpenAI cost** (token usage per session)
- 🐛 **Error rates** (failed tool calls, LLM errors)
- 📊 **Acquisition funnel** (how many deals reach contract stage)

Example metrics:
```
PropertyAgent (Step 1 - 70% Check):
  ├─ Avg latency: 2.1s
  ├─ Tool calls: add_property (100%), calculate_maninos_deal (98%)
  └─ Success rate: 99.2%

PropertyAgent (Step 5 - Contract):
  ├─ Avg latency: 3.5s
  ├─ Tool calls: get_property (100%), generate_buy_contract (100%)
  └─ Success rate: 100%
```

---

## 🛣️ Roadmap

### ✅ Phase 1: Acquisition Agent (COMPLETED)
- [x] 70% Rule soft filter
- [x] Inspection checklist with auto-repair calculation
- [x] 80% ARV Rule hard filter
- [x] Contract generation
- [x] Title status validation
- [x] Database persistence with stage tracking
- [x] Frontend UI with property header

### 🔮 Phase 2: Deal Pipeline (Coming Soon)
- [ ] Portfolio view (list all properties with stages)
- [ ] Bulk upload from Zillow/MHVillage CSVs
- [ ] Email notifications when deals pass filters
- [ ] Dashboard with deal funnel metrics
- [ ] Export deals to Excel

### 🔮 Phase 3: Advanced Features
- [ ] Custom defect pricing per market
- [ ] Historical comp analysis (automated Market Value)
- [ ] Lease-to-own calculator
- [ ] Park rent escalation modeling
- [ ] Mobile app (iOS/Android)

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) | Detailed system architecture |
| [FRONTEND_MIGRATION_GUIDE.md](docs/FRONTEND_MIGRATION_GUIDE.md) | Frontend cleanup from RAMA to MANINOS |
| [TEST_RESULTS_MANINOS.md](docs/TEST_RESULTS_MANINOS.md) | Backend test results |
| [CLEANUP_REPORT_MANINOS.md](docs/CLEANUP_REPORT_MANINOS.md) | Migration metrics (tools removed, LOC reduced) |
| [AGENTIC_REFACTOR_MANINOS.md](docs/AGENTIC_REFACTOR_MANINOS.md) | LangGraph refactoring details |

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

**Built for mobile home investors who demand precision** 🏠

[![GitHub](https://img.shields.io/badge/GitHub-mariasebarespersona-black?style=flat-square&logo=github)](https://github.com/mariasebarespersona/maninos-ai)

[⬆ Back to top](#maninos-ai---mobile-home-acquisition-assistant)

</div>
