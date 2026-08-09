---
name: RenovacionAgent has hardcoded prices; CostosAgent queries DB
description: Two agents touch renovation costs but get prices differently — don't conflate them.
type: project
originSessionId: f961d8b1-cc89-4a9d-977b-b2ecc108ecdc
---
`RenovacionAgent` and `CostosAgent` both deal with renovation cost estimation but have a critical divergence:

- **CostosAgent** (`api/agents/costos/agent.py`) — fetches the `materials` table from Supabase via httpx on each request. Prices come from DB.
- **RenovacionAgent** (`api/agents/renovacion/agent.py`) — has the materials price list **embedded directly in the system prompt** (lines ~118-275): Pintura $21.50/gal, Tablaroca $9.80/sheet, Sanitario $125 each, Cable THHN $0.45/m, etc.

**Other RenovacionAgent quirks worth remembering**:
- **NO SQFT = NO PLANNING** — refuses to suggest materials without sqft. Extracts via regex from the user query, persists to property if found.
- Returns special `action` flag for the frontend:
  - `action: "save_materials"` when user confirms ("vale", "ok", "perfecto") → frontend should persist materials.
  - `action: "conversation_end"` on rejection ("no", "cancelar") → frontend closes chat.
- Has formulas baked in for sqft-based qty: paint `ceil(sqft * 3.5 / 350 * 2) + 1 gal`, baseboards `sqrt(sqft) * 4 * 1.1 m`, outlets `ceil(sqft / 60)`.

**Why this matters:** If renovation prices need to change, updating the DB only changes CostosAgent output. RenovacionAgent (the conversational flow customers/staff actually interact with most) requires a prompt edit. They will drift.

**How to apply:** When the user says "update renovation prices" — confirm whether they mean the DB (affects CostosAgent only) or the embedded prompt prices (affects RenovacionAgent). For consistency, both should be updated together.
