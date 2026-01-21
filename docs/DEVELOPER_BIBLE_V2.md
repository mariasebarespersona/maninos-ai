# MANINOS AI - Developer Bible v2.0 📖

**Version 2.0** | Last Updated: January 21, 2026

> **⚠️ CRITICAL: READ THIS ENTIRE DOCUMENT BEFORE CODING**
> 
> This document is the **definitive guide** to understanding how MANINOS AI works. Every developer must read and understand this before making any code changes.

---

## Table of Contents

1. [Philosophy & Core Principles](#philosophy--core-principles)
2. [The 6 Macroprocesses (Cadena de Valor)](#the-6-macroprocesses-cadena-de-valor)
3. [System Architecture Overview](#system-architecture-overview)
4. [Intelligent Routing System](#intelligent-routing-system)
5. [Agent System](#agent-system)
6. [Tool System](#tool-system)
7. [Database Schema](#database-schema)
8. [Critical Design Patterns](#critical-design-patterns)
9. [Anti-Patterns (What NOT to Do)](#anti-patterns-what-not-to-do)
10. [Testing Guide](#testing-guide)

---

## Philosophy & Core Principles

### 1. **DATA-DRIVEN, NOT KEYWORD-DRIVEN**

**❌ OLD WAY (Keyword Matching):**
```python
if "cliente" in user_input:
    route_to_incorporar_agent()
```

**✅ NEW WAY (Data Validation):**
```python
# 1. Check if user mentions a specific entity
client = find_client_by_email_or_name(user_input)

if client:
    # 2. Check client's current stage in database
    stage = client["process_stage"]
    
    # 3. Route based on ACTUAL STATE, not keywords
    if stage == "kyc_pending":
        guidance = "Cliente pendiente de KYC. Inicia verificación."
    elif stage == "dti_calculated":
        guidance = "DTI calculado. Siguiente: generar contrato."
    
    return route_to_incorporar_with_context(guidance)
```

**WHY:** Keywords are fragile. "Cliente" could mean "registrar cliente", "consultar cliente", or "info del cliente Carlos". Data validation is robust.

---

### 2. **DATABASE AS SOURCE OF TRUTH**

```python
# ❌ WRONG: Trust user input
if user_says("ya completé el KYC"):
    advance_to_dti_stage()

# ✅ RIGHT: Verify in database
client = get_client(client_id)
if client["kyc_status"] == "verified":
    advance_to_dti_stage()
else:
    ask_to_complete_kyc(client["kyc_status"])
```

**Golden Rule:** Always call `get_client()` or `get_property()` FIRST before making any routing decisions.

---

### 3. **CONTEXT-AWARE INTENT DETECTION**

```python
# The same word means different things in different contexts

# User says "listo" at KYC stage
→ Check if KYC actually complete → If yes, advance to DTI

# User says "listo" at DTI stage  
→ Check if DTI calculated → If yes, advance to contract

# User says "listo" at contract stage
→ Check if contract generated → If yes, advance to GESTIONAR_CARTERA
```

**WHY:** Same input has different meanings at different stages.

---

### 4. **ONE STEP AT A TIME**

```python
# ❌ WRONG: Jumping ahead
user: "Registra cliente Juan, email juan@test.com"
agent: [create_client_profile()]
agent: [start_kyc_verification()]  # ❌ TOO FAST!
agent: [calculate_client_dti()]    # ❌ WAIT!

# ✅ RIGHT: Wait for confirmation
user: "Registra cliente Juan, email juan@test.com"
agent: [create_client_profile()]
agent: "✅ Cliente registrado. ¿Deseas iniciar verificación KYC?" ⏸️ WAIT
user: "sí"
agent: [start_kyc_verification()]
```

**WHY:** Users need time to understand results and make decisions.

---

### 5. **NO DATA INVENTION**

```python
# ❌ WRONG: Making up calculations
agent: "El DTI sería aproximadamente 25%..." (without calling tool)

# ✅ RIGHT: Always use tools
result = calculate_client_dti(client_id, monthly_income=5000, monthly_debts=1250)
agent: f"✅ DTI calculado: {result['dti_percentage']}% - Riesgo: {result['risk_level']}"
```

**WHY:** The agent should never simulate tool behavior with text. If a tool exists, USE IT.

---

## The 6 Macroprocesses (Cadena de Valor)

### Process Relationship Diagram (Cadena de Valor Maninos)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    COMERCIALIZAR (Transversal)                    │  │
│  │          Puede inyectar leads en cualquier momento                │  │
│  │              NO tiene conexiones directas obligatorias            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│        ┌────────────────────────────────────────────────────┐          │
│        │                                                    │          │
│        ↓                                                    │          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐         │
│  │ ADQUIRIR │───→│INCORPORAR│───→│ GESTIONAR│───→│ ENTREGAR │         │
│  │          │    │          │    │ CARTERA  │    │          │         │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘         │
│        ↑                ↑               │                              │
│        │                │               │                              │
│        │                └───────────────│──────────────────┘          │
│        │                  (referidos)   │                              │
│        │                                ↓                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                          FONDEAR                                  │  │
│  │                    (Capital / Inversionistas)                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Connections Explained (6 Flechas Total)

| # | From | To | Reason |
|---|------|-----|--------|
| 1 | Adquirir | Incorporar | Propiedad adquirida → lista para onboard clientes |
| 2 | Incorporar | Gestionar Cartera | Cliente con contrato firmado → gestión de pagos |
| 3 | Gestionar Cartera | Entregar | Pagos completos → entrega de propiedad |
| 4 | Gestionar Cartera | Fondear | Pagos de clientes financian retorno a inversionistas |
| 5 | Fondear | Adquirir | Capital de inversionistas financia compra de propiedades |
| 6 | Entregar | Incorporar | Cliente satisfecho puede volver como referido o nueva compra |

### Important Notes

- **COMERCIALIZAR es TRANSVERSAL**: No tiene conexiones directas obligatorias. Puede inyectar leads/clientes en cualquier momento a cualquier proceso, pero no es un paso obligatorio del flujo.
- **Flujo Lineal Principal**: Adquirir → Incorporar → Gestionar Cartera → Entregar
- **FONDEAR es la BASE**: Proporciona el capital para adquisiciones y recibe los pagos de la cartera.

---

### Process Stages

#### COMERCIALIZAR (Transversal)
| Stage | Description | Tools |
|-------|-------------|-------|
| `lead_registered` | Lead capturado | `register_lead` |
| `visit_scheduled` | Visita programada | `schedule_property_visit` |
| `material_sent` | Material enviado | `send_marketing_material` |
| `converted` | Convertido a cliente | (→ INCORPORAR) |

#### ADQUIRIR
| Stage | Description | Tools |
|-------|-------------|-------|
| `sourcing` | Buscando propiedades | `search_property_sources` |
| `evaluacion` | Evaluando propiedad | `evaluate_property_criteria` |
| `negociacion` | Calculando oferta | `calculate_acquisition_offer` |
| `cierre_compra` | Cerrando compra | `register_property`, `update_property_status` |

#### INCORPORAR
| Stage | Description | Tools |
|-------|-------------|-------|
| `datos_basicos` | Perfil inicial | `create_client_profile`, `get_client_info` |
| `kyc_pending` | Esperando KYC | `start_kyc_verification` |
| `kyc_verified` | KYC verificado | `check_kyc_status` |
| `dti_calculated` | DTI calculado | `calculate_client_dti` |
| `contract_pending` | Contrato pendiente | `generate_rto_contract` |
| `contract_signed` | Contrato firmado | (→ GESTIONAR_CARTERA) |

#### FONDEAR (Week 2)
| Stage | Description | Tools |
|-------|-------------|-------|
| `investor_registered` | Inversionista registrado | - |
| `capital_committed` | Capital comprometido | - |
| `disbursed` | Fondos desembolsados | - |

#### GESTIONAR_CARTERA (Week 2)
| Stage | Description | Tools |
|-------|-------------|-------|
| `active` | Contrato activo | - |
| `payment_pending` | Pago pendiente | - |
| `payment_received` | Pago recibido | - |
| `delinquent` | Morosidad | - |

#### ENTREGAR (Week 2)
| Stage | Description | Tools |
|-------|-------------|-------|
| `pending_delivery` | Pendiente entrega | - |
| `delivered` | Propiedad entregada | - |
| `title_transferred` | Título transferido | - |

---

## System Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INPUT (Natural Language)             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI (app.py)                          │
│  - Receives request                                          │
│  - Extracts session_id, message, context                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              IntelligentRouter (DATA-DRIVEN)                 │
│                                                              │
│  1. Get session state (what process is user in?)            │
│  2. Detect entity references (client/property mentioned?)   │
│  3. Query database for entity state                         │
│  4. Determine routing based on ACTUAL DATA                  │
│  5. Generate flow guidance for agent                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
    ┌──────────────────┐       ┌──────────────────┐
    │ Session Context  │       │  Entity Context  │
    │ (Active process) │       │ (Client/Property)│
    └──────────────────┘       └──────────────────┘
                            ↓
        ┌──────────────────────────────────────┐
        │           AGENT SELECTION            │
        │                                      │
        │  • ComercializarAgent (Marketing)   │
        │  • AdquirirAgent (Properties)       │
        │  • IncorporarAgent (Clients)        │
        │  • FondearAgent (Investors) [W2]    │
        │  • GestionarAgent (Portfolio) [W2]  │
        │  • EntregarAgent (Delivery) [W2]    │
        └──────────────────────────────────────┘
                            ↓
        ┌──────────────────────────────────────┐
        │         BaseAgent (ReAct Loop)       │
        │                                      │
        │  1. Build system prompt with context │
        │  2. Add flow guidance from router    │
        │  3. Bind tools                       │
        │  4. LLM invoke                       │
        │  5. Execute tools                    │
        │  6. Return response                  │
        └──────────────────────────────────────┘
                            ↓
        ┌──────────────────────────────────────┐
        │              TOOLS                   │
        │                                      │
        │  • comercializar_tools.py (7 tools) │
        │  • adquirir_tools.py (5 tools)      │
        │  • incorporar_tools.py (7 tools)    │
        └──────────────────────────────────────┘
                            ↓
        ┌──────────────────────────────────────┐
        │           SUPABASE DB               │
        │                                      │
        │  • clients                          │
        │  • properties                       │
        │  • leads                            │
        │  • rto_contracts                    │
        │  • process_logs                     │
        └──────────────────────────────────────┘
```

---

## Intelligent Routing System

### File: `router/intelligent_router.py`

### Routing Priority

1. **Session State** - Is user already in an active process?
2. **Entity Detection** - Does message reference a client/property?
3. **Database State** - What stage is that entity in?
4. **Intent Fallback** - If no context, detect intent from message

### Example Flow

```python
# User: "Cuál es el estado de Carlos López"

# Step 1: Check session - No active process
# Step 2: Detect entity - Found "Carlos López" → client
# Step 3: Query database:
#         client = { "full_name": "Carlos López", "process_stage": "kyc_pending" }
# Step 4: Route to IncorporarAgent with context:
#         {
#             "current_stage": "kyc_pending",
#             "next_step_guidance": "KYC pendiente. Inicia verificación."
#         }
```

### Key Methods

```python
class IntelligentRouter:
    def route(self, user_input, session_id, context) -> Dict:
        """Main routing method - returns agent + context"""
    
    def _route_by_entity_state(self, user_input, entity_context, context) -> Dict:
        """Route based on entity's database state"""
    
    def _route_by_client_state(self, user_input, client_data, client_id) -> Dict:
        """Specific routing logic for clients"""
    
    def _detect_entity_context(self, user_input, session_id) -> Dict:
        """Detect if user mentions a client or property"""
```

---

## Agent System

### Agent Hierarchy

```
BaseAgent (Abstract)
    ├── ComercializarAgent (7 tools)
    │     Marketing, leads, referrals, visits
    │
    ├── AdquirirAgent (5 tools)
    │     Property sourcing, evaluation, offers
    │
    ├── IncorporarAgent (7 tools)
    │     Client onboarding, KYC, DTI, contracts
    │
    ├── FondearAgent (Week 2)
    │     Investor management
    │
    ├── GestionarCarteraAgent (Week 2)
    │     Portfolio, payments
    │
    └── EntregarAgent (Week 2)
          Property delivery, title transfer
```

### Agent Structure

Each agent MUST implement:

```python
class MyAgent(BaseAgent):
    name: str = "MyAgent"
    description: str = "What this agent does"
    
    def get_system_prompt(self) -> str:
        """Return the system prompt (from prompts/agents/my_agent/_base.md)"""
    
    def get_tools(self) -> List:
        """Return list of LangChain tools"""
    
    def process(self, user_input, session_id, context) -> Dict:
        """Process user request (inherited from BaseAgent)"""
```

### Agent Tools Summary

| Agent | # Tools | Key Tools |
|-------|---------|-----------|
| ComercializarAgent | 7 | `generate_referral_code`, `register_lead`, `get_property_catalog`, `schedule_property_visit`, `get_marketing_metrics` |
| AdquirirAgent | 5 | `search_property_sources`, `evaluate_property_criteria`, `calculate_acquisition_offer`, `register_property`, `update_property_status` |
| IncorporarAgent | 7 | `create_client_profile`, `get_client_info`, `start_kyc_verification`, `check_kyc_status`, `calculate_client_dti`, `generate_rto_contract`, `send_client_update` |

---

## Tool System

### Tool File Structure

```
tools/
├── comercializar_tools.py  # 7 tools
├── adquirir_tools.py       # 5 tools
├── incorporar_tools.py     # 7 tools
├── stripe_identity.py      # Stripe KYC integration
└── supabase_client.py      # Database client
```

### Tool Design Principles

1. **Tools update database state automatically**
```python
def calculate_client_dti(client_id, monthly_income, monthly_debts):
    # Calculate DTI
    dti = (monthly_debts / monthly_income) * 100
    
    # AUTO-UPDATE client in database
    sb.table("clients").update({
        "dti_score": dti,
        "process_stage": "dti_calculated"  # Advance stage
    }).eq("id", client_id).execute()
    
    return {"dti_percentage": dti, ...}
```

2. **Tools validate state before executing**
```python
def generate_rto_contract(client_id, property_id):
    client = get_client(client_id)
    
    # Validate: Can only generate contract if DTI is calculated
    if client["process_stage"] not in ["dti_calculated", "contract_pending"]:
        return {"ok": False, "error": "DTI must be calculated first"}
    
    # Proceed with contract generation...
```

3. **Tools log actions to process_logs**
```python
def register_property(address, price, ...):
    # Create property
    property_id = create_property(...)
    
    # Log the action
    sb.table("process_logs").insert({
        "entity_type": "property",
        "entity_id": property_id,
        "process": "ADQUIRIR",
        "action": "property_registered",
        "details": {"address": address, "price": price}
    }).execute()
    
    return {"ok": True, "property_id": property_id}
```

---

## Database Schema

### Core Tables

#### `clients` Table
```sql
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Personal Information (Anexo 1)
    full_name TEXT NOT NULL,
    date_of_birth DATE,
    ssn_itin TEXT,
    marital_status TEXT,
    phone TEXT,
    email TEXT UNIQUE,
    current_address TEXT,
    current_city TEXT,
    current_state TEXT,
    current_zip TEXT,
    residence_type TEXT,
    
    -- Employment Information
    employer_name TEXT,
    occupation TEXT,
    employer_address TEXT,
    employer_phone TEXT,
    monthly_income NUMERIC,
    employment_duration TEXT,
    other_income_source BOOLEAN,
    other_income_amount NUMERIC,
    
    -- Credit Information
    loan_amount_requested NUMERIC,
    loan_purpose TEXT,
    desired_term TEXT,
    preferred_payment_method TEXT,
    
    -- References (2)
    reference_1_name TEXT,
    reference_1_phone TEXT,
    reference_1_relationship TEXT,
    reference_2_name TEXT,
    reference_2_phone TEXT,
    reference_2_relationship TEXT,
    
    -- KYC (Stripe Identity)
    kyc_status TEXT DEFAULT 'pending',
    stripe_verification_session_id TEXT,
    stripe_verification_url TEXT,
    
    -- Financial Assessment
    dti_score NUMERIC,
    risk_profile TEXT,
    
    -- Process Tracking
    process_stage TEXT DEFAULT 'datos_basicos',
    profile_completion_percentage INTEGER DEFAULT 0,
    
    -- Referral
    referral_code TEXT,
    referred_by TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `properties` Table
```sql
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Location
    address TEXT,
    park_name TEXT,
    city TEXT,
    state TEXT DEFAULT 'TX',
    zip_code TEXT,
    
    -- Property Details
    hud_number TEXT,
    year_built INTEGER,
    bedrooms INTEGER,
    bathrooms NUMERIC,
    square_feet INTEGER,
    
    -- Financials
    asking_price NUMERIC,
    market_value NUMERIC,
    arv NUMERIC,
    repair_estimate NUMERIC,
    purchase_price NUMERIC,
    
    -- Status
    inventory_status TEXT DEFAULT 'potential',
    acquisition_stage TEXT DEFAULT 'sourcing',
    listing_active BOOLEAN DEFAULT FALSE,
    
    -- Evaluation (26-point checklist)
    evaluation_score INTEGER,
    evaluation_notes JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `leads` Table
```sql
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    source TEXT,
    interest_notes TEXT,
    
    status TEXT DEFAULT 'new',
    assigned_to TEXT,
    
    referral_code TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `process_logs` Table
```sql
CREATE TABLE process_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    entity_type TEXT,  -- 'client', 'property', 'investor'
    entity_id UUID,
    process TEXT,      -- 'COMERCIALIZAR', 'ADQUIRIR', etc.
    action TEXT,       -- 'lead_registered', 'kyc_started', etc.
    details JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Critical Design Patterns

### Pattern 1: Always Read Entity First

```python
# ❌ WRONG: Assume state
if user_input.contains("generar contrato"):
    generate_rto_contract(client_id)

# ✅ RIGHT: Verify state
client = get_client(client_id)
if client["process_stage"] == "dti_calculated":
    generate_rto_contract(client_id)
else:
    ask_to_complete_previous_step(client["process_stage"])
```

### Pattern 2: Flow Guidance in Context

```python
# Router provides guidance to agent
routing_decision = {
    "agent": "IncorporarAgent",
    "context": {
        "current_stage": "kyc_pending",
        "next_step_guidance": "El cliente tiene KYC pendiente. Usa start_kyc_verification para iniciar.",
        "missing_data": []
    }
}

# Agent receives this in its context and follows it
```

### Pattern 3: Tool-Driven Stage Updates

```python
# ❌ WRONG: Manual stage management
calculate_client_dti(...)
update_client_stage(client_id, "dti_calculated")  # Separate call

# ✅ RIGHT: Tool handles it automatically
calculate_client_dti(client_id, ...)
# Stage updated internally by the tool
```

### Pattern 4: Session Continuity

```python
# Session tracks:
# - Active process (which macro-process)
# - Active agent (which agent)
# - Entity ID (which client/property)

# User can continue where they left off without re-explaining
```

---

## Anti-Patterns (What NOT to Do)

### Anti-Pattern 1: Keyword-Only Routing

```python
# ❌ BAD
if "cliente" in message:
    route_to_incorporar()

# ✅ GOOD
entity = detect_entity(message)  # Check if specific client mentioned
if entity:
    routing = route_by_entity_state(entity)  # Check database state
else:
    routing = route_by_intent(message)  # Fallback
```

### Anti-Pattern 2: Skipping Validation

```python
# ❌ BAD: Trust user
if user_says("KYC completado"):
    advance_to_next_stage()

# ✅ GOOD: Verify in database
kyc_status = check_kyc_status(client_id)
if kyc_status == "verified":
    advance_to_next_stage()
```

### Anti-Pattern 3: Multiple Actions Per Turn

```python
# ❌ BAD: Do everything at once
create_client_profile()
start_kyc_verification()
calculate_client_dti()

# ✅ GOOD: One step at a time, wait for confirmation
create_client_profile()
return "✅ Cliente creado. ¿Iniciar verificación KYC?"
# Wait for user response
```

### Anti-Pattern 4: Inventing Data

```python
# ❌ BAD: Make up calculations
agent: "El DTI sería aproximadamente 30%..."

# ✅ GOOD: Always call tools
result = calculate_client_dti(client_id, income, debts)
agent: f"DTI calculado: {result['dti_percentage']}%"
```

---

## Testing Guide

### Test Each Agent's Tools

**ComercializarAgent:**
```
1. "Genera un código de referido para Juan Pérez"
   → Should create unique referral code

2. "Registra un lead: María García, maria@email.com, 555-1234"
   → Should create lead in database

3. "Muéstrame el catálogo de propiedades"
   → Should list active listings

4. "Agenda una visita para el viernes a las 3pm"
   → Should schedule visit

5. "Dame las métricas de marketing"
   → Should show KPIs
```

**AdquirirAgent:**
```
1. "Busca propiedades en Houston"
   → Should search all 9 sources

2. "Evalúa la propiedad en 123 Main St"
   → Should run 26-point checklist

3. "Calcula oferta: valor $80k, ARV $95k, reparaciones $5k"
   → Should calculate using 70% rule

4. "Registra propiedad: 456 Oak Ave, Houston, $65k"
   → Should create in database

5. "Actualiza estado a 'under_contract'"
   → Should update inventory_status
```

**IncorporarAgent:**
```
1. "Registra cliente: Carlos López, carlos@email.com, 555-9876"
   → Should create with partial profile

2. "Consulta info de carlos@email.com"
   → Should return client details + stage

3. "Inicia KYC para Carlos"
   → Should create Stripe verification session

4. "Verifica estado KYC de carlos@email.com"
   → Should return current status

5. "Calcula DTI: ingreso $5000, deudas $1200"
   → Should calculate and assign risk

6. "Genera contrato para Carlos y propiedad 123 Main"
   → Should generate RTO contract text
```

### Verify Database State After Each Action

```sql
-- Check client state
SELECT full_name, process_stage, kyc_status, dti_score 
FROM clients 
WHERE email = 'carlos@email.com';

-- Check property state
SELECT address, acquisition_stage, inventory_status 
FROM properties 
WHERE address ILIKE '%123 Main%';

-- Check process logs
SELECT * FROM process_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## Summary: Golden Rules

1. **ALWAYS query database first** - Don't trust user input
2. **ALWAYS use tools** - Never simulate with text
3. **ONE action per turn** in critical steps
4. **WAIT for confirmation** between stages
5. **DATABASE is source of truth** - Verify state, don't assume
6. **CONTEXT matters** - Same input means different things at different stages
7. **ROUTER provides guidance** - Agent follows flow_context
8. **TOOLS auto-update stages** - Trust the system
9. **LOG all actions** - Use process_logs for traceability
10. **SESSION continuity** - Remember user's active process

---

**Version History:**
- v2.0 (Jan 21, 2026) - Complete rewrite for 6-agent architecture
- v1.0 (Dec 16, 2024) - Original PropertyAgent version

**Contributors:**
- System Architect: Claude (AI Assistant)
- Product Owner: Maria Sebaré

---

**📧 Questions?** Re-read this document first. Then check the code.

**🚀 Ready to Code?** Test with the examples above first.

