---
name: Always deploy after push, never suggest manual restart
description: After pushing, deploy to Railway (backend) and Vercel (frontend). Never tell user to restart locally.
type: feedback
---

After pushing code, always deploy — don't tell the user to "restart the backend" or "run npm dev". The workflow is: implement → test → commit → push → deploy.

**Why:** The app runs on Railway (backend) and Vercel (frontend). The user works against deployed environments, not local dev servers.

**How to apply:** After `git push`, trigger Railway deploy for backend changes and verify Vercel auto-deploys for frontend changes. Use `railway up` or check deploy status.
