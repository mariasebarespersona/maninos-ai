---
name: Always commit and push after completing work
description: After finishing implementation, always commit and push without being asked. Also use subagents for parallel validation.
type: feedback
---

Always commit and push after completing implementation work — don't wait for the user to ask.

**Why:** The user expects the full workflow: implement → test → commit → push. Stopping before commit/push feels incomplete.

**How to apply:** After finishing code changes and running tests, immediately proceed to commit and push. Also use subagents (e.g., for running tests, checking build) to validate in parallel before committing.
