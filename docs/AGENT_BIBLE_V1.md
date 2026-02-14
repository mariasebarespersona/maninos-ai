# Agent Bible 🤖

**Version 1.0** | Last Updated: January 28, 2026

> **⚠️ CRITICAL: READ THIS ENTIRE DOCUMENT BEFORE BUILDING AGENTS**
> 
> This document contains the **core principles for AI agent development**. Every agent must follow these guidelines. This complements the Developer Bible and should be read together with it.

---

## Table of Contents

1. [Philosophy & Core Principles](#philosophy--core-principles)
2. [Architecture Overview](#architecture-overview)
3. [Prompt Engineering](#prompt-engineering)
4. [Tool Design](#tool-design)
5. [Memory & Persistence](#memory--persistence)
6. [Human-in-the-Loop (HITL)](#human-in-the-loop-hitl)
7. [State Management](#state-management)
8. [Error Handling](#error-handling)
9. [Observability & Debugging](#observability--debugging)
10. [Anti-Patterns](#anti-patterns)
11. [Testing Agents](#testing-agents)
12. [Security](#security)

---

## Philosophy & Core Principles

### 1. **AGENTS ARE ORCHESTRATORS, NOT MAGICIANS**

```python
# ❌ WRONG: Expect agent to figure everything out
agent.run("Handle everything for this property sale")

# ✅ RIGHT: Give agent specific, bounded task
agent.run(
    "Analyze property at 123 Main St. "
    "Use search_market_data tool to get comparables. "
    "Return analysis in PropertyAnalysis format."
)
```

**WHY:** Agents work best with clear boundaries. Vague instructions lead to hallucinations.

---

### 2. **DATABASE IS ALWAYS SOURCE OF TRUTH**

```python
# ❌ WRONG: Trust agent's memory
agent_response = "The property was purchased for $30,000"

# ✅ RIGHT: Agent MUST verify with database
@agent.tool
async def get_property_price(ctx: RunContext, property_id: str) -> dict:
    """Get ACTUAL purchase price from database."""
    property = await db.get_property(property_id)
    return {"purchase_price": property.purchase_price}  # Real data
```

**Golden Rule:** Agents should READ from database, not REMEMBER prices/dates/facts.

---

### 3. **ONE TOOL, ONE RESPONSIBILITY**

```python
# ❌ WRONG: God tool that does everything
@agent.tool
def handle_property(action: str, property_id: str, data: dict):
    if action == "create": ...
    elif action == "update": ...
    elif action == "delete": ...
    elif action == "analyze": ...

# ✅ RIGHT: Atomic, focused tools
@agent.tool
def create_property(address: str, price: float) -> Property: ...

@agent.tool
def get_property(property_id: str) -> Property: ...

@agent.tool
def analyze_market(city: str, state: str) -> MarketAnalysis: ...
```

**WHY:** LLMs understand small, focused tools better. Reduces errors.

---

### 4. **EXPLICIT TOOL DESCRIPTIONS ARE CRITICAL**

```python
# ❌ WRONG: Vague description
@agent.tool
def search(query: str):
    """Search for stuff."""
    pass

# ✅ RIGHT: Crystal clear description
@agent.tool
def search_market_listings(
    city: str,
    state: str,
    min_price: float,
    max_price: float,
    property_type: Literal["mobile_home", "manufactured", "modular"]
) -> list[MarketListing]:
    """
    Search active property listings in the market.
    
    USE THIS TOOL WHEN:
    - User asks to find properties to buy
    - User wants market comparables
    - Analyzing competition in an area
    
    DO NOT USE WHEN:
    - Looking up existing Maninos inventory (use get_inventory instead)
    - Checking property status (use get_property instead)
    
    RETURNS:
    - List of MarketListing with address, price, sqft, year, days_on_market
    - Empty list if no matches found
    - Maximum 20 results, sorted by relevance
    
    EXAMPLE:
    >>> search_market_listings("Houston", "Texas", 20000, 50000, "mobile_home")
    [MarketListing(address="123 Oak St", price=35000, sqft=1200, ...)]
    """
    pass
```

**WHY:** The LLM only knows what you tell it. Ambiguous descriptions = wrong tool usage.

---

### 5. **FAIL FAST, FAIL LOUD**

```python
# ❌ WRONG: Silent failure
@agent.tool
def calculate_roi(purchase_price: float, sale_price: float) -> float:
    try:
        return (sale_price - purchase_price) / purchase_price
    except:
        return 0.0  # Silent failure - agent thinks ROI is 0%

# ✅ RIGHT: Explicit error
@agent.tool
def calculate_roi(purchase_price: float, sale_price: float) -> ROIResult:
    """Calculate Return on Investment."""
    if purchase_price <= 0:
        raise ToolError("purchase_price must be positive. Got: {purchase_price}")
    if sale_price < 0:
        raise ToolError("sale_price cannot be negative. Got: {sale_price}")
    
    roi = (sale_price - purchase_price) / purchase_price
    return ROIResult(roi=roi, profit=sale_price - purchase_price)
```

**WHY:** Errors should be visible so the agent (and humans) can correct course.

---

### 6. **NEVER INVENT DATA**

```python
# ❌ WRONG: Agent makes up numbers
System: "If you don't know the price, estimate it"
Agent: "The property is worth approximately $45,000"  # Made up!

# ✅ RIGHT: Agent must use tools or say "I don't know"
System: "Only report data from tools. If data unavailable, say so explicitly."
Agent: "I need to use search_market_data to get the actual price."
```

**Golden Rule:** No tool result = No data. Never estimate, guess, or approximate.

---

## Architecture Overview

### Maninos AI Agent Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMERCIALIZAR ORCHESTRATOR                    │
│                      (LangGraph StateGraph)                      │
└─────────────────────────────────────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │ BuscadorAgent │   │  CostosAgent  │   │  PrecioAgent  │
    │  (Search &    │   │ (Renovation   │   │ (Post-reno    │
    │   Analysis)   │   │    Costs)     │   │   Pricing)    │
    └───────────────┘   └───────────────┘   └───────────────┘
            │                   │                   │
            ▼                   ▼                   ▼
    ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
    │    Tools:     │   │    Tools:     │   │    Tools:     │
    │ • web_search  │   │ • get_materials│  │ • get_property│
    │ • analyze_mkt │   │ • calc_costs  │   │ • calc_margin │
    │ • get_comps   │   │ • get_sqft    │   │ • get_market  │
    └───────────────┘   └───────────────┘   └───────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │      SUPABASE DB      │
                    │   (Source of Truth)   │
                    └───────────────────────┘
```

### Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| **Orchestration** | LangGraph | State machines, checkpoints, mature |
| **Validation** | Pydantic | Type-safe inputs/outputs |
| **LLM** | OpenAI GPT-4o / Claude 3.5 | Best reasoning |
| **Database** | Supabase PostgreSQL | Already in use |
| **Observability** | Langfuse | Traces, debugging, costs |
| **Memory** | Supabase + pgvector | Semantic search |

---

## Prompt Engineering

### Modular Prompt Structure

Every agent prompt follows this structure:

```python
SYSTEM_PROMPT = """
# IDENTITY
{identity_block}

# CONTEXT
{context_block}

# CAPABILITIES
{capabilities_block}

# CONSTRAINTS
{constraints_block}

# OUTPUT FORMAT
{output_format_block}

# EXAMPLES
{examples_block}
"""
```

### Identity Block

```python
IDENTITY_BLOCK = """
You are BuscadorAgent, a specialized AI assistant for Maninos Homes.
Your role: Find and analyze mobile home properties in the Texas market.
Your expertise: Real estate market analysis, property valuation, ROI calculation.
Your personality: Professional, data-driven, cautious with recommendations.
"""
```

**Rules:**
- Be specific about the agent's role
- Define expertise boundaries
- Set tone/personality

### Context Block

```python
CONTEXT_BLOCK = """
## Current State
- User: {user_name} (Employee at Maninos Homes)
- Current step: {current_step} (Comprar Casa → Fotos/Publicar → Renovar → Volver a Publicar)
- Active property: {property_id or "None"}

## Business Rules
- Maninos Homes buys mobile homes in Texas
- Target: Properties under $50,000 purchase price
- Goal: 20-30% profit margin after renovation
- Renovation should not exceed 30% of sale price

## Database State
- Properties in inventory: {property_count}
- Properties published: {published_count}
- Active clients: {client_count}
"""
```

**Rules:**
- Include relevant state from database
- Include business rules that affect decisions
- Update dynamically per request

### Capabilities Block

```python
CAPABILITIES_BLOCK = """
## Available Tools
You have access to these tools:

1. **search_market_listings** - Find properties for sale in Texas
   - Use for: Finding new properties to buy
   - Returns: List of listings with price, sqft, location

2. **analyze_property** - Deep analysis of a specific property
   - Use for: Evaluating if a property is a good investment
   - Returns: ROI estimate, risk factors, recommendation

3. **get_comparables** - Find similar recently sold properties
   - Use for: Validating price estimates
   - Returns: 5 comparable sales with prices

## Tool Usage Order
For property evaluation:
1. FIRST: search_market_listings to find candidates
2. THEN: get_comparables to validate prices
3. FINALLY: analyze_property for recommendation
"""
```

**Rules:**
- List all available tools with clear descriptions
- Explain WHEN to use each tool
- Define recommended usage order

### Constraints Block

```python
CONSTRAINTS_BLOCK = """
## MUST DO
- Always verify data with tools before making claims
- Always include confidence level in recommendations
- Always cite which tool provided the data

## MUST NOT DO
- Never invent or estimate prices - use tools
- Never recommend properties without ROI calculation
- Never skip the comparables check
- Never make decisions without human confirmation for purchases > $40,000

## BOUNDARIES
- Only search Texas market
- Only mobile homes / manufactured homes
- Price range: $15,000 - $60,000
"""
```

**Rules:**
- Explicit DO and DON'T lists
- Clear boundaries for operation
- Human-in-the-loop triggers

### Output Format Block

```python
OUTPUT_FORMAT_BLOCK = """
## Response Format
Always respond with this JSON structure:

```json
{
  "thinking": "Your reasoning process (internal)",
  "action": "tool_name" | "final_answer",
  "action_input": { ... },
  "confidence": 0.0-1.0,
  "needs_confirmation": true | false,
  "result": {
    "summary": "One sentence summary",
    "data": { ... },
    "next_steps": ["Step 1", "Step 2"],
    "warnings": ["Warning 1"]
  }
}
```

## Confidence Levels
- 0.9-1.0: High confidence, data verified
- 0.7-0.9: Medium confidence, some assumptions
- 0.5-0.7: Low confidence, needs more data
- <0.5: Cannot proceed, ask for clarification
"""
```

### Examples Block

```python
EXAMPLES_BLOCK = """
## Example 1: Property Search
User: "Find mobile homes under $30,000 in Houston"

Correct response:
{
  "thinking": "User wants properties in Houston under $30k. I should use search_market_listings.",
  "action": "search_market_listings",
  "action_input": {
    "city": "Houston",
    "state": "Texas", 
    "min_price": 0,
    "max_price": 30000,
    "property_type": "mobile_home"
  }
}

## Example 2: Missing Information
User: "Is this property a good deal?"

Correct response:
{
  "thinking": "User didn't specify which property. I need to ask.",
  "action": "final_answer",
  "result": {
    "summary": "I need more information",
    "data": null,
    "next_steps": ["Please provide the property address or ID"]
  }
}
"""
```

**Rules:**
- Show correct tool usage
- Show edge cases (missing info)
- Show expected format

---

## Tool Design

### Tool Definition Template

```python
from pydantic import BaseModel, Field
from typing import Literal
from langchain_core.tools import tool

# 1. Define Input Schema
class SearchMarketInput(BaseModel):
    """Input for market search."""
    city: str = Field(description="City name in Texas")
    state: str = Field(default="Texas", description="Always Texas")
    min_price: float = Field(ge=0, description="Minimum price in USD")
    max_price: float = Field(le=100000, description="Maximum price in USD")
    property_type: Literal["mobile_home", "manufactured", "modular"] = Field(
        default="mobile_home",
        description="Type of property to search"
    )

# 2. Define Output Schema
class MarketListing(BaseModel):
    """A single property listing."""
    id: str
    address: str
    city: str
    price: float
    sqft: int
    year_built: int
    days_on_market: int
    source_url: str

class SearchMarketOutput(BaseModel):
    """Output from market search."""
    listings: list[MarketListing]
    total_found: int
    search_timestamp: str
    
# 3. Define Tool with Explicit Description
@tool(args_schema=SearchMarketInput, return_direct=False)
def search_market_listings(
    city: str,
    state: str,
    min_price: float,
    max_price: float,
    property_type: str
) -> SearchMarketOutput:
    """
    Search for mobile home listings currently on the market.
    
    PURPOSE:
    Find properties that Maninos Homes could potentially purchase.
    This searches external listing sites, NOT our internal inventory.
    
    WHEN TO USE:
    ✓ User asks to find new properties to buy
    ✓ User wants to see what's available in a city
    ✓ Comparing market prices for valuation
    
    WHEN NOT TO USE:
    ✗ Looking up properties we already own (use get_property)
    ✗ Checking client information (use get_client)
    ✗ Historical price analysis (use get_market_history)
    
    PARAMETERS:
    - city: Texas city name (e.g., "Houston", "Dallas", "Austin")
    - state: Always "Texas" (we only operate in Texas)
    - min_price: Minimum price filter (typically $15,000+)
    - max_price: Maximum price filter (typically <$60,000)
    - property_type: "mobile_home" for most searches
    
    RETURNS:
    - listings: Array of up to 20 properties
    - total_found: Total matching (may be more than returned)
    - search_timestamp: When the search was performed
    
    ERRORS:
    - "CITY_NOT_FOUND": City not recognized
    - "PRICE_RANGE_INVALID": min > max
    - "NO_RESULTS": No properties match criteria
    
    EXAMPLE:
    >>> search_market_listings("Houston", "Texas", 20000, 40000, "mobile_home")
    SearchMarketOutput(
        listings=[
            MarketListing(id="123", address="456 Oak Lane", price=35000, ...)
        ],
        total_found=47,
        search_timestamp="2026-01-28T10:30:00Z"
    )
    """
    # Implementation here
    pass
```

### Tool Description Checklist

Every tool description MUST include:

| Section | Required | Description |
|---------|----------|-------------|
| **PURPOSE** | ✅ | One sentence: what does this tool do? |
| **WHEN TO USE** | ✅ | List of scenarios (with ✓) |
| **WHEN NOT TO USE** | ✅ | List of anti-scenarios (with ✗) |
| **PARAMETERS** | ✅ | Each param with type and valid values |
| **RETURNS** | ✅ | What the output contains |
| **ERRORS** | ✅ | Possible error codes/messages |
| **EXAMPLE** | ✅ | Concrete usage example |

### Tool Categories

```python
# Category 1: READ tools (query database)
get_property(property_id) -> Property
get_client(client_id) -> Client
get_inventory() -> list[Property]
get_sales_summary() -> SalesSummary

# Category 2: SEARCH tools (external data)
search_market_listings(...) -> list[Listing]
get_comparables(address) -> list[Comparable]
search_contractors(city) -> list[Contractor]

# Category 3: CALCULATE tools (no side effects)
calculate_roi(purchase, sale, costs) -> ROIResult
calculate_renovation_cost(sqft, items) -> CostEstimate
calculate_sale_price(purchase, renovation, margin) -> PriceRecommendation

# Category 4: WRITE tools (modify database) - REQUIRE CONFIRMATION
create_property(data) -> Property  # needs_confirmation: true
update_property(id, data) -> Property  # needs_confirmation: true
create_client(data) -> Client  # needs_confirmation: true

# Category 5: ACTION tools (external actions) - REQUIRE CONFIRMATION
send_notification(client_id, message) -> bool  # needs_confirmation: true
generate_contract(sale_id) -> Document  # needs_confirmation: true
```

---

## Memory & Persistence

### Memory Types

```python
class AgentMemory:
    """
    Three types of memory for agents.
    """
    
    # 1. SHORT-TERM: Current conversation
    conversation_history: list[Message]  # Last N messages
    current_context: dict  # Current property, client, step
    
    # 2. LONG-TERM: Persistent knowledge
    # Stored in Supabase with pgvector for semantic search
    learned_facts: list[Fact]  # "Client X prefers 3-bedroom"
    past_decisions: list[Decision]  # "Property Y rejected due to flood zone"
    
    # 3. WORKING: Current task state
    # LangGraph checkpoints
    current_step: str
    gathered_data: dict
    pending_confirmations: list
```

### Memory Storage Schema

```sql
-- Long-term memory table
CREATE TABLE agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type VARCHAR(50) NOT NULL,  -- 'buscador', 'costos', etc.
    memory_type VARCHAR(20) NOT NULL,  -- 'fact', 'decision', 'preference'
    content TEXT NOT NULL,
    embedding VECTOR(1536),  -- For semantic search
    metadata JSONB,
    relevance_score FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP DEFAULT NOW(),
    access_count INT DEFAULT 0
);

-- Index for semantic search
CREATE INDEX idx_memories_embedding ON agent_memories 
USING ivfflat (embedding vector_cosine_ops);
```

### Memory Retrieval

```python
async def get_relevant_memories(
    agent_type: str,
    query: str,
    limit: int = 5
) -> list[Memory]:
    """
    Retrieve relevant memories using semantic search.
    """
    # 1. Embed the query
    query_embedding = await embed(query)
    
    # 2. Search by similarity
    memories = await db.query("""
        SELECT *, 1 - (embedding <=> $1) as similarity
        FROM agent_memories
        WHERE agent_type = $2
        ORDER BY similarity DESC
        LIMIT $3
    """, query_embedding, agent_type, limit)
    
    # 3. Update access stats
    for memory in memories:
        await db.execute("""
            UPDATE agent_memories 
            SET last_accessed = NOW(), access_count = access_count + 1
            WHERE id = $1
        """, memory.id)
    
    return memories
```

### Memory Consolidation (Forgetting)

```python
async def consolidate_memories():
    """
    Run periodically to clean up old/irrelevant memories.
    """
    # 1. Remove low-access memories older than 30 days
    await db.execute("""
        DELETE FROM agent_memories
        WHERE last_accessed < NOW() - INTERVAL '30 days'
        AND access_count < 3
    """)
    
    # 2. Decay relevance scores
    await db.execute("""
        UPDATE agent_memories
        SET relevance_score = relevance_score * 0.95
        WHERE last_accessed < NOW() - INTERVAL '7 days'
    """)
```

---

## Human-in-the-Loop (HITL)

### When to Require Human Confirmation

```python
HITL_TRIGGERS = {
    # Financial decisions
    "purchase_over_40k": lambda ctx: ctx.amount > 40000,
    "total_renovation_over_15k": lambda ctx: ctx.renovation_cost > 15000,
    
    # Data modifications
    "create_client": always_confirm,
    "update_sale_price": always_confirm,
    "delete_anything": always_confirm,
    
    # External actions
    "send_to_client": always_confirm,
    "generate_contract": always_confirm,
    
    # Low confidence
    "confidence_below_70": lambda ctx: ctx.confidence < 0.7,
}
```

### HITL Implementation

```python
from langgraph.checkpoint import MemorySaver
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    messages: list
    pending_confirmation: Optional[dict]
    confirmed: bool

def should_continue(state: AgentState) -> str:
    if state.get("pending_confirmation") and not state.get("confirmed"):
        return "wait_for_human"
    return "continue"

# Build graph with human checkpoint
graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)
graph.add_node("wait_for_human", human_checkpoint_node)

graph.add_conditional_edges(
    "agent",
    should_continue,
    {
        "continue": "tools",
        "wait_for_human": "wait_for_human",
    }
)

# Compile with checkpointer for persistence
checkpointer = MemorySaver()
app = graph.compile(checkpointer=checkpointer, interrupt_before=["wait_for_human"])
```

### Confirmation UI Pattern

```typescript
// Frontend component for HITL
interface ConfirmationRequest {
  id: string;
  agent: string;
  action: string;
  description: string;
  data: Record<string, any>;
  risk_level: 'low' | 'medium' | 'high';
  timestamp: string;
}

function AgentConfirmation({ request }: { request: ConfirmationRequest }) {
  return (
    <Modal>
      <h2>Agent needs confirmation</h2>
      <p><strong>Agent:</strong> {request.agent}</p>
      <p><strong>Action:</strong> {request.action}</p>
      <p>{request.description}</p>
      
      <DataPreview data={request.data} />
      
      <div className="actions">
        <Button variant="danger" onClick={() => reject(request.id)}>
          Reject
        </Button>
        <Button variant="primary" onClick={() => approve(request.id)}>
          Approve
        </Button>
      </div>
    </Modal>
  );
}
```

---

## State Management

### LangGraph State Definition

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class ComercializarState(TypedDict):
    """State for the Comercializar orchestrator."""
    
    # Conversation
    messages: Annotated[list, add_messages]
    
    # Current context
    current_step: Literal[
        "comprar_casa",
        "fotos_publicar", 
        "renovar",
        "volver_publicar",
        "cierre_venta"
    ]
    property_id: Optional[str]
    client_id: Optional[str]
    
    # Gathered data (accumulates)
    market_analysis: Optional[dict]
    renovation_estimate: Optional[dict]
    price_recommendation: Optional[dict]
    
    # Control flow
    needs_human_input: bool
    pending_tool_calls: list[dict]
    errors: list[str]
    
    # Audit
    started_at: str
    last_action: str
    action_count: int
```

### State Transitions

```python
VALID_TRANSITIONS = {
    "comprar_casa": ["fotos_publicar"],
    "fotos_publicar": ["renovar", "cierre_venta"],  # Can sell before renovation
    "renovar": ["volver_publicar"],
    "volver_publicar": ["cierre_venta"],
    "cierre_venta": [],  # Terminal
}

def can_transition(current: str, target: str) -> bool:
    return target in VALID_TRANSITIONS.get(current, [])
```

---

## Error Handling

### Error Categories

```python
class AgentError(Exception):
    """Base class for agent errors."""
    pass

class ToolError(AgentError):
    """Tool execution failed."""
    def __init__(self, tool_name: str, message: str, recoverable: bool = True):
        self.tool_name = tool_name
        self.message = message
        self.recoverable = recoverable

class ValidationError(AgentError):
    """Input/output validation failed."""
    pass

class ConfidenceError(AgentError):
    """Agent confidence too low to proceed."""
    def __init__(self, confidence: float, threshold: float):
        self.confidence = confidence
        self.threshold = threshold

class HumanInterventionRequired(AgentError):
    """Agent needs human decision."""
    def __init__(self, reason: str, options: list[str]):
        self.reason = reason
        self.options = options
```

### Error Recovery Strategy

```python
async def execute_with_recovery(tool_call: ToolCall, max_retries: int = 3):
    """Execute tool with automatic recovery."""
    
    for attempt in range(max_retries):
        try:
            result = await execute_tool(tool_call)
            return result
            
        except ToolError as e:
            if not e.recoverable:
                raise
            
            if attempt < max_retries - 1:
                # Log and retry with backoff
                logger.warning(f"Tool {e.tool_name} failed, retrying: {e.message}")
                await asyncio.sleep(2 ** attempt)
            else:
                # Max retries exceeded
                raise HumanInterventionRequired(
                    reason=f"Tool {e.tool_name} failed after {max_retries} attempts",
                    options=["retry_manually", "skip", "abort"]
                )
```

---

## Observability & Debugging

### Langfuse Integration

```python
from langfuse import Langfuse
from langfuse.decorators import observe

langfuse = Langfuse()

@observe(name="buscador_agent")
async def run_buscador_agent(query: str, context: dict):
    """Run BuscadorAgent with full observability."""
    
    # Trace inputs
    langfuse.trace(
        name="buscador_run",
        input={"query": query, "context": context}
    )
    
    # Run agent
    result = await agent.ainvoke({"messages": [query]})
    
    # Trace outputs
    langfuse.trace(
        output=result,
        metadata={
            "tools_used": result.get("tools_called", []),
            "tokens_used": result.get("token_count", 0),
            "confidence": result.get("confidence", 0)
        }
    )
    
    return result
```

### Structured Logging

```python
import structlog

logger = structlog.get_logger()

async def log_agent_action(
    agent_name: str,
    action: str,
    inputs: dict,
    outputs: dict,
    duration_ms: int
):
    logger.info(
        "agent_action",
        agent=agent_name,
        action=action,
        inputs=inputs,
        outputs=outputs,
        duration_ms=duration_ms,
        timestamp=datetime.utcnow().isoformat()
    )
```

### Debug Mode

```python
DEBUG_MODE = os.getenv("AGENT_DEBUG", "false").lower() == "true"

if DEBUG_MODE:
    # Print all tool calls
    # Print full prompts
    # Print token counts
    # Save all interactions to file
    pass
```

---

## Anti-Patterns

### Anti-Pattern 1: Vague Tool Descriptions

```python
# ❌ BAD
@tool
def search(q: str):
    """Search for things."""
    pass

# ✅ GOOD
@tool
def search_market_listings(city: str, max_price: float) -> list[Listing]:
    """
    Search mobile home listings in Texas market.
    
    USE FOR: Finding properties to potentially purchase.
    RETURNS: Up to 20 listings sorted by price.
    """
    pass
```

### Anti-Pattern 2: God Agent

```python
# ❌ BAD: One agent does everything
class ManinosAgent:
    def search_properties(self): ...
    def analyze_market(self): ...
    def calculate_costs(self): ...
    def manage_clients(self): ...
    def generate_contracts(self): ...

# ✅ GOOD: Specialized agents
class BuscadorAgent: ...  # Search & analysis
class CostosAgent: ...    # Renovation costs
class PrecioAgent: ...    # Pricing
```

### Anti-Pattern 3: Trusting Agent Memory

```python
# ❌ BAD: Trust what agent remembers
Agent: "Based on our previous conversation, the property costs $35,000"

# ✅ GOOD: Always verify with database
@tool
def get_property_price(property_id: str) -> float:
    """Get the ACTUAL price from database."""
    return db.get_property(property_id).purchase_price
```

### Anti-Pattern 4: No Confirmation for Write Operations

```python
# ❌ BAD: Auto-execute writes
@tool
def create_client(name: str, email: str):
    return db.insert("clients", {"name": name, "email": email})

# ✅ GOOD: Require confirmation
@tool
def create_client(name: str, email: str) -> PendingAction:
    """Creates client - REQUIRES HUMAN CONFIRMATION."""
    return PendingAction(
        action="create_client",
        data={"name": name, "email": email},
        needs_confirmation=True
    )
```

### Anti-Pattern 5: Unbounded Loops

```python
# ❌ BAD: Agent can loop forever
while not satisfied:
    result = agent.run(query)

# ✅ GOOD: Bounded iterations
MAX_ITERATIONS = 10
for i in range(MAX_ITERATIONS):
    result = agent.run(query)
    if result.is_final:
        break
else:
    raise MaxIterationsExceeded()
```

---

## Testing Agents

### Unit Tests for Tools

```python
import pytest

class TestSearchMarketListings:
    def test_valid_search(self):
        result = search_market_listings(
            city="Houston",
            state="Texas",
            min_price=20000,
            max_price=40000,
            property_type="mobile_home"
        )
        assert isinstance(result, SearchMarketOutput)
        assert len(result.listings) <= 20
    
    def test_invalid_price_range(self):
        with pytest.raises(ValidationError):
            search_market_listings(
                city="Houston",
                state="Texas",
                min_price=50000,
                max_price=20000  # min > max
            )
    
    def test_empty_results(self):
        result = search_market_listings(
            city="Nonexistent City",
            state="Texas",
            min_price=1,
            max_price=2
        )
        assert result.listings == []
        assert result.total_found == 0
```

### Integration Tests for Agent Flows

```python
@pytest.mark.asyncio
async def test_property_search_flow():
    """Test complete property search flow."""
    
    # 1. Initialize agent
    agent = BuscadorAgent()
    
    # 2. Run search query
    result = await agent.run(
        "Find mobile homes under $35,000 in Houston"
    )
    
    # 3. Verify tool was called
    assert "search_market_listings" in result.tools_called
    
    # 4. Verify output format
    assert result.confidence >= 0.7
    assert "listings" in result.data
    
    # 5. Verify no hallucination
    for listing in result.data["listings"]:
        assert listing["price"] <= 35000
        assert listing["city"] == "Houston"
```

### Evaluation Tests

```python
# Test that agent uses correct tools for queries
EVALUATION_CASES = [
    {
        "query": "Find houses in Dallas under $30k",
        "expected_tool": "search_market_listings",
        "expected_params": {"city": "Dallas", "max_price": 30000}
    },
    {
        "query": "What's the status of property ABC123?",
        "expected_tool": "get_property",
        "expected_params": {"property_id": "ABC123"}
    },
    {
        "query": "Calculate ROI for $25k purchase, $40k sale",
        "expected_tool": "calculate_roi",
        "expected_params": {"purchase_price": 25000, "sale_price": 40000}
    },
]

@pytest.mark.parametrize("case", EVALUATION_CASES)
async def test_tool_selection(case):
    result = await agent.run(case["query"])
    assert result.tool_called == case["expected_tool"]
```

---

## Security

### Input Sanitization

```python
from pydantic import BaseModel, validator
import re

class UserInput(BaseModel):
    query: str
    
    @validator("query")
    def sanitize_query(cls, v):
        # Remove potential injection patterns
        v = re.sub(r"[;\-\-]", "", v)
        # Limit length
        if len(v) > 1000:
            raise ValueError("Query too long")
        return v
```

### Tool Permission Levels

```python
TOOL_PERMISSIONS = {
    # Level 1: Read-only, safe
    "get_property": {"level": 1, "requires_auth": False},
    "search_market": {"level": 1, "requires_auth": False},
    
    # Level 2: Calculations, no side effects
    "calculate_roi": {"level": 2, "requires_auth": True},
    
    # Level 3: Write operations
    "create_property": {"level": 3, "requires_auth": True, "requires_confirm": True},
    "update_client": {"level": 3, "requires_auth": True, "requires_confirm": True},
    
    # Level 4: External actions
    "send_email": {"level": 4, "requires_auth": True, "requires_confirm": True},
    "generate_contract": {"level": 4, "requires_auth": True, "requires_confirm": True},
}
```

### Rate Limiting

```python
from functools import wraps
import time

RATE_LIMITS = {
    "search_market": {"calls": 10, "period": 60},  # 10 calls per minute
    "send_email": {"calls": 5, "period": 3600},     # 5 per hour
}

call_history = defaultdict(list)

def rate_limited(tool_name: str):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            limit = RATE_LIMITS.get(tool_name)
            if limit:
                now = time.time()
                history = call_history[tool_name]
                # Remove old calls
                history = [t for t in history if now - t < limit["period"]]
                if len(history) >= limit["calls"]:
                    raise RateLimitExceeded(tool_name)
                history.append(now)
                call_history[tool_name] = history
            return await func(*args, **kwargs)
        return wrapper
    return decorator
```

---

## Summary: Golden Rules for Agents

1. **DATABASE IS TRUTH** - Agents read, don't remember facts
2. **EXPLICIT TOOL DESCRIPTIONS** - LLM only knows what you tell it
3. **ONE TOOL, ONE JOB** - Small, focused tools work better
4. **MODULAR PROMPTS** - Identity + Context + Capabilities + Constraints + Format + Examples
5. **HUMAN-IN-THE-LOOP** - Confirm writes, external actions, low confidence
6. **FAIL FAST** - Errors should be visible, not silent
7. **NEVER INVENT DATA** - No tool result = No data
8. **BOUNDED OPERATIONS** - Max iterations, timeouts, rate limits
9. **OBSERVE EVERYTHING** - Langfuse traces, structured logs
10. **TEST TOOL SELECTION** - Verify agent picks right tool for query

---

## Quick Reference: Prompt Template

```python
AGENT_PROMPT = """
# IDENTITY
You are {agent_name}, specialized in {domain}.
Role: {role_description}
Personality: {personality_traits}

# CONTEXT
Current step: {current_step}
Active property: {property_id}
User: {user_name}

# CAPABILITIES
Available tools:
{tools_list_with_descriptions}

Tool usage order for {task_type}:
{recommended_tool_order}

# CONSTRAINTS
MUST DO:
{must_do_list}

MUST NOT DO:
{must_not_list}

Boundaries:
{boundaries}

# OUTPUT FORMAT
{json_schema}

Confidence levels:
- 0.9-1.0: Verified data
- 0.7-0.9: Some assumptions
- <0.7: Need clarification

# EXAMPLES
{examples}
"""
```

---

**Version History:**
- v1.0 (Jan 28, 2026) - Initial version

---

**📧 Questions?** Re-read this document and the Developer Bible. Then ask.

**🚀 Ready to Build Agents?** Follow the patterns. Test thoroughly. Deploy carefully.

