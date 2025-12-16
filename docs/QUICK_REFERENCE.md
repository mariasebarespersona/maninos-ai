# MANINOS AI - Quick Reference Guide 🚀

**For developers who have read the Developer Bible**

---

## Architecture Cheat Sheet

```
User → FastAPI → Orchestrator → FlowValidator/ActiveRouter → PropertyAgent → Tools → Database
```

---

## File Structure Quick Map

```
📁 Key Directories:
├── agents/
│   ├── base_agent.py          # ReAct loop (685 lines)
│   └── property_agent.py      # Main agent (317 lines)
├── router/
│   ├── orchestrator.py        # Coordinator (390 lines)
│   ├── flow_validator.py      # Smart routing (305 lines)
│   └── active_router.py       # Basic routing (258 lines)
├── tools/
│   ├── property_tools.py      # CRUD
│   ├── inspection_tools.py    # Checklist
│   ├── numbers_tools.py       # 70%/80% rules
│   ├── contract_tools.py      # Contracts
│   └── docs_tools.py          # Documents
├── prompts/agents/property_agent/
│   ├── _base.md               # Always loaded
│   ├── step1_initial.md       # 70% Rule
│   ├── step2_inspection.md    # Inspection
│   └── step4_final.md         # 80% Rule
└── agentic.py                 # LangGraph state (466 lines)
```

---

## The 6 Steps (Copy-Paste Reference)

```python
STEPS = {
    0: {
        "name": "Document Collection",
        "stage": "documents_pending",
        "required": ["title_status", "property_listing", "property_photos"],
        "next_stage": "initial",
        "tool": "list_docs()"
    },
    1: {
        "name": "70% Rule Check",
        "stage": "initial",
        "required": ["asking_price", "market_value"],
        "next_stage": "passed_70_rule",
        "tool": "calculate_maninos_deal(asking_price, market_value, property_id)"
    },
    2: {
        "name": "Inspection",
        "stage": "passed_70_rule",
        "required": ["repair_estimate", "title_status"],
        "next_stage": "inspection_done",
        "tool": "save_inspection_results(property_id, defects, title_status)"
    },
    3: {
        "name": "ARV Collection",
        "stage": "inspection_done",
        "required": ["arv"],
        "next_stage": None,  # No stage change
        "tool": None  # Just conversation
    },
    4: {
        "name": "80% Rule Check",
        "stage": "inspection_done",
        "required": ["arv"],
        "next_stage": "passed_80_rule",
        "tool": "calculate_maninos_deal(asking_price, repair_costs, arv, market_value, property_id)"
    },
    5: {
        "name": "Contract Generation",
        "stage": "passed_80_rule",
        "required": [],
        "next_stage": "contract_generated",
        "tool": "generate_buy_contract(property_id, ...)"
    }
}
```

---

## Common Code Patterns

### Pattern: Always Read Property First

```python
# ALWAYS start with this
property_data = get_property(property_id)
stage = property_data["acquisition_stage"]
repair_estimate = property_data.get("repair_estimate")
arv = property_data.get("arv")

# Then make decisions
if stage == "passed_70_rule" and repair_estimate == 0:
    get_inspection_checklist()
```

---

### Pattern: Validate Before Acting

```python
from router.flow_validator import get_flow_validator

flow_validator = get_flow_validator()
validation = flow_validator.validate_current_step(property_data)

if validation["is_complete"]:
    advance_to_next_step()
else:
    ask_for_data(validation["missing_data"])
```

---

### Pattern: Tool Calls in Agents

```python
# In PropertyAgent or custom agent
from tools.registry import calculate_maninos_deal_tool

def get_tools(self):
    return [
        add_property_tool,
        get_property_tool,
        calculate_maninos_deal_tool,
        # ... more tools
    ]
```

---

## Stage Transition Cheat Sheet

