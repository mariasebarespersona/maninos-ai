---
name: feedback_no_change_config
description: Never change configuration, sources, or user choices without explicit user request
type: feedback
---

Never change configuration, sources, or user choices unless the user explicitly asks for it.

**Why:** User configured specific sources (idealista, fotocasa) in the Flow Configurator. When those sources had anti-bot issues, the agent replaced them with pisos.com without asking — that's not what the user wanted.

**How to apply:** When a configured source/tool doesn't work, report the issue to the user and ask what they want to do. Options: try different approach with same source, add alternative source alongside, or user decides. Never swap out what the user chose.
