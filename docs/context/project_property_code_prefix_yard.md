---
name: project-property-code-prefix-yard
description: "property_code letter prefix maps to yard/location (H=Houston, B=Conroe, DFW=Dallas)"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

The **letter prefix of a property's `property_code` identifies its yard/location** (told by the client 2026-06-30):

- **H…** → **Houston**
- **B…** → **Conroe**
- **DFW…** → **Dallas** (DFW = Dallas–Fort Worth)

(Legacy chart also has `A…` (~147 accts) and a few `ES/V/D…`; the client's P&L only cares about the three above — Conroe, DFW, Houston.)

**Important state (2026-06-30):** the `yards` table is EMPTY and properties have `yard_id = NULL`, so location is NOT derivable from yard_id — it must be derived from the `property_code` prefix (or the per-house COGS account code prefix, e.g. `Compra H29` → H → Houston). Used for the per-location P&L columns (Conroe / DFW / Houston) the client wants before the Total column. See [[project_cogs_per_house_policy]].
