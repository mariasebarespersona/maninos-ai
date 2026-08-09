---
name: AIChatWidget is separate from the 5 specialized agents
description: The floating chat widget hits /api/ai/chat (tool-calling pattern), not the costos/precio/fotos/voz/renovacion agents.
type: project
originSessionId: f961d8b1-cc89-4a9d-977b-b2ecc108ecdc
---
There are TWO distinct AI systems on the backend that look superficially similar but are not connected:

1. **AIChatWidget** (`web/src/components/AIChatWidget.tsx`) → calls `/api/ai/chat` and `/api/ai/voice` (route file `api/routes/ai_assistant.py`).
   - Model: **gpt-5-mini**
   - Pattern: **tool-calling** with 16 DB query tools (query_properties, query_sales, query_clients, query_rto_contracts, query_rto_payments, query_renovations, query_commissions, query_accounting, etc.)
   - Multi-turn: LLM → tool calls → execute Supabase queries → feed results back → LLM answers.
   - System prompt in Spanish; "only real data" rule.

2. **5 specialized agents** (`api/agents/`): costos, precio, fotos, voz, renovacion. Mounted under `/api/agents/*` via `router.py`.
   - Model: **gpt-5** (full)
   - Pattern: **no tool use**, structured JSON output, Pydantic-validated.
   - Each invoked from specific flows — RenovacionAgent from renovation wizard, FotosAgent from photo classification, etc.

**Why this distinction matters:** When the user asks about "the chatbot" or "the AI assistant", they almost certainly mean AIChatWidget — different code path, different model, different prompt. Don't go editing the renovacion agent prompt to fix a chat-widget bug.

**How to apply:** Before changing AI prompts, identify which entry point is involved. Look at the frontend caller; if it's AIChatWidget → edit `ai_assistant.py`. If it's a workflow page (renovation wizard, photo upload, etc.) → edit the relevant agent under `api/agents/`.
