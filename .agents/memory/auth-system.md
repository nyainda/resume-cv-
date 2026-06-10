---
name: Auth system deployment
description: Architecture and deployment details for the ProCV server-backed auth system (Google OAuth + magic link, D1 sessions).
---

## Architecture
- **Backend**: `backend/cv-engine-worker/src/handlers/auth.ts`
- **D1 tables**: `users`, `sessions`, `magic_link_tokens` (migration 024), `auth_audit_log` (migration 025)
- **Routes** (all in worker index.ts):
  - `POST /api/auth/google` — exchanges Google access token for a ProCV session
  - `POST /api/auth/magic-link/send` — sends magic link email (needs BREVO_API_KEY CF secret)
  - `GET  /api/auth/magic-link/verify?token=` — verifies token, creates session, returns `is_new_user`
  - `GET  /api/auth/session` — validates session token from `Authorization: Bearer` header
  - `POST /api/auth/signout` — revokes session
- **Frontend context**: `frontend/auth/WorkerAuthContext.tsx` — exposes `isWorkerAuthenticated`, `workerUser`, `isNewUser`, `clearNewUser`, `signOut`, `requireAuth()`
- **Frontend service**: `frontend/services/authService.ts`

## Security features (migration 025)
- Rate limit: 3 magic links per email per 15 minutes
- Session cap: 10 active sessions per user (oldest revoked on overflow)
- Audit log: every auth event logged to `auth_audit_log` (ip, user_agent, success/fail)
- `is_new_user` flag returned on first sign-in
- `last_seen_at` bumped on every session validate

## Deployment
- Migrations applied with: `wrangler d1 migrations apply cv-engine-db --remote`
- Worker deployed with: `wrangler deploy` from `backend/cv-engine-worker/`
- Worker URL: `https://cv-engine-worker.dripstech.workers.dev`

## Missing for magic link
`BREVO_API_KEY` must be added as a Cloudflare Worker secret (not a Replit secret) via:
```bash
wrangler secret put BREVO_API_KEY
```
Without it, magic-link/send returns `503 email_not_configured`. Google OAuth works fine without it.

**Why:** Magic link emails are sent from the worker using Brevo's REST API. The key is a Cloudflare secret, not a Replit env var.
