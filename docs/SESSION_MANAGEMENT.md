# Session Management & Memory Isolation

## Overview

MANINOS AI implements **property-specific session management** to ensure that each property's chat history is completely isolated and never mixed with other properties.

---

## How It Works

### 1. **Unique Session IDs per Property**

Each property gets its own unique session identifier:

```typescript
// Format: web-ui-{propertyId}
sessionId = `web-ui-${propertyId}`
```

**Examples:**
- Property A: `web-ui-abc-123-def`
- Property B: `web-ui-xyz-789-ghi`
- New evaluation: `web-ui-new-a7f3b2c1`

### 2. **LangGraph Checkpointing**

The backend uses **LangGraph's PostgresSaver** to automatically persist conversation state:

```python
# Backend: agentic.py
checkpointer = PostgresSaver.from_conn_string(db_url)
```

**How checkpointing works:**
- Each `session_id` creates a separate checkpoint in PostgreSQL
- When you send a message with `session_id = 'web-ui-abc-123'`, LangGraph:
  1. Loads the existing conversation history for that session
  2. Adds the new message to that history
  3. Saves the updated state back to the database

**This means:**
- ✅ Property A's chat history is stored under `web-ui-abc-123`
- ✅ Property B's chat history is stored under `web-ui-xyz-789`
- ✅ They never mix because they use different session IDs

---

## Frontend Implementation

### Initial State

```tsx
const [sessionId, setSessionId] = useState('web-ui')
const [propertyId, setPropertyId] = useState<string | null>(null)
```

On mount, the app syncs with the backend using the default session `'web-ui'`.

### Switching Properties

When a user selects a property from the PropertiesDrawer:

```tsx
const handleSwitchProperty = async (newPropertyId: string) => {
    // 1. Set property-specific session ID
    const newSessionId = `web-ui-${newPropertyId}`
    setSessionId(newSessionId)
    
    // 2. Update property context
    setPropertyId(newPropertyId)
    
    // 3. Clear UI messages (fresh view)
    setMessages([])
    
    // 4. Load property data
    await fetchProperty(newPropertyId)
    
    // Note: Backend will automatically load this property's chat history
}
```

### Starting New Evaluation

```tsx
const handleNewEvaluation = () => {
    // Generate unique session for new deal
    const newSessionId = `web-ui-new-${crypto.randomUUID().slice(0, 8)}`
    setSessionId(newSessionId)
    setPropertyId(null)
    setProperty(null)
    setMessages([])
}
```

---

## Backend Flow

### Chat Endpoint (`app.py`)

```python
@app.post("/ui_chat")
async def ui_chat(
    text: str = Form(...),
    session_id: str = Form("web-ui"),
    property_id: Optional[str] = Form(None),
    ...
):
    # LangGraph uses session_id to load/save conversation history
    result = orchestrator.route_and_execute(
        user_input=text,
        session_id=session_id,  # <-- Key isolation mechanism
        property_id=property_id,
        ...
    )
```

### LangGraph State (`agentic.py`)

```python
# The checkpointer automatically:
# 1. Loads state for the given session_id
# 2. Executes the agent
# 3. Saves updated state for that session_id

graph.invoke(
    {"input": user_input},
    config={
        "configurable": {
            "thread_id": session_id  # <-- Isolates memory
        }
    }
)
```

---

## Memory Isolation Guarantees

### ✅ What This Prevents

1. **Cross-Property Contamination**
   - Property A's chat history will NEVER appear when viewing Property B
   - Each property's context (asking price, ARV, repair estimates) is isolated

2. **Agent Confusion**
   - The agent won't mix up property details from different deals
   - If you're discussing "Sunny Park 14" in Property A, that context won't leak into Property B

3. **Data Privacy**
   - Each property's financial analysis and conversation is private to that property
   - Sensitive information (seller names, prices) stays within its property context

### ✅ What This Enables

1. **Multiple Active Deals**
   - Work on several property evaluations simultaneously
   - Switch between them freely without losing context

2. **Conversation History**
   - Return to a property days later and the agent remembers the full conversation
   - All analysis, decisions, and tool results are preserved

3. **Clean Slate for New Deals**
   - Each new property evaluation starts fresh with no prior context

---

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     User Action                         │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Click Property "Sunny Park 14" (ID: abc-123)           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Frontend: handleSwitchProperty('abc-123')              │
│    • setSessionId('web-ui-abc-123')                     │
│    • setPropertyId('abc-123')                           │
│    • setMessages([])                                    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  User types: "What's the ARV?"                          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  POST /api/chat                                         │
│    • text: "What's the ARV?"                            │
│    • session_id: "web-ui-abc-123"                       │
│    • property_id: "abc-123"                             │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Backend LangGraph                                      │
│    1. Load checkpoint for "web-ui-abc-123"              │
│    2. Agent sees full conversation history              │
│    3. Agent queries DB for property abc-123             │
│    4. Agent responds with ARV from memory/DB            │
│    5. Save updated checkpoint for "web-ui-abc-123"      │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Response: "The ARV for Sunny Park 14 is $90,000"      │
└─────────────────────────────────────────────────────────┘
```

---

## Testing Memory Isolation

To verify that memory isolation works:

### Test 1: Create Two Properties

1. Start a new evaluation: "Evaluate property A at 123 Main St"
2. Agent asks for prices, you provide them
3. Click menu → "New Evaluation"
4. Start another: "Evaluate property B at 456 Oak Ave"
5. Provide different prices
6. Switch back to Property A
7. Ask: "What was the asking price?"
   - ✅ Should respond with Property A's price, NOT Property B's

### Test 2: Context Preservation

1. Work on a property, complete inspection
2. Close browser / restart app
3. Reopen, click menu, select that property
4. Ask: "Where were we?"
   - ✅ Agent should remember the inspection was completed

### Test 3: Agent Doesn't Mix Context

1. Property A: "The seller is John Smith"
2. Switch to Property B: "Who is the seller?"
   - ✅ Agent should say "I don't have the seller's name yet" (not "John Smith")

---

## Key Implementation Details

### Why Not Include `sessionId` in useEffect Deps?

```tsx
useEffect(() => {
    // Initial sync...
}, [fetchProperty, fetchPropertiesList])
// ❌ NOT [fetchProperty, fetchPropertiesList, sessionId]
```

**Reason:**
- The initial sync should only run **on mount**
- If `sessionId` is in deps, switching properties would trigger re-sync
- This would send an empty message every time you switch properties (unwanted behavior)

### When Does `sessionId` Matter?

Only in the `onSend` callback:

```tsx
const onSend = useCallback(async () => {
    // ...
    form.append('session_id', sessionId)  // Uses current sessionId
    // ...
}, [input, propertyId, fetchProperty, sessionId])
//                                    ^^^^^^^^ Here it's needed
```

This ensures that when you send a message, it goes to the correct session's conversation history.

---

## Summary

**MANINOS AI's session management ensures:**

1. ✅ **Complete Memory Isolation**: Each property has its own conversation history
2. ✅ **Persistent Context**: Return to any property and the agent remembers everything
3. ✅ **No Cross-Contamination**: Property A's data never leaks into Property B
4. ✅ **Scalable**: Handle dozens of properties without confusion
5. ✅ **Clean Architecture**: LangGraph's checkpointer handles all persistence automatically

**Key Formula:**
```
sessionId = 'web-ui-{propertyId}' → Isolated LangGraph checkpoint → Preserved memory
```

This design allows you to manage multiple property evaluations in parallel, each with its own complete conversation history, without any risk of context mixing.