| Current Stage | User Action | Tool Called | Next Stage |
|---------------|-------------|-------------|------------|
| `documents_pending` | Uploads 3 docs | `list_docs()` | `initial` |
| `initial` | Gives price/value | `calculate_maninos_deal()` | `passed_70_rule` or `review_required` |
| `passed_70_rule` | Confirms inspection | `get_inspection_checklist()` | (no change) |
| `passed_70_rule` | Saves inspection | `save_inspection_results()` | `inspection_done` or `review_required_title` |
| `inspection_done` | Gives ARV | `calculate_maninos_deal()` | `passed_80_rule` or `review_required_80` |
| `passed_80_rule` | Confirms contract | `generate_buy_contract()` | `contract_generated` |

---

## Tool Reference

### Property Tools

```python
# Create
add_property(name: str, address: str) -> Dict

# Read
get_property(property_id: str) -> Dict
list_properties(limit: int = 20) -> List[Dict]
find_property(name: str, address: str = None) -> Dict

# Update
update_property_fields(property_id: str, fields: Dict) -> Dict
update_acquisition_stage(property_id: str, new_stage: str) -> Dict

# Delete
delete_property(property_id: str, purge_docs_first: bool = True) -> Dict
```

---

### Inspection Tools

```python
# Get checklist
get_inspection_checklist(property_id: str = None) -> Dict
# Returns: {
#     "checklist": [...],
#     "defect_costs": {...}
# }

# Save results
save_inspection_results(
    property_id: str,
    defects: List[str],
    title_status: str,
    notes: str = None
) -> Dict
# Returns: {
#     "ok": True,
#     "repair_estimate": 5500,
#     "acquisition_stage": "inspection_done"
# }

# Get history
get_inspection_history(property_id: str, limit: int = 10) -> List[Dict]
```

---

### Numbers Tools

```python
# Calculate repair costs
calculate_repair_costs(defects: List[str]) -> Dict
# Example: ["roof", "hvac"] → {"total_cost": 5500, "breakdown": {...}}

# Calculate deal viability
calculate_maninos_deal(
    asking_price: float,
    repair_costs: float = 0,
    arv: float = None,
    market_value: float = None,
    property_id: str = None
) -> Dict
# Returns: {
#     "status": "Ready to Buy",
#     "checks": {"70_percent_rule": "PASS", "80_percent_rule": "PASS"},
#     "metrics": {...},
#     "reasoning": [...]
# }
```

---

### Contract Tools

```python
generate_buy_contract(
    property_name: str,
    property_address: str,
    asking_price: float,
    market_value: float,
    arv: float,
    repair_costs: float,
    buyer_name: str = "MANINOS LLC",
    seller_name: str = None,
    closing_date: str = None,
    deposit_amount: float = None
) -> Dict
# Returns: {
#     "contract_text": "...",
#     "contract_id": "...",
#     "pdf_url": "..."
# }
```

---

### Document Tools

```python
# Upload
upload_and_link(
    property_id: str,
    file: bytes,
    document_type: str,  # "title_status" | "property_listing" | "property_photos"
    filename: str
) -> Dict

# List
list_docs(property_id: str) -> List[Dict]

# Get signed URL
signed_url_for(document_id: str) -> str

# RAG
rag_qa_with_citations(property_id: str, query: str) -> Dict
```

---

## Defect Costs Reference

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

**Example:** `["roof", "hvac"]` = $3000 + $2500 = **$5500**

---

## FlowValidator Quick Usage

```python
from router.flow_validator import get_flow_validator

validator = get_flow_validator()

# 1. Validate current step
validation = validator.validate_current_step(property_data)
# Returns: {
#     "is_complete": bool,
#     "missing_data": [...],
#     "current_step": "...",
#     "recommended_agent": "PropertyAgent"
# }

# 2. Detect user intent
intent = validator.detect_user_intent_for_stage(user_input, property_data)
# Returns: {
#     "intent": "provide_arv",
#     "confidence": 0.85,
#     "reason": "..."
# }

# 3. Get next step guidance
guidance = validator.get_user_friendly_next_step(property_data)
# Returns: "¿Cuál es el ARV de la propiedad?"
```

---

## Prompt Loading Quick Reference

