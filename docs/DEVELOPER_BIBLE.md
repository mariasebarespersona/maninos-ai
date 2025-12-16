# MANINOS AI - Developer Bible 📖

**Version 1.0** | Last Updated: December 16, 2024

> **⚠️ CRITICAL: READ THIS ENTIRE DOCUMENT BEFORE CODING**
> 
> This document is the **definitive guide** to understanding how MANINOS AI works. Every developer must read and understand this before making any code changes. The architecture is intentionally designed with specific patterns and anti-patterns that must be followed.

---

## Table of Contents

1. [Philosophy & Core Principles](#philosophy--core-principles)
2. [System Architecture Overview](#system-architecture-overview)
3. [The 6-Step Acquisition Workflow](#the-6-step-acquisition-workflow)
4. [Agent System Deep Dive](#agent-system-deep-dive)
5. [Routing System (The Brain)](#routing-system-the-brain)
6. [Tool System & Registry](#tool-system--registry)
7. [Prompt System (Modular Architecture)](#prompt-system-modular-architecture)
8. [State Management & Persistence](#state-management--persistence)
9. [Database Schema & Acquisition Stages](#database-schema--acquisition-stages)
10. [Critical Design Patterns](#critical-design-patterns)
11. [Anti-Patterns (What NOT to Do)](#anti-patterns-what-not-to-do)
12. [Testing & Validation](#testing--validation)
13. [Debugging Guide](#debugging-guide)
14. [Common Gotchas](#common-gotchas)

---

## Philosophy & Core Principles

### 1. **Data-Driven, Not Keyword-Driven**

**❌ OLD WAY (Keyword Matching):**
```python
if "listo" in user_input or "done" in user_input:
    advance_to_next_step()
```

**✅ NEW WAY (Data Validation):**
```python
# Validate actual data state
property_data = get_property(property_id)
validation = validate_current_step(property_data)

if validation["is_complete"]:
    advance_to_next_step()
else:
    ask_for_missing_data(validation["missing_data"])
```

**WHY:** Keywords are fragile ("listo" vs "terminé" vs "ya"). Data validation is robust and reliable.

---

### 2. **Database as Source of Truth**

```python
# WRONG: Never assume
if user_says_done:
    show_next_step()

# RIGHT: Always verify
property_data = get_property(property_id)
if property_data["repair_estimate"] and property_data["repair_estimate"] > 0:
    # Inspection is actually complete
    show_next_step()
```

**Golden Rule:** Always call `get_property(property_id)` FIRST before making any routing decisions.

---

### 3. **One Step at a Time**

```python
# WRONG: Jumping ahead
user: "precio 20k, market value 30k"
agent: [calculate_maninos_deal()]
agent: [get_inspection_checklist()]  # ❌ TOO FAST!

# RIGHT: Wait for confirmation
user: "precio 20k, market value 30k"
agent: [calculate_maninos_deal()]
agent: "✅ 70% Rule PASSED. ¿Deseas proceder con inspección?" ⏸️ WAIT
user: "sí"
agent: [get_inspection_checklist()]
```

**WHY:** Users need time to understand results and make decisions.

---

### 4. **No Data Invention**

```python
# WRONG: Making up data
agent: "El 70% de $40k es $28k..." (without calling tool)

# RIGHT: Always use tools
result = calculate_maninos_deal(asking_price=40000, market_value=40000)
agent: f"✅ 70% Rule: {result['reasoning']}"
```

**WHY:** The agent should never simulate tool behavior with text. If a tool exists, USE IT.

---

### 5. **UI Components Are Not Text**

```python
# WRONG: Copying checklist to chat
agent: """
📋 Checklist:
1. Roof - Check condition
2. HVAC - Check systems
...
"""

# RIGHT: Reference the UI
agent: "📋 Usa el checklist interactivo que aparece arriba. Avísame cuando termines."
```

**WHY:** UI components (checklists, document uploaders) are rendered by the frontend. Don't duplicate them in text.

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
│  - Extracts session_id, property_id, user_input             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                 OrchestrationRouter                          │
│  1. Loads conversation history from LangGraph checkpointer   │
│  2. Calls FlowValidator (if property exists)                 │
│  3. Routes to appropriate agent                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
                  ┌─────────┴─────────┐
                  ↓                   ↓
        ┌──────────────────┐  ┌──────────────────┐
        │ FlowValidator    │  │ ActiveRouter     │
        │ (Smart Routing)  │  │ (Basic Routing)  │
        └──────────────────┘  └──────────────────┘
                  ↓
        ┌──────────────────┐
        │  PropertyAgent   │  ← Single agent for entire flow
        │  (or MainAgent)  │
        └──────────────────┘
                  ↓
        ┌──────────────────┐
        │   BaseAgent      │
        │   (ReAct Loop)   │
        │  1. Get system   │
        │     prompt       │
        │  2. Bind tools   │
        │  3. LLM invoke   │
        │  4. Execute      │
        │     tools        │
        │  5. Repeat       │
        └──────────────────┘
                  ↓
        ┌──────────────────┐
        │   TOOLS          │
        │  - Property      │
        │  - Inspection    │
        │  - Numbers       │
        │  - Contract      │
        │  - Documents     │
        └──────────────────┘
                  ↓
        ┌──────────────────┐
        │   SUPABASE DB    │
        │  - properties    │
        │  - inspections   │
        │  - documents     │
        │  - contracts     │
        └──────────────────┘
```

---

### Key Components

| Component | Purpose | Lines of Code | Key Files |
|-----------|---------|---------------|-----------|
| **FastAPI** | HTTP API, session management | ~100 | `app.py` |
| **OrchestrationRouter** | Agent routing & coordination | ~390 | `router/orchestrator.py` |
| **FlowValidator** | Intelligent context-aware routing | ~305 | `router/flow_validator.py` |
| **ActiveRouter** | Basic intent classification | ~258 | `router/active_router.py` |
| **BaseAgent** | ReAct loop, tool execution | ~685 | `agents/base_agent.py` |
| **PropertyAgent** | Complete acquisition flow | ~317 | `agents/property_agent.py` |
| **Tools** | Business logic | ~2000+ | `tools/*.py` |
| **Prompt System** | Modular prompts | ~215 | `prompts/prompt_loader.py` |
| **LangGraph** | State management | ~466 | `agentic.py` |

---

## The 6-Step Acquisition Workflow

### Overview

MANINOS AI guides users through a **linear, step-by-step process** for evaluating mobile home acquisitions. Each step must be completed before advancing to the next.

```
┌──────────────────────────────────────────────────────────────┐
│  STEP 0: Document Collection (NEW in v1.0)                  │
│  Input: Title Status, Property Listing, Property Photos     │
│  Output: Documents validated                                 │
│  Stage: documents_pending → initial                          │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 1: 70% Rule Check (Initial Viability)                 │
│  Input: Asking Price, Market Value                          │
│  Output: PASS → passed_70_rule | FAIL → review_required     │
│  Formula: Asking Price <= Market Value × 0.70               │
└──────────────────────────────────────────────────────────────┘
                            ↓
                    [User confirms]
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 2: Interactive Inspection                             │
│  Input: Defects (via UI checkboxes), Title Status           │
│  Output: Auto-calculated repair_estimate                    │
│  Stage: passed_70_rule → inspection_done                     │
│         OR review_required_title (if title problematic)      │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 3: ARV Collection                                     │
│  Input: ARV (After Repair Value)                            │
│  Note: No tool call - just conversation                     │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 4: 80% ARV Rule (Final Validation)                    │
│  Formula: (Asking Price + Repairs) <= ARV × 0.80            │
│  Output: PASS → passed_80_rule                              │
│          FAIL → review_required_80 (BLOCKED)                │
└──────────────────────────────────────────────────────────────┘
                            ↓
                     [If PASS]
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 5: Contract Generation                                │
│  Output: Comprehensive purchase agreement                   │
│  Stage: passed_80_rule → contract_generated                 │
└──────────────────────────────────────────────────────────────┘
```

---

### Acquisition Stages (Database States)

| Stage | Meaning | Next Valid Stages | Tools Used |
|-------|---------|-------------------|------------|
| `documents_pending` | Step 0: Waiting for documents | `initial` | `list_docs()`, `upload_and_link()` |
| `initial` | Step 1: Ready for 70% check | `passed_70_rule`, `review_required` | `calculate_maninos_deal()` |
| `review_required` | Step 1: 70% FAILED (BLOCKED) | `passed_70_rule`, `rejected` | Manual justification |
| `passed_70_rule` | Step 2: Ready for inspection | `inspection_done`, `review_required_title` | `get_inspection_checklist()`, `save_inspection_results()` |
| `review_required_title` | Step 2: Title problem (BLOCKED) | `inspection_done`, `rejected` | Manual action plan |
| `inspection_done` | Step 3: Ready for ARV | `passed_80_rule`, `review_required_80` | `calculate_maninos_deal()` |
| `review_required_80` | Step 4: 80% FAILED (BLOCKED) | `passed_80_rule`, `rejected` | Manual justification |
| `passed_80_rule` | Step 5: Ready for contract | `contract_generated` | `generate_buy_contract()` |
| `contract_generated` | Step 5: Complete! | None | None |
| `rejected` | Deal rejected | None | None |

**CRITICAL:** These stages enforce workflow order. You CANNOT skip steps.

---

### Business Rules

| Rule | Formula | Type | Action if Fail |
|------|---------|------|----------------|
| **70% Rule** | `Asking Price <= Market Value × 0.70` | Soft Filter | BLOCKED → `review_required` |
| **Title Status** | Must be `Clean/Blue` | Deal Breaker | BLOCKED → `review_required_title` |
| **80% ARV Rule** | `(Asking + Repairs) <= ARV × 0.80` | Hard Filter | BLOCKED → `review_required_80` OR `rejected` |

---

## Agent System Deep Dive

### Agent Hierarchy

```
BaseAgent (Abstract)
    ↓
    ├─ PropertyAgent (Complete acquisition flow + documents)
    │   - Handles Steps 0-5
    │   - Has 22 tools
    │   - Primary agent for MANINOS
    │
    └─ MainAgent (Fallback for general conversation)
        - Handles status queries
        - General chat
        - Has 4 read-only tools
```

---

### BaseAgent: The Foundation

**File:** `agents/base_agent.py` (685 lines)

**Key Responsibilities:**
1. **ReAct Loop**: Execute tools iteratively until task complete
2. **Tool Execution**: Call tools and capture results
3. **Context Management**: Load conversation history from checkpointer
4. **Message Sanitization**: Remove orphaned tool calls
5. **Context Pruning**: Reduce token count (84% reduction for `list_docs`)

**ReAct Loop Flow:**

```python
def run(self, user_input, property_id, context):
    # 1. Build messages
    messages = [
        SystemMessage(content=self.get_system_prompt(context)),
        *history_messages,
        HumanMessage(content=user_input)
    ]
    
    # 2. ReAct Loop (max 5 iterations)
    for iteration in range(5):
        # Invoke LLM with tools
        response = llm_with_tools.invoke(messages)
        
        # Check for tool calls
        if not response.tool_calls:
            break  # Done
        
        # Execute tools
        for tool_call in response.tool_calls:
            result = execute_tool(tool_call)
            messages.append(ToolMessage(content=result))
    
    # 3. Return final response
    return {
        "action": "complete",
        "response": response.content,
        "tool_calls": response.tool_calls
    }
```

**Critical Methods:**

```python
# Must be overridden by subclasses
def get_system_prompt(self, context) -> str
def get_tools(self) -> List[Tool]

# Optional overrides for routing
def is_out_of_scope(self, user_input) -> tuple[bool, str]
def is_multi_domain(self, user_input) -> bool
```

---

### PropertyAgent: The Workhorse

**File:** `agents/property_agent.py` (317 lines)

**Responsibilities:**
- **Complete 6-step workflow** (documents → contract)
- **22 tools** (property, inspection, documents, contract)
- **Modular prompts** (loads from `prompts/agents/property_agent/`)
- **Auto-stage updates** (e.g., documents_pending → initial)

**Tools Available:**

```python
# Property Management
add_property_tool
set_current_property_tool
list_properties_tool
delete_property_tool
find_property_tool
get_property_tool
update_property_fields_tool

# Financial Calculations
calculate_repair_costs_tool
calculate_maninos_deal_tool

# Inspection
get_inspection_checklist_tool
save_inspection_results_tool

# Contract
generate_buy_contract_tool

# Documents (from DocsAgent in old version)
upload_and_link_tool
list_docs_tool
delete_document_tool
signed_url_for_tool
rag_qa_with_citations_tool
qa_document_tool
summarize_document_tool
send_email_tool
```

**Key Override: Post-Processing**

```python
def run(self, user_input, property_id, context):
    result = super().run(user_input, property_id, context)
    
    # AUTO-UPDATE: If documents complete, advance stage
    if property_id and stage == "documents_pending":
        docs = list_docs(property_id)
        doc_types = {d["document_type"] for d in docs}
        required = {"title_status", "property_listing", "property_photos"}
        
        if required.issubset(doc_types):
            update_property_fields(property_id, {
                "acquisition_stage": "initial"
            })
    
    return result
```

---

## Routing System (The Brain)

The routing system is the **intelligence layer** that decides which agent handles a request.

### Three-Layer Routing Architecture

```
Layer 1: OrchestrationRouter (Coordinator)
    ↓
Layer 2a: FlowValidator (Context-aware routing when property exists)
    ↓
Layer 2b: ActiveRouter (Basic routing when no property)
    ↓
Layer 3: Agent Execution (PropertyAgent or MainAgent)
```

---

### Layer 1: OrchestrationRouter

**File:** `router/orchestrator.py` (390 lines)

**Key Responsibilities:**
1. Load conversation history from LangGraph checkpointer
2. Call FlowValidator if property exists
3. Call ActiveRouter if no property
4. Execute agents with bidirectional routing support
5. Handle redirects/escalations

**Critical Flow:**

```python
async def route_and_execute(user_input, session_id, property_id):
    # 1. Load property data
    if property_id:
        property_data = get_property(property_id)
        
        # 2. Validate current step with FlowValidator
        flow_validation = flow_validator.validate_current_step(property_data)
        
        # 3. Detect user intent
        user_intent = flow_validator.detect_user_intent_for_stage(
            user_input, property_data
        )
        
        # 4. Get next step guidance
        next_step_guidance = flow_validator.get_user_friendly_next_step(
            property_data
        )
        
        # 5. Add to context for agent
        context["flow_validation"] = flow_validation
        context["user_intent_analysis"] = user_intent
        context["next_step_guidance"] = next_step_guidance
    
    # 6. Route to agent
    agent = flow_validation["recommended_agent"]
    
    # 7. Execute agent
    result = agent.run(user_input, property_id, context)
```

---

### Layer 2a: FlowValidator (The Smart Router)

**File:** `router/flow_validator.py` (305 lines)

**Philosophy:** **CONTEXT-AWARE, NOT KEYWORD-BASED**

**Key Methods:**

#### 1. `validate_current_step(property_data)`

Validates if the current step has all required data.

```python
def validate_current_step(property_data: Dict) -> Dict:
    """
    Returns:
        {
            "is_complete": bool,
            "missing_data": List[str],
            "current_step": str,
            "next_step": str,
            "recommended_agent": str
        }
    """
    stage = property_data["acquisition_stage"]
    
    if stage == "initial":
        # Step 1: Need asking_price and market_value
        required = ["asking_price", "market_value"]
        missing = [f for f in required if not property_data.get(f)]
        
        return {
            "is_complete": len(missing) == 0,
            "missing_data": missing,
            "current_step": "Paso 1: 70% Rule Check",
            "recommended_agent": "PropertyAgent"
        }
```

**WHY THIS MATTERS:** We don't check if user said "listo". We check if the DATA exists.

---

#### 2. `detect_user_intent_for_stage(user_input, property_data)`

Interprets user input **based on context**.

```python
def detect_user_intent_for_stage(user_input, property_data):
    stage = property_data["acquisition_stage"]
    validation = validate_current_step(property_data)
    
    # Example: User says "listo" at inspection_done stage
    completion_phrases = ["listo", "done", "terminé"]
    if any(phrase in user_input.lower() for phrase in completion_phrases):
        return {
            "intent": "signal_complete",
            "confidence": 0.90,
            "reason": "User signaling completion"
        }
    
    # Example: User provides ARV number when it's missing
    if stage == "inspection_done" and "arv" in validation["missing_data"]:
        numbers = re.findall(r'\$?[\d,]+', user_input)
        if numbers:
            return {
                "intent": "provide_arv",
                "confidence": 0.85,
                "reason": "User provided number, likely ARV"
            }
```

**WHY THIS MATTERS:** Same input ("listo") has different meanings at different stages.

---

#### 3. `get_user_friendly_next_step(property_data)`

Generates natural language guidance for the agent.

```python
def get_user_friendly_next_step(property_data):
    stage = property_data["acquisition_stage"]
    validation = validate_current_step(property_data)
    
    if stage == "inspection_done" and "arv" in validation["missing_data"]:
        return "¿Cuál es el **ARV** (After Repair Value) - el valor después de reparaciones?"
```

**This guidance is passed to the agent's system prompt**, so the LLM knows exactly what to ask.

---

### Layer 2b: ActiveRouter (The Simple Router)

**File:** `router/active_router.py` (258 lines)

**Philosophy:** Fast keyword-based classification for **basic operations only**.

**Handles:**
1. `property.create` - Detect new address
2. `property.list` - List all properties
3. `property.delete` - Delete a property
4. `property.switch` - Switch to another property
5. `general_conversation` - Fallback

**Does NOT Handle:**
- Acquisition flow (FlowValidator's job)
- Completion signals (FlowValidator's job)
- Documents (FlowValidator's job)

**Example:**

```python
def predict_keywords(user_text, context):
    # Detect address pattern
    if ADDRESS_PATTERN.search(user_text):
        create_verbs = ["evaluar", "analizar", "nueva", "crear"]
        if any(verb in user_text.lower() for verb in create_verbs):
            return ("property.create", 0.95, "PropertyAgent")
    
    # List properties
    if "lista" in user_text and "propiedad" in user_text:
        return ("property.list", 0.92, "PropertyAgent")
```

---

## Tool System & Registry

### Tool Architecture

Tools are the **business logic layer**. They perform actual operations (database, calculations, external APIs).

**File Structure:**

```
tools/
├── property_tools.py      # CRUD for properties
├── inspection_tools.py    # Inspection checklist & results
├── numbers_tools.py       # 70%/80% calculations, repair costs
├── contract_tools.py      # Contract generation
├── docs_tools.py          # Document upload, RAG, signed URLs
├── email_tool.py          # Email sending (Resend API)
└── registry.py            # LangChain tool wrappers
```

---

### Tool Registry Pattern

**File:** `tools/registry.py`

All tools must be registered in `registry.py` to be available to agents.

```python
from langchain.tools import StructuredTool

# Wrap Python function as LangChain tool
add_property_tool = StructuredTool.from_function(
    func=add_property,
    name="add_property",
    description="Create a new mobile home property for evaluation",
    args_schema=AddPropertySchema  # Pydantic schema
)

# Export in TOOLS list
TOOLS = [
    add_property_tool,
    get_property_tool,
    calculate_maninos_deal_tool,
    # ...
]
```

**Why Registry?**
- **Centralized** tool definitions
- **Type safety** with Pydantic schemas
- **Automatic validation** of tool inputs
- **Easy to add/remove** tools

---

### Key Tools Explained

#### 1. `calculate_maninos_deal()` - The Core Business Logic

**File:** `tools/numbers_tools.py`

**Purpose:** Validate 70% and 80% rules, auto-update acquisition_stage.

```python
def calculate_maninos_deal(
    asking_price: float,
    repair_costs: Optional[float] = 0,
    arv: Optional[float] = None,
    market_value: Optional[float] = None,
    property_id: Optional[str] = None
) -> Dict:
    """
    Returns:
        {
            "status": "Ready to Buy" | "Review Required" | "Rejected",
            "checks": {
                "70_percent_rule": "PASS" | "FAIL" | None,
                "80_percent_rule": "PASS" | "FAIL" | None
            },
            "metrics": { ... },
            "reasoning": [ ... ]
        }
    """
    # Check 70% Rule
    if market_value:
        max_offer = market_value * 0.70
        if asking_price <= max_offer:
            # PASS
            if property_id:
                update_acquisition_stage(property_id, "passed_70_rule")
        else:
            # FAIL
            if property_id:
                update_acquisition_stage(property_id, "review_required")
    
    # Check 80% Rule
    if arv:
        total_investment = asking_price + (repair_costs or 0)
        max_investment = arv * 0.80
        if total_investment <= max_investment:
            # PASS
            if property_id:
                update_acquisition_stage(property_id, "passed_80_rule")
        else:
            # FAIL
            if property_id:
                update_acquisition_stage(property_id, "review_required_80")
```

**CRITICAL:** This tool **auto-updates acquisition_stage** based on results. No manual stage management needed.

---

#### 2. `save_inspection_results()` - Auto-Calculate Repairs

**File:** `tools/inspection_tools.py`

**Purpose:** Save inspection, auto-calculate repair costs, update stage.

```python
def save_inspection_results(
    property_id: str,
    defects: List[str],
    title_status: str,
    notes: Optional[str] = None
) -> Dict:
    """
    Auto-calculates repair_estimate from defects using DEFECT_COSTS.
    Updates property table with repair_estimate and title_status.
    Advances stage to 'inspection_done' or 'review_required_title'.
    """
    # 1. Validate stage (must be passed_70_rule)
    current_stage = get_acquisition_stage(property_id)
    if current_stage not in ['passed_70_rule', 'inspection_done']:
        return {"ok": False, "error": "Must pass 70% rule first"}
    
    # 2. Auto-calculate repairs
    repair_estimate = calculate_repair_costs(defects)["total_cost"]
    
    # 3. Save to property_inspections table
    inspection_id = insert_inspection(property_id, defects, title_status)
    
    # 4. Update property table
    update_data = {
        "repair_estimate": repair_estimate,
        "title_status": title_status
    }
    
    # 5. Advance stage (or block if title problematic)
    if title_status in ["Missing", "Lien"]:
        update_data["acquisition_stage"] = "review_required_title"
    else:
        update_data["acquisition_stage"] = "inspection_done"
    
    update_property_fields(property_id, update_data)
```

**WHY:** Repair costs are **deterministic** (based on DEFECT_COSTS dict), so we auto-calculate instead of asking user.

---

#### 3. `get_inspection_checklist()` - Validation Logic

**File:** `tools/inspection_tools.py`

**CRITICAL VALIDATION:**

```python
def get_inspection_checklist(property_id: Optional[str] = None):
    # Validate: Don't show checklist if already complete
    if property_id:
        prop = get_property(property_id)
        if prop["repair_estimate"] and prop["repair_estimate"] > 0:
            raise ValueError(
                "🚫 ERROR: Inspection already complete!\n"
                "✅ repair_estimate = $X\n"
                "⚠️ YOU MUST:\n"
                "1. Call get_property() to read data\n"
                "2. Ask for ARV to proceed\n"
                "❌ DO NOT call get_inspection_checklist() again!"
            )
    
    return {
        "checklist": MANINOS_INSPECTION_CHECKLIST,
        "defect_costs": DEFECT_COSTS
    }
```

**WHY:** Prevents showing checklist multiple times and confusing the user.

---

### Defect Costs (Standard Pricing)

**File:** `tools/numbers_tools.py`

```python
DEFECT_COSTS = {
    'roof': 3000,
    'hvac': 2500,
    'plumbing': 1500,
    'electrical': 2000,
    'flooring': 1200,
    'windows': 1000,
    'skirting': 800,
    'painting': 1000,
    'appliances': 1500,
    'deck': 1000,
    'other': 500
}
```

**Example:** `["roof", "hvac"]` → $3000 + $2500 = **$5500** total repairs.

---

## Prompt System (Modular Architecture)

### Philosophy: Composable Prompts

**File:** `prompts/prompt_loader.py` (215 lines)

Instead of one giant prompt, MANINOS uses **modular prompts** that are dynamically composed based on:
1. **Agent type** (property_agent, main_agent)
2. **Intent** (property.create, property.inspection, etc.)
3. **Context** (property_name, acquisition_stage, etc.)

---

### Prompt Structure

```
prompts/
├── agents/
│   ├── property_agent/
│   │   ├── _base.md                # Always loaded
│   │   ├── step0_documents.md      # Loaded for Step 0
│   │   ├── step1_initial.md        # Loaded for Step 1
│   │   ├── step2_inspection.md     # Loaded for Step 2
│   │   ├── step4_final.md          # Loaded for Step 4
│   │   ├── step5_contract.md       # Loaded for Step 5
│   │   └── examples.md             # Full examples
│   │
│   └── main_agent/
│       ├── _base.md
│       └── email.md
│
├── policies/
│   ├── safety.md
│   └── tone.md
│
└── prompt_loader.py
```

---

### How It Works

```python
# In PropertyAgent.get_system_prompt()
def get_system_prompt(self, intent=None, property_name=None, context=None):
    # 1. Load base prompt
    base = build_agent_prompt("property_agent", intent)
    
    # 2. Add property context
    property_context = f"\n\n🎯 PROPIEDAD ACTUAL: {property_name}\n"
    
    # 3. Add flow validator guidance
    flow_guidance = ""
    if context and context.get("flow_validation"):
        flow_guidance = f"""
        ═══════════════════════════════════════════
        🎯 FLOW VALIDATOR GUIDANCE - FOLLOW THIS EXACTLY
        ═══════════════════════════════════════════
        
        Current Step: {context["flow_validation"]["current_step"]}
        Status: {"✅ Complete" if context["flow_validation"]["is_complete"] else "⏳ Incomplete"}
        Missing Data: {context["flow_validation"]["missing_data"]}
        
        🚨 MANDATORY ACTION:
        {context["next_step_guidance"]}
        """
    
    return base + property_context + flow_guidance
```

---

### Example: Step 1 Prompt

**File:** `prompts/agents/property_agent/step1_initial.md`

```markdown
# Paso 1: 70% Rule Check

## 🚨 REGLAS CRÍTICAS

### DESPUÉS de llamar `calculate_maninos_deal()`, TÚ DEBES:

1. ✅ MOSTRAR EL ANÁLISIS FINANCIERO COMPLETO
2. ✅ DECIR si PASÓ o NO PASÓ
3. ✅ PREGUNTAR: "¿Deseas proceder con la inspección?"
4. ⏸️ TERMINAR Y ESPERAR

### 🚫 PROHIBIDO:

- NO llames `get_inspection_checklist()` en el mismo turno
- NO copies el checklist
- NO continues sin confirmación

## ✅ FORMATO OBLIGATORIO:

```
✅ PASO 1 COMPLETADO - Regla del 70%

📊 Análisis Financiero:
• Precio de venta: $X
• Valor de mercado: $Y
• Máximo permitido (70%): $Z

✅ El precio CUMPLE con la regla del 70%.

═══════════════════════════════════════════

➡️ Siguiente paso: Inspección

¿Deseas proceder con la inspección?
```
```

---

### Prompt Loading with Caching

```python
# Cache for performance
_PROMPT_CACHE: Dict[str, str] = {}

def load_prompt(relative_path: str, use_cache: bool = True):
    cache_key = str(file_path)
    if use_cache and cache_key in _PROMPT_CACHE:
        return _PROMPT_CACHE[cache_key]
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    _PROMPT_CACHE[cache_key] = content
    return content
```

**WHY:** Prompts are loaded once and cached for performance.

---

## State Management & Persistence

### LangGraph Integration

**File:** `agentic.py` (466 lines)

MANINOS uses **LangGraph** for:
1. **State management** (conversation history)
2. **Checkpointing** (persistent memory)
3. **Tool validation** (before execution)

---

### State Definition

```python
class AgentState(TypedDict):
    input: str | None              # Initial user input
    messages: List[Any]            # Conversation history
    property_id: str | None        # Current property
    property_name: str | None      # Property name
    session_id: str | None         # Session ID
    
    # Tool validation
    awaiting_confirmation: bool
    pending_tool_call: Dict | None
    tool_validation_error: str | None
```

---

### Checkpointing Architecture

```
PostgreSQL (Supabase)
    ↓
PostgresSaver (LangGraph)
    ↓
StateGraph (LangGraph)
    ↓
Agent runs with full history
```

**Critical Flow:**

```python
# In orchestrator.py
if session_id:
    config = {"configurable": {"thread_id": session_id}}
    state = langgraph_agent.get_state(config)
    
    if state and state.values.get("messages"):
        # Load last 25 messages
        history = state.values["messages"][-25:]
        context["history"] = history
```

**WHY:** Agents need conversation history to understand context ("repair estimate" from 3 turns ago).

---

### Persistent Memory Setup

```python
# In agentic.py
database_url = os.getenv("DATABASE_URL")

if database_url:
    from langgraph.checkpoint.postgres import PostgresSaver
    from psycopg_pool import ConnectionPool
    
    pool = ConnectionPool(conninfo=database_url, min_size=1, max_size=10)
    checkpointer = PostgresSaver(pool)
    checkpointer.setup()  # Creates checkpoints table
else:
    # Fallback for local dev
    from langgraph.checkpoint.sqlite import SqliteSaver
    checkpointer = SqliteSaver(conn)
```

**Production Guarantee:**

```python
if os.getenv("ENVIRONMENT") == "production" and not database_url:
    raise ValueError("DATABASE_URL missing in production - would lose memory!")
```

---

## Database Schema & Acquisition Stages

### Core Tables

#### 1. `properties` Table

```sql
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    park_name TEXT,
    
    -- Financial data
    asking_price NUMERIC,
    market_value NUMERIC,
    arv NUMERIC,
    repair_estimate NUMERIC,
    
    -- Status tracking
    status TEXT CHECK (status IN (
        'New',
        'Pending Documents',
        'Review Required',
        'Ready to Buy',
        'Rejected',
        'Under Contract'
    )),
    
    -- Acquisition workflow stage
    acquisition_stage TEXT CHECK (acquisition_stage IN (
        'documents_pending',      -- Step 0
        'initial',                -- Step 1 ready
        'review_required',        -- Step 1 BLOCKED
        'passed_70_rule',         -- Step 2 ready
        'review_required_title',  -- Step 2 BLOCKED
        'inspection_done',        -- Step 3 ready
        'review_required_80',     -- Step 4 BLOCKED
        'passed_80_rule',         -- Step 5 ready
        'contract_generated',     -- Complete
        'rejected'                -- Deal rejected
    )) DEFAULT 'documents_pending',
    
    title_status TEXT CHECK (title_status IN (
        'Clean/Blue',
        'Missing',
        'Lien',
        'Other'
    )),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

#### 2. `property_inspections` Table

```sql
CREATE TABLE property_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    
    defects JSONB,  -- Array: ["roof", "hvac", ...]
    title_status TEXT,
    repair_estimate NUMERIC,
    notes TEXT,
    created_by TEXT DEFAULT 'agent',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Example Record:**

```json
{
    "id": "abc-123",
    "property_id": "prop-456",
    "defects": ["roof", "hvac"],
    "title_status": "Clean/Blue",
    "repair_estimate": 5500,
    "notes": "Good condition overall",
    "created_at": "2024-12-16T10:00:00Z"
}
```

---

#### 3. `contracts` Table

```sql
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    
    contract_text TEXT NOT NULL,
    buyer_name TEXT,
    seller_name TEXT,
    purchase_price NUMERIC,
    deposit_amount NUMERIC,
    closing_date DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

#### 4. `maninos_documents` Table

```sql
CREATE TABLE maninos_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    
    document_type TEXT CHECK (document_type IN (
        'title_status',
        'property_listing',
        'property_photos'
    )),
    document_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,  -- Supabase Storage path
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Example Record:**

```json
{
    "id": "doc-789",
    "property_id": "prop-456",
    "document_type": "title_status",
    "document_name": "Title_Status_Villa_Hermosa.pdf",
    "storage_path": "documents/prop-456/title_status_abc123.pdf",
    "created_at": "2024-12-16T09:00:00Z"
}
```

---

### Stage Transition Diagram

```
documents_pending
    ↓ (3 documents uploaded)
initial
    ↓ (70% Rule called)
    ├─ PASS → passed_70_rule
    └─ FAIL → review_required (BLOCKED)
        ↓ (justification provided)
        passed_70_rule
            ↓ (inspection saved)
            ├─ Title OK → inspection_done
            └─ Title BAD → review_required_title (BLOCKED)
                ↓ (action plan provided)
                inspection_done
                    ↓ (80% Rule called)
                    ├─ PASS → passed_80_rule
                    └─ FAIL → review_required_80 (BLOCKED)
                        ↓ (justification OR rejection)
                        ├─ Justified → passed_80_rule
                        └─ Rejected → rejected
                            ↓ (contract generated)
                            contract_generated
```

---

## Critical Design Patterns

### Pattern 1: Always Read Property First

```python
# WRONG: Assume state
if user_says_done:
    show_checklist()

# RIGHT: Verify state
property_data = get_property(property_id)
if property_data["acquisition_stage"] == "passed_70_rule":
    if property_data["repair_estimate"] == 0:
        # Inspection not done yet
        show_checklist()
    else:
        # Inspection already done
        ask_for_arv()
```

**WHY:** The database is the source of truth, not conversation history.

---

### Pattern 2: One Tool Per Turn (Critical Steps)

```python
# WRONG: Multiple tools in critical steps
def handle_70_check():
    calculate_maninos_deal()
    get_inspection_checklist()  # ❌ TOO FAST!

# RIGHT: Wait for confirmation
def handle_70_check():
    result = calculate_maninos_deal()
    return {
        "response": f"✅ 70% Rule: {result}. ¿Proceder con inspección?",
        "wait_for_confirmation": True
    }
```

**WHY:** Users need time to understand financial results before proceeding.

---

### Pattern 3: Tool-Driven Stage Updates

```python
# WRONG: Manual stage management
calculate_maninos_deal(...)
update_acquisition_stage(property_id, "passed_70_rule")

# RIGHT: Tool handles it automatically
calculate_maninos_deal(..., property_id=property_id)
# Stage updated internally by the tool
```

**WHY:** Reduces errors and ensures consistency.

---

### Pattern 4: Context-Aware Intent Detection

```python
# WRONG: Keyword matching
if "listo" in user_input:
    advance_to_next_step()

# RIGHT: Context + keyword
stage = property_data["acquisition_stage"]
validation = validate_current_step(property_data)

if any(phrase in user_input.lower() for phrase in ["listo", "done"]):
    if validation["is_complete"]:
        advance_to_next_step()
    else:
        ask_for_missing_data(validation["missing_data"])
```

**WHY:** Same word means different things in different contexts.

---

### Pattern 5: Flow Validator Guidance in Prompts

```python
# Add flow guidance to system prompt
flow_guidance = f"""
═══════════════════════════════════════════
🎯 FLOW VALIDATOR GUIDANCE
═══════════════════════════════════════════

Current Step: {flow_validation["current_step"]}
Missing Data: {flow_validation["missing_data"]}

🚨 MANDATORY ACTION:
{next_step_guidance}
"""

system_prompt = base_prompt + property_context + flow_guidance
```

**WHY:** Gives the LLM explicit instructions from the flow validator.

---

## Anti-Patterns (What NOT to Do)

### Anti-Pattern 1: Copying UI Components

```markdown
# ❌ WRONG: Copying checklist
Agent: "Aquí está el checklist:
1. **Roof** - Check roof condition
2. **HVAC** - Check heating systems
..."

# ✅ RIGHT: Reference UI
Agent: "📋 Usa el checklist interactivo que aparece arriba."
```

**WHY:** UI components are rendered by frontend. Don't duplicate.

---

### Anti-Pattern 2: Skipping Tool Calls

```markdown
# ❌ WRONG: Simulating calculation
Agent: "El 70% de $40k es $28k, así que tu oferta está dentro del límite."

# ✅ RIGHT: Call the tool
result = calculate_maninos_deal(asking_price=40000, market_value=40000)
Agent: f"✅ 70% Rule: {result['reasoning']}"
```

**WHY:** Tools contain business logic. Never simulate.

---

### Anti-Pattern 3: Assuming State

```python
# ❌ WRONG: Assume from conversation
if "he subido los documentos" in user_input:
    advance_to_step_1()

# ✅ RIGHT: Verify in database
docs = list_docs(property_id)
if len(docs) >= 3:
    advance_to_step_1()
```

**WHY:** User might say they uploaded but actually didn't. Verify in DB.

---

### Anti-Pattern 4: Not Showing Summaries

```python
# ❌ WRONG: Jump to next step
calculate_maninos_deal()
get_inspection_checklist()

# ✅ RIGHT: Show summary first
result = calculate_maninos_deal()
return f"""
✅ PASO 1 COMPLETADO

📊 Análisis:
{result}

¿Proceder con inspección?
"""
# WAIT for user response
```

**WHY:** Users need to understand results before continuing.

---

### Anti-Pattern 5: Multiple Agents for Linear Flow

```python
# ❌ WRONG: Over-engineering
MainAgent → PropertyAgent → DocsAgent → InspectionAgent → ContractAgent

# ✅ RIGHT: Single agent for linear flow
PropertyAgent handles ALL 6 steps
```

**WHY:** MANINOS is a **linear workflow**, not a multi-domain task. One agent is simpler.

---

## Testing & Validation

### Test Structure

**File:** `tests/test_maninos_flow.py` (450 lines)

Tests validate the **complete 6-step workflow**:

```python
# Test 1: Architecture
assert len(orchestrator.agents) == 1  # Only PropertyAgent
assert "NumbersAgent" not in agents  # Removed

# Test 2: Property Tools
add_property()
get_property()
update_property_fields()

# Test 3: Step 1 - 70% Rule
property = add_property("Test Property")
result = calculate_maninos_deal(asking_price=30000, market_value=50000)
assert result["checks"]["70_percent_rule"] == "PASS"
assert get_acquisition_stage(property_id) == "passed_70_rule"

# Test 4: Step 2 - Inspection
checklist = get_inspection_checklist()
assert len(checklist["checklist"]) == 10
save_inspection_results(property_id, ["roof", "hvac"], "Clean/Blue")
assert get_acquisition_stage(property_id) == "inspection_done"

# Test 5: Step 4 - 80% Rule
update_property_fields(property_id, {"arv": 65000})
result = calculate_maninos_deal(asking_price=30000, repair_costs=5500, arv=65000)
assert result["checks"]["80_percent_rule"] == "PASS"

# Test 6: Step 5 - Contract
contract = generate_buy_contract(property_id, ...)
assert len(contract["contract_text"]) > 0
```

---

### Running Tests

```bash
# Run complete flow test
python tests/test_maninos_flow.py

# Expected output:
# ✅ TEST 1 PASSED: Architecture clean
# ✅ TEST 2 PASSED: Property tools
# ✅ TEST 3 PASSED: 70% Rule
# ✅ TEST 4 PASSED: Inspection
# ✅ TEST 5 PASSED: 80% Rule
# ✅ TEST 6 PASSED: Contract
# 🎉 ALL TESTS PASSED!
```

---

## Debugging Guide

### Common Issues

#### Issue 1: Agent Not Showing Checklist

**Symptom:** User says "sí" after 70% check, but agent doesn't call `get_inspection_checklist()`.

**Debug Steps:**

```python
# 1. Check property state
property_data = get_property(property_id)
print(f"Stage: {property_data['acquisition_stage']}")
print(f"Repair estimate: {property_data['repair_estimate']}")

# 2. Check if already complete
if property_data['repair_estimate'] > 0:
    print("❌ Inspection already done! Don't show checklist.")
else:
    print("✅ OK to show checklist")

# 3. Check prompt
# Does the prompt say "DO NOT show checklist if repair_estimate exists"?
```

---

#### Issue 2: Agent Inventing Numbers

**Symptom:** Agent says "El 70% de $40k es $28k" without calling tool.

**Fix:**

```markdown
# Add to prompt
🚨 CRITICAL RULE:
- NEVER calculate percentages yourself
- ALWAYS call calculate_maninos_deal() for any financial calculation
- If tool exists, USE IT
```

---

#### Issue 3: Stage Not Advancing

**Symptom:** Property stuck at `passed_70_rule` even though inspection saved.

**Debug Steps:**

```python
# 1. Check if inspection actually saved
inspections = get_inspection_history(property_id)
print(f"Inspections: {len(inspections)}")

# 2. Check property data
property_data = get_property(property_id)
print(f"repair_estimate: {property_data['repair_estimate']}")
print(f"title_status: {property_data['title_status']}")
print(f"stage: {property_data['acquisition_stage']}")

# 3. Check save_inspection_results return value
result = save_inspection_results(...)
print(f"Result: {result}")
print(f"New stage: {result['acquisition_stage']}")
```

---

#### Issue 4: Agent Jumping Steps

**Symptom:** Agent shows checklist immediately after 70% check without waiting.

**Fix:**

```markdown
# In step1_initial.md
🚫 PROHIBIDO:
- NO llames get_inspection_checklist() en el mismo turno que calculate_maninos_deal()
- NO continues sin confirmación del usuario

✅ FLUJO CORRECTO:
Turno 1: [calculate_maninos_deal()] → Show summary → WAIT
Turno 2: [get_inspection_checklist()] → Show UI reference → WAIT
```

---

### Logging Best Practices

```python
import logging
logger = logging.getLogger(__name__)

# Log at decision points
logger.info(f"[PropertyAgent] Stage: {stage}, repair_estimate: {repair_estimate}")

# Log tool calls
logger.info(f"[PropertyAgent] Calling calculate_maninos_deal(asking={asking_price})")

# Log state transitions
logger.info(f"[PropertyAgent] Stage transition: {old_stage} → {new_stage}")
```

---

## Common Gotchas

### Gotcha 1: `repair_estimate = 0` vs `repair_estimate = None`

```python
# WRONG: Check truthiness
if property_data["repair_estimate"]:
    # This is False for 0!

# RIGHT: Check explicitly for None
if property_data["repair_estimate"] is not None:
    # This works for 0
```

**WHY:** Inspection might have ZERO defects (valid case), but `repair_estimate=0` is truthy-False.

---

### Gotcha 2: Stage Must Match Step

```python
# WRONG: Call checklist at wrong stage
if stage == "initial":
    get_inspection_checklist()  # ❌ Stage doesn't allow this

# RIGHT: Validate stage first
if stage == "passed_70_rule":
    if repair_estimate == 0:
        get_inspection_checklist()  # ✅ OK
```

**WHY:** Tools validate stage before execution. Wrong stage = error.

---

### Gotcha 3: Document Types Are Exact

```python
# WRONG: Case-insensitive check
if "Title Status" in doc_types:

# RIGHT: Exact match
if "title_status" in doc_types:
```

**Valid document types:**
- `title_status`
- `property_listing`
- `property_photos`

---

### Gotcha 4: Tool Returns Dict, Not Object

```python
# WRONG: Access as attribute
property = get_property(property_id)
stage = property.acquisition_stage  # ❌ Dict doesn't have attributes

# RIGHT: Access as dict
stage = property["acquisition_stage"]  # ✅
```

---

### Gotcha 5: Confirmation Signals Are Varied

```python
# WRONG: Only check one phrase
if user_input == "sí":
    proceed()

# RIGHT: Check multiple variations
confirmation_phrases = ["sí", "si", "yes", "ok", "continuar", "adelante"]
if any(phrase in user_input.lower() for phrase in confirmation_phrases):
    proceed()
```

---

## Summary: Golden Rules

1. **ALWAYS read property first** with `get_property(property_id)`
2. **ALWAYS use tools** - never simulate with text
3. **NEVER copy UI components** (checklist, document uploader)
4. **ONE tool per turn** in critical steps (70% check, checklist)
5. **WAIT for confirmation** between steps
6. **Database is source of truth** - verify state, don't assume
7. **FlowValidator provides guidance** - use it in prompts
8. **Stages enforce workflow** - can't skip steps
9. **Tools auto-update stages** - trust the system
10. **Context matters** - same input has different meanings at different stages

---

## Quick Reference Card

### When User Says "listo" / "done"

```python
# 1. Read property state
property_data = get_property(property_id)
stage = property_data["acquisition_stage"]

# 2. Validate current step
validation = validate_current_step(property_data)

# 3. If complete, advance
if validation["is_complete"]:
    show_next_step()
else:
    ask_for_missing_data(validation["missing_data"])
```

---

### When User Provides Numbers

```python
# 1. Detect context
stage = property_data["acquisition_stage"]
missing = validation["missing_data"]

# 2. Interpret based on context
if stage == "initial" and "asking_price" in missing:
    # It's probably asking_price or market_value
    extract_prices(user_input)
    calculate_maninos_deal(...)

elif stage == "inspection_done" and "arv" in missing:
    # It's probably ARV
    arv = extract_number(user_input)
    calculate_maninos_deal(..., arv=arv)
```

---

### When To Show Checklist

```python
# Check 3 conditions:
if (stage == "passed_70_rule" 
    and repair_estimate == 0 
    and user_confirmed):
    get_inspection_checklist()
```

---

## Conclusion

This document is your **bible** for understanding MANINOS AI. Read it, re-read it, and refer back to it often.

**Key Takeaways:**
- The system is **data-driven**, not keyword-driven
- The **FlowValidator** provides intelligent routing based on context
- **One agent** (PropertyAgent) handles the entire linear workflow
- **Tools auto-update stages** - trust the system
- **Always verify state** before making decisions

When in doubt, **read the database first**.

---

**Version History:**
- v1.0 (Dec 16, 2024) - Initial release

**Contributors:**
- System Architect: Claude (AI Assistant)
- Product Owner: Maria Sebaré

**Last Review:** December 16, 2024

---

**📧 Questions?** Re-read this document. If still unclear, check the code files referenced in each section.

**🚀 Ready to Code?** Run `python tests/test_maninos_flow.py` to validate your understanding.

