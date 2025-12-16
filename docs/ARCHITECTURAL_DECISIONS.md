# Architectural Decision Records (ADR) - MANINOS AI

**Purpose:** Explain the "why" behind key architectural decisions

**Last Updated:** December 16, 2024

---

## Table of Contents

1. [ADR-001: One Agent for Linear Workflow](#adr-001-one-agent-for-linear-workflow)
2. [ADR-002: Data-Driven Routing Over Keywords](#adr-002-data-driven-routing-over-keywords)
3. [ADR-003: Modular Prompt System](#adr-003-modular-prompt-system)
4. [ADR-004: FlowValidator as Routing Brain](#adr-004-flowvalidator-as-routing-brain)
5. [ADR-005: Tools Auto-Update Stages](#adr-005-tools-auto-update-stages)
6. [ADR-006: Blocking Stages for Human Review](#adr-006-blocking-stages-for-human-review)
7. [ADR-007: PostgreSQL Checkpointing](#adr-007-postgresql-checkpointing)
8. [ADR-008: No Intermediate Agent Consolidation](#adr-008-no-intermediate-agent-consolidation)
9. [ADR-009: UI Components Not in Chat](#adr-009-ui-components-not-in-chat)
10. [ADR-010: One Tool Per Turn in Critical Steps](#adr-010-one-tool-per-turn-in-critical-steps)

---

## ADR-001: One Agent for Linear Workflow

### Status: ✅ ACCEPTED

### Context

MANINOS AI guides users through a **linear 6-step workflow** for mobile home acquisition. We had two options:

**Option A:** Multiple specialized agents (PropertyAgent, DocsAgent, InspectionAgent, ContractAgent, NumbersAgent)

**Option B:** Single PropertyAgent handles entire workflow

### Decision

✅ **We chose Option B: Single PropertyAgent**

### Rationale

1. **MANINOS is inherently linear** - There's no branching logic or parallel workflows. Users go through Steps 0→1→2→3→4→5 in order.

2. **No multi-domain tasks** - Unlike complex business apps (CRM, ERP), mobile home acquisition is a **single domain** with clear steps.

3. **Context coherence** - A single agent maintains conversation context across all steps. Multi-agent systems lose context when switching agents.

4. **Simpler debugging** - One agent = one code path. Easier to trace issues.

5. **Faster execution** - No inter-agent communication overhead.

### Consequences

✅ **Positive:**
- Simplified codebase (1 agent vs 5 agents)
- No context loss between steps
- Easier to maintain and extend
- Faster execution (no routing overhead)

⚠️ **Negative:**
- PropertyAgent has 22 tools (more than typical specialized agents)
- Longer prompt loading (but cached after first call)

### Alternatives Considered

**Multi-Agent with Orchestrator:**
```
MainAgent
  ↓
PropertyAgent (Steps 1-4)
  ↓
DocsAgent (Step 0)
  ↓
ContractAgent (Step 5)
```

**Why Rejected:** Added complexity without benefits. Linear workflow doesn't need multiple agents.

---

## ADR-002: Data-Driven Routing Over Keywords

### Status: ✅ ACCEPTED

### Context

Early versions used keyword matching for routing:
```python
if "listo" in user_input:
    advance_to_next_step()
```

**Problems:**
- ❌ Fragile: "terminé" ≠ "listo" ≠ "done" ≠ "ya está"
- ❌ Context-blind: "listo" means different things at different steps
- ❌ Non-scalable: Need 50+ keyword lists

### Decision

✅ **We chose data-driven routing with FlowValidator**

```python
# Validate based on ACTUAL DATA
property_data = get_property(property_id)
validation = validate_current_step(property_data)

if validation["is_complete"]:
    advance_to_next_step()
else:
    ask_for_missing_data(validation["missing_data"])
```

### Rationale

1. **Database is source of truth** - User might say "listo" but data might not be complete. Always verify.

2. **Context-aware** - Same input has different meanings at different stages. Validate data + stage combination.

3. **Robust** - Works with any phrasing: "listo", "done", "terminé", "ya está", "siguiente paso", etc.

4. **Fail-safe** - Can't skip steps even if user tries. Data validation prevents it.

### Implementation

```python
# FlowValidator checks data, not words
def validate_current_step(property_data):
    stage = property_data["acquisition_stage"]
    
    if stage == "initial":
        required = ["asking_price", "market_value"]
        missing = [f for f in required if not property_data.get(f)]
        return {"is_complete": len(missing) == 0, "missing_data": missing}
```

### Consequences

✅ **Positive:**
- Robust to phrasing variations
- Context-aware routing
- Can't skip steps
- Easy to add new stages (just define required fields)

⚠️ **Negative:**
- Requires database reads (but they're fast)
- More complex than simple keyword matching

---

## ADR-003: Modular Prompt System

### Status: ✅ ACCEPTED

### Context

**Option A:** Single giant prompt (1500+ lines)
```python
SYSTEM_PROMPT = """
You are PropertyAgent...
[1500 lines of instructions]
"""
```

**Option B:** Modular prompts composed dynamically
```python
_base.md (always loaded)
+ step1_initial.md (loaded for Step 1)
+ step2_inspection.md (loaded for Step 2)
```

### Decision

✅ **We chose Option B: Modular prompts**

### Rationale

1. **Maintainability** - Easier to update specific step instructions without affecting others

2. **Token efficiency** - Only load relevant modules (saves ~40% tokens)

3. **Version control** - Clear diffs when changing step-specific logic

4. **Reusability** - Base prompt shared across all intents

5. **Testing** - Can test individual modules in isolation

### Implementation

```python
from prompts.prompt_loader import build_agent_prompt

# Load base + intent-specific module
prompt = build_agent_prompt("property_agent", intent="property.70_check")
# Loads: _base.md + step1_initial.md
```

**File Structure:**
```
prompts/agents/property_agent/
├── _base.md                # Core rules (always loaded)
├── step0_documents.md      # Document collection
├── step1_initial.md        # 70% Rule
├── step2_inspection.md     # Inspection
├── step4_final.md          # 80% Rule
├── step5_contract.md       # Contract generation
└── examples.md             # Full conversation examples
```

### Consequences

✅ **Positive:**
- 60% shorter prompts (vs monolithic)
- Easier maintenance
- Better version control
- Cached for performance

⚠️ **Negative:**
- Slightly more complex prompt loading logic
- Need to ensure modules are compatible

---

## ADR-004: FlowValidator as Routing Brain

### Status: ✅ ACCEPTED

### Context

How should the system decide which agent handles a request?

**Option A:** Active Router only (keyword-based)
**Option B:** FlowValidator + ActiveRouter (data + keywords)

### Decision

✅ **We chose Option B: Two-layer routing**

```
If property exists:
    FlowValidator (context-aware, data-driven)
Else:
    ActiveRouter (basic keyword matching)
```

### Rationale

1. **Context matters** - When property exists, we have rich context (stage, data completeness). FlowValidator uses this.

2. **Fallback for basic ops** - When no property (list, create, delete), ActiveRouter handles with simple keywords.

3. **Separation of concerns:**
   - FlowValidator: Smart routing for acquisition flow
   - ActiveRouter: Simple routing for CRUD operations

### FlowValidator Capabilities

```python
# 1. Validate data completeness
validation = validate_current_step(property_data)
# → {is_complete: bool, missing_data: [...]}

# 2. Detect user intent from context
intent = detect_user_intent_for_stage(user_input, property_data)
# → {intent: "provide_arv", confidence: 0.85}

# 3. Generate guidance
guidance = get_user_friendly_next_step(property_data)
# → "¿Cuál es el ARV de la propiedad?"
```

### Consequences

✅ **Positive:**
- Intelligent routing based on context
- Can't skip steps (data validation)
- Natural language understanding (not keyword-dependent)
- Provides guidance to agent (via system prompt)

⚠️ **Negative:**
- More complex than single router
- Requires property data fetch

---

## ADR-005: Tools Auto-Update Stages

### Status: ✅ ACCEPTED

### Context

Who should update `acquisition_stage`: agent or tool?

**Option A:** Agent manually updates stage
```python
result = calculate_maninos_deal(...)
if result["checks"]["70_percent_rule"] == "PASS":
    update_acquisition_stage(property_id, "passed_70_rule")
```

**Option B:** Tool auto-updates stage
```python
calculate_maninos_deal(..., property_id=property_id)
# Tool updates stage internally
```

### Decision

✅ **We chose Option B: Tools auto-update stages**

### Rationale

1. **Single source of truth** - Business logic lives in tools, not scattered across agents

2. **Atomic operations** - Stage update happens in same transaction as data update

3. **Prevents errors** - Agent can't forget to update stage

4. **Consistent logic** - Same rules applied every time

### Implementation

```python
# In calculate_maninos_deal()
def calculate_maninos_deal(..., property_id=None):
    # Check 70% Rule
    if asking_price <= market_value * 0.70:
        if property_id:
            update_acquisition_stage(property_id, "passed_70_rule")
    else:
        if property_id:
            update_acquisition_stage(property_id, "review_required")
```

### Consequences

✅ **Positive:**
- Consistent stage updates
- Fewer errors
- Business logic centralized
- Easier to audit

⚠️ **Negative:**
- Tools are slightly more coupled to workflow
- Need to test tool+stage logic together

---

## ADR-006: Blocking Stages for Human Review

### Status: ✅ ACCEPTED

### Context

What happens when business rules fail (70% Rule, 80% Rule, Title problems)?

**Option A:** Warn but allow to proceed
```
Agent: "⚠️ 70% Rule failed. Continuing anyway..."
```

**Option B:** Block with dedicated stages
```
acquisition_stage = "review_required"  # BLOCKED
```

### Decision

✅ **We chose Option B: Blocking stages**

**Blocking Stages:**
- `review_required` (70% Rule failed)
- `review_required_title` (Title problematic)
- `review_required_80` (80% Rule failed)

### Rationale

1. **Enforce human review** - Can't proceed without explicit justification

2. **Audit trail** - Clear in database when rules were violated

3. **Risk management** - Prevents bad deals from slipping through

4. **Compliance** - Human-in-the-loop for critical decisions

### Implementation

```sql
-- Stage enforces blocking
acquisition_stage = 'review_required'

-- Agent must get justification
user: "why should I proceed despite 70% failure?"
agent: [logs justification]
agent: update_acquisition_stage("passed_70_rule")
```

### Consequences

✅ **Positive:**
- Enforced human review
- Clear audit trail
- Prevents bad deals
- Compliance-friendly

⚠️ **Negative:**
- Extra steps for users
- Need UI for justification flow

---

## ADR-007: PostgreSQL Checkpointing

### Status: ✅ ACCEPTED

### Context

How should we persist conversation state?

**Option A:** In-memory (MemorySaver)
- Fast but loses state on restart

**Option B:** SQLite (SqliteSaver)
- Persistent but single-process

**Option C:** PostgreSQL (PostgresSaver)
- Persistent and multi-process

### Decision

✅ **We chose Option C: PostgreSQL with fallback**

```python
if DATABASE_URL:
    checkpointer = PostgresSaver(pool)
else:
    # Local dev only
    checkpointer = SqliteSaver(conn)
```

### Rationale

1. **Production requirement** - Must persist across restarts

2. **Multi-process support** - Supabase + Vercel need shared state

3. **Already using Supabase** - No extra infrastructure

4. **Scalability** - Handles concurrent sessions

### Implementation

```python
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool

pool = ConnectionPool(
    conninfo=DATABASE_URL,
    min_size=1,
    max_size=10,
    keepalives=1
)
checkpointer = PostgresSaver(pool)
```

**Table Created:**
```sql
CREATE TABLE checkpoints (
    thread_id TEXT,
    checkpoint_id TEXT,
    parent_id TEXT,
    checkpoint JSONB,
    metadata JSONB,
    PRIMARY KEY (thread_id, checkpoint_id)
);
```

### Consequences

✅ **Positive:**
- Persistent state
- Multi-process safe
- Scalable
- Uses existing infrastructure

⚠️ **Negative:**
- Requires DATABASE_URL in production
- Slightly slower than in-memory (but acceptable)

---

## ADR-008: No Intermediate Agent Consolidation

### Status: ✅ ACCEPTED

### Context

Should we consolidate DocsAgent into PropertyAgent?

**Old Architecture:**
```
MainAgent
  ↓
PropertyAgent (Steps 1-5)
  ↓
DocsAgent (Step 0)
```

**New Architecture:**
```
MainAgent
  ↓
PropertyAgent (Steps 0-5)
```

### Decision

✅ **We consolidated DocsAgent into PropertyAgent**

### Rationale

1. **Step 0 is part of acquisition flow** - Documents are required BEFORE 70% Rule. Not a separate concern.

2. **Context coherence** - PropertyAgent needs document context for Steps 1-5 anyway.

3. **Simpler routing** - No need to switch agents between Step 0 and Step 1.

4. **Single source of truth** - One agent knows entire property state.

### Implementation

```python
# PropertyAgent now has document tools
class PropertyAgent(BaseAgent):
    def get_tools(self):
        return [
            # Property
            add_property_tool,
            get_property_tool,
            
            # Documents (from DocsAgent)
            upload_and_link_tool,
            list_docs_tool,
            rag_qa_with_citations_tool,
            
            # Inspection
            get_inspection_checklist_tool,
            save_inspection_results_tool,
            
            # Financial
            calculate_maninos_deal_tool,
            
            # Contract
            generate_buy_contract_tool
        ]
```

### Consequences

✅ **Positive:**
- Simpler architecture (2 agents → 1 agent)
- No context loss
- Easier to maintain
- Faster (no agent switching)

⚠️ **Negative:**
- PropertyAgent has more tools (22 total)
- Longer tool list (but agents handle this fine)

---

## ADR-009: UI Components Not in Chat

### Status: ✅ ACCEPTED

### Context

Should the agent output the inspection checklist in text form?

**Option A:** Output in chat
```
Agent: "Checklist:
1. Roof - $3000
2. HVAC - $2500
..."
```

**Option B:** Reference UI component
```
Agent: "📋 Usa el checklist interactivo que aparece arriba."
```

### Decision

✅ **We chose Option B: Reference UI, don't duplicate**

### Rationale

1. **UI is more interactive** - Users can check boxes, not copy/paste text

2. **Reduces clutter** - Chat stays focused on conversation

3. **Consistent UX** - All UI widgets follow same pattern

4. **Avoids duplication** - Don't maintain checklist in 2 places (code + prompt)

### Enforced in Prompts

```markdown
# In property_agent/_base.md
🚫 PROHIBIDO:
- NUNCA copies el checklist en texto
- NUNCA muestres los items del checklist (Roof, HVAC, ...)

✅ CORRECTO:
Agent: "📋 Usa el checklist interactivo que aparece arriba."
```

### Consequences

✅ **Positive:**
- Cleaner chat
- Better UX (interactive widgets)
- No duplication
- Easier to change checklist (only change in UI code)

⚠️ **Negative:**
- Requires UI to render widgets
- Agent must trust UI to show components

---

## ADR-010: One Tool Per Turn in Critical Steps

### Status: ✅ ACCEPTED

### Context

Should the agent call multiple tools in one turn?

**Example:**
```python
# Option A: Multiple tools in one turn
user: "precio 20k, market value 30k"
agent: [calculate_maninos_deal()]
       [get_inspection_checklist()]
agent: "✅ 70% OK. Usa el checklist..."

# Option B: One tool per turn
user: "precio 20k, market value 30k"
agent: [calculate_maninos_deal()]
agent: "✅ 70% OK. ¿Proceder con inspección?" ⏸️ WAIT

user: "sí"
agent: [get_inspection_checklist()]
agent: "Usa el checklist..."
```

### Decision

✅ **We chose Option B: One tool per turn in critical steps (Steps 1-2)**

### Rationale

1. **Give users time to understand** - Financial results are important. Users need to read and understand before continuing.

2. **Prevent overwhelming** - Don't show checklist + financial summary at once.

3. **Explicit confirmation** - Users must confirm they want to proceed.

4. **Better UX** - Clear progression through workflow.

### Implementation

```markdown
# In step1_initial.md
🚫 PROHIBIDO:
- NO llames get_inspection_checklist() en el mismo turno que calculate_maninos_deal()

✅ FLUJO CORRECTO:
Turno 1: [calculate_maninos_deal()] → Show summary → WAIT
Turno 2: [get_inspection_checklist()] → Reference UI → WAIT
```

**Exception:** Steps 3-5 can call multiple tools if needed (less critical).

### Consequences

✅ **Positive:**
- Better UX (users understand results)
- Explicit confirmations
- Clear workflow progression
- Less overwhelming

⚠️ **Negative:**
- More turns required (but this is intentional)
- Slightly slower workflow (but safer)

---

## Summary Table

| ADR | Decision | Primary Benefit | Trade-off |
|-----|----------|----------------|-----------|
| 001 | One agent for linear workflow | Simplicity, context coherence | PropertyAgent has 22 tools |
| 002 | Data-driven routing | Robust, context-aware | Requires DB reads |
| 003 | Modular prompts | Maintainability, token efficiency | Slightly complex loading |
| 004 | FlowValidator + ActiveRouter | Intelligent routing | More complex |
| 005 | Tools auto-update stages | Consistency, fewer errors | Tools coupled to workflow |
| 006 | Blocking stages | Enforced human review | Extra steps |
| 007 | PostgreSQL checkpointing | Persistent, scalable | Requires DATABASE_URL |
| 008 | PropertyAgent consolidation | Simpler, no context loss | Longer tool list |
| 009 | UI components not in chat | Cleaner UX, interactive | Requires UI support |
| 010 | One tool per turn (critical) | Better UX, explicit confirms | More turns |

---

## Evolution of Architecture

### Phase 1: Keyword-Based (v0.1)
```
Keyword Router → Agent → Tools
```
**Problem:** Fragile, context-blind

---

### Phase 2: Multi-Agent (v0.5)
```
Orchestrator → PropertyAgent / DocsAgent / NumbersAgent → Tools
```
**Problem:** Context loss, complex routing

---

### Phase 3: Data-Driven + Consolidated (v1.0) ✅
```
Orchestrator → FlowValidator → PropertyAgent → Tools
```
**Benefits:** Robust, simple, context-aware

---

## Lessons Learned

### 1. **Simplicity Wins**
Multi-agent systems look elegant on paper but add complexity. For linear workflows, **one agent is better**.

### 2. **Data > Keywords**
Keyword matching is tempting (fast, simple) but fails in production. **Data validation is robust**.

### 3. **Context is King**
Same input has different meanings at different stages. **Always consider context.**

### 4. **Trust the Tools**
Tools know the business logic. Let them update state. **Don't duplicate logic in agents.**

### 5. **Human in the Loop**
Critical decisions (70% Rule, 80% Rule) should require **human review**. Don't automate everything.

---

## Future Considerations

### When to Add More Agents?

Add a second agent if:
1. ✅ **Multi-domain tasks emerge** (e.g., property management + financial reporting + legal compliance)
2. ✅ **Branching workflows** (e.g., different flows for different property types)
3. ✅ **Truly independent operations** (e.g., background tasks)

**Don't add agents just for "modularity"** - MANINOS v1.0 proves one agent works well.

---

### When to Revisit FlowValidator?

Revisit if:
1. ⚠️ **Many new stages added** (>15 stages)
2. ⚠️ **Complex branching logic** (if/else trees)
3. ⚠️ **Stage transitions become non-linear** (loops, jumps)

Current workflow is linear (0→1→2→3→4→5), so FlowValidator scales well.

---

### When to Refactor Prompts?

Refactor if:
1. ⚠️ **Base prompt exceeds 500 lines**
2. ⚠️ **Step modules duplicate instructions**
3. ⚠️ **New developers can't understand prompts**

Current modular structure (7 files, <200 lines each) is maintainable.

---

## Conclusion

These architectural decisions prioritize:
1. **Simplicity** over complexity
2. **Data validation** over keywords
3. **Context awareness** over generic routing
4. **Robustness** over speed
5. **Maintainability** over premature optimization

**Result:** A system that works reliably in production and is easy to understand and maintain.

---

**Version:** 1.0
**Last Updated:** December 16, 2024
**Contributors:** System Architect (Claude AI), Product Owner (Maria Sebaré)

---

**📖 For implementation details, see:** `DEVELOPER_BIBLE.md`
**⚡ For quick reference, see:** `QUICK_REFERENCE.md`