```python
from prompts.prompt_loader import build_agent_prompt

# Load base prompt only
prompt = build_agent_prompt("property_agent")

# Load with intent (adds step-specific module)
prompt = build_agent_prompt("property_agent", intent="property.70_check")
# Loads: _base.md + step1_initial.md

# Available intents for property_agent:
intents = [
    "property.create",
    "property.list",
    "property.70_check",     # Loads step1_initial.md
    "property.inspection",    # Loads step2_inspection.md
    "property.80_check",      # Loads step4_final.md
    "property.contract",      # Loads step5_contract.md
]
```

---

## Database Queries Quick Reference

```sql
-- Get all properties
SELECT * FROM properties ORDER BY created_at DESC LIMIT 20;

-- Get property with stage
SELECT id, name, acquisition_stage, status FROM properties WHERE id = 'xxx';

-- Get inspection history
SELECT * FROM property_inspections WHERE property_id = 'xxx' ORDER BY created_at DESC;

-- Get documents
SELECT * FROM maninos_documents WHERE property_id = 'xxx';

-- Check stage distribution
SELECT acquisition_stage, COUNT(*) FROM properties GROUP BY acquisition_stage;
```

---

## Testing Quick Commands

```bash
# Run complete flow test
python tests/test_maninos_flow.py

# Test specific step
python -c "
from tools.numbers_tools import calculate_maninos_deal
result = calculate_maninos_deal(30000, market_value=50000)
print(result)
"

# Test property creation
python -c "
from tools.property_tools import add_property
prop = add_property('Test Property', '123 Main St')
print(prop)
"
```

---

## Common Errors & Quick Fixes

### Error: "Tool validation failed"

```python
# Check stage allows tool
property_data = get_property(property_id)
print(f"Stage: {property_data['acquisition_stage']}")

# Verify tool requirements
# Example: save_inspection_results requires stage = 'passed_70_rule'
```

---

### Error: "Missing data: ['arv']"

```python
# User needs to provide ARV
# Check if agent asked for it
print(f"Stage: {property_data['acquisition_stage']}")
# If stage == 'inspection_done', ARV is required for 80% Rule
```

---

### Error: "Orphaned tool calls"

```python
# Message sanitization issue in BaseAgent
# Check that tool_calls have corresponding ToolMessages
# BaseAgent.run() has sanitization logic - don't remove it
```

---

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres

# Optional
RESEND_API_KEY=re_...        # For email functionality
LOGFIRE_TOKEN=...            # For observability
OPENAI_MODEL=gpt-4o-mini     # Default model
ENVIRONMENT=production       # Enables strict checks
```

---

## Debugging Quick Commands

```python
# Enable debug logging
import logging
logging.basicConfig(level=logging.DEBUG)

# Check checkpointer state
from agentic import agent
config = {"configurable": {"thread_id": "test-session"}}
state = agent.get_state(config)
print(f"Messages: {len(state.values.get('messages', []))}")

# Inspect property data
from tools.property_tools import get_property
prop = get_property("property-id-here")
print(f"Stage: {prop['acquisition_stage']}")
print(f"Repair estimate: {prop.get('repair_estimate')}")
print(f"ARV: {prop.get('arv')}")
```

---

## Key Metrics to Monitor

```python
# Agent latency
PropertyAgent avg: 2.1s per request

# Tool usage frequency
Most called:
1. get_property (100%)
2. calculate_maninos_deal (85%)
3. list_docs (75%)
4. save_inspection_results (65%)

# Stage distribution (typical)
- documents_pending: 15%
- initial: 10%
- passed_70_rule: 20%
- inspection_done: 25%
- passed_80_rule: 15%
- contract_generated: 10%
- rejected: 5%
```

---

## Emergency Contacts

**Documentation:**
- Developer Bible: `docs/DEVELOPER_BIBLE.md`
- Architecture: `docs/CONSOLIDATED_ARCHITECTURE.md`
- Routing: `docs/INTELLIGENT_ROUTING.md`

**Code:**
- Main Entry: `app.py`
- Orchestrator: `router/orchestrator.py`
- Main Agent: `agents/property_agent.py`

**Tests:**
- Flow Test: `tests/test_maninos_flow.py`

---

**Last Updated:** December 16, 2024
**Version:** 1.0

---

**📖 For full details, read:** `docs/DEVELOPER_BIBLE.md`

