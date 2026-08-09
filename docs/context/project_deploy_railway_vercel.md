---
name: project_deploy_railway_vercel
description: How deploys actually work for maninos-ai — both Vercel (frontend) and Railway (backend) auto-deploy from GitHub main; Railway project/service mapping and login caveat.
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d733b40-7d67-4f5d-9584-546762af48be
  modified: 2026-07-23T15:46:38.094Z
---

Both frontend and backend **auto-deploy from GitHub `main`** on push — no manual deploy needed. After `git push origin main`, both pick up the commit within a few minutes.

- **Frontend → Vercel**, project **`maninos-ai`** (NOT the stale `web` project). Root directory = `web`, framework Next.js. Prod alias `maninos-ai.vercel.app`. Verify: `npx vercel ls maninos-ai --yes`. A webhook can occasionally lag/miss; an empty commit re-triggers it.
- **Backend → Railway**, project **`marvelous-quietude`** / service **`maninos-ai`** / env `production`. Domain `maninos-ai-production.up.railway.app` (found in `web/.env.test` E2E_API_URL). Docker build via `railway.json`. Link non-interactively: `railway link -p marvelous-quietude -e production -s maninos-ai`. Verify active commit: `railway deployment list` then check `meta.commitHash` via `railway deployment list --json`.

**Railway login caveat:** `railway login` is interactive (browser) and FAILS in Claude Code's shell ("Cannot login in non-interactive mode"), even with the `!` prefix. The user must run `railway login` in their OWN Terminal.app once; then this session (same machine/user) is authenticated automatically. Alternatively use a `RAILWAY_TOKEN` for non-interactive deploys.

**Why:** I once thought Railway "wasn't deploying" because I couldn't see deployments without auth — but it was auto-deploying all along. Don't assume a missing deploy; verify via the dashboards/CLI. See [[feedback_deploy_flow]].

**How to apply:** After pushing backend (Python) changes, Railway auto-builds `main`; frontend changes auto-build on Vercel. Just verify both picked up the latest commit; only nudge with an empty commit if a webhook was missed.
