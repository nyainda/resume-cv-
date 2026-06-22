---
name: Auth system deployment
description: Architecture and deployment details for the ProCV server-backed auth system (Google OAuth + magic link, D1 sessions).
---

## Architecture
- **Backend**: `backend/cv-engine-worker/src/handlers/auth.ts`
- **D1 tables**: `user_identities`, `user_sessions`, `magic_link_tokens` (mig 024), `auth_audit_log` (mig 025)
- **Routes** (all in worker index.ts):
  - `POST /api/auth/google` — exchanges Google access token for a ProCV session + HttpOnly cookie
  - `POST /api/auth/magic-link/send` — sends magic link email (needs BREVO_API_KEY CF secret)
  - `GET  /api/auth/magic-link/verify?token=` — verifies token, creates session, returns `is_new_user`
  - `GET  /api/auth/session` — validates session via cookie (primary) OR `Authorization: Bearer` (fallback)
  - `POST /api/auth/signout` — revokes session + clears cookie
  - `DELETE /api/auth/account` — D1 FK-batch delete; returns `Set-Cookie: Max-Age=0` on success
- **Frontend context**: `frontend/auth/AuthContext.tsx` — single unified context
- **Frontend service**: `frontend/services/authService.ts`

## Session persistence — critical lesson
The CF worker is on `cv-engine-worker.dripstech.workers.dev` — a *different origin* from the app.
Its `SameSite=None; Secure; HttpOnly` cookie is therefore a **third-party cookie**.
Safari ITP, Chrome Incognito, and strict privacy modes block these silently, causing:
- `GET /api/auth/session` → 401 on every page refresh → user appears logged out
- `DELETE /api/auth/account` → 401 → "connection" error on delete

**Fix (June 2026)**: two-pass session validation in `authService.ts`:
1. Pass 1: cookie-only (`credentials: 'include'`). If 200 → done.
2. Pass 2: if 401, read `procv:stf` (SESSION_FALLBACK_KEY) from localStorage and retry with `Authorization: Bearer <token>`.

The fallback token (`procv:stf`) is saved in localStorage on every successful sign-in (`linkGoogleSession`, `verifyMagicLink`).
It is cleared on sign-out (`signOutWorker`) and on a successful account delete (`deleteAccountWorker`).
The CF worker already accepts Bearer as a fallback — no server-side change needed.

**Why cookie-first is still correct:** The HttpOnly cookie is XSS-safe; the localStorage token is a practical fallback. If the cookie IS available, it is always used (pass 1 succeeds, pass 2 never runs).

## Security features
- Rate limit: 20 Google sign-ins per IP per hour; 3 magic links per email per 15 min
- Session cap: 10 active sessions per user (oldest revoked on overflow)
- Audit log: every auth event logged to `auth_audit_log`
- `is_new_user` flag returned only on brand-new account creation
- `last_seen_at` bumped on every session validate
- Sessions are hashed in D1 (raw token never stored)

## ALLOWED_ORIGINS (wrangler.toml)
Current explicit list: `https://resume-cv-gold.vercel.app`, `https://procv.replit.app`, current Replit dev domain.
Wildcard catch in `isAllowedOrigin`: `.replit.dev`, `.replit.app`, `.repl.co`, `localhost`.
Update wrangler.toml `[vars] ALLOWED_ORIGINS` when the Replit dev URL changes, then re-deploy.

## Deployment
- Migrations: `wrangler d1 migrations apply cv-engine-db --remote` (from worker dir)
- Worker deploy: `cd backend/cv-engine-worker && CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN npx wrangler deploy --env=""`
- Worker URL: `https://cv-engine-worker.dripstech.workers.dev`

## Magic link dependency
`BREVO_API_KEY` must be a Cloudflare Worker secret (not a Replit secret):
```bash
wrangler secret put BREVO_API_KEY
```
Without it, magic-link/send returns `503 email_not_configured`. Google OAuth works without it.
