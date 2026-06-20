---
name: Sign-in retry pattern
description: linkGoogleSession auto-retries 3× with backoff in WorkerAuthContext; timeout raised; profile cache sends Bearer token for backend ownership check.
---

## The Rule
`WorkerAuthContext` auto-retries `linkGoogleSession` up to 3 times (at 0 s, 1.8 s, 5.3 s) before giving up. The Google access token is reused across retries — it stays valid for ~1 hour, so this is safe.

**Why:** The Cloudflare Worker / D1 can be cold on the first request after sign-out inactivity. The original 10 s timeout + zero retries meant a slow first request would leave the user in a confusing half-state (modal closes, Google auth live, worker session missing). The second popup attempt always succeeded because the worker was now warm.

**How to apply:**
- Do not remove the retry loop — it is the fix for the persistent "first sign-in after sign-out fails" bug.
- If retry delays need adjustment: 1.8 s covers the typical CF cold-start window (3-5 s total budget for attempt 1 + wait + attempt 2). 3.5 s third-attempt delay handles heavy D1 load.
- The Google access token is captured in a `const accessToken` variable before the async IIFE to avoid stale-closure issues.

## Profile cache auth guard
- `GET /api/cv/profile` and `POST /api/cv/profile` now accept an optional `Authorization: Bearer <token>` header.
- If header is present → `verifySession` + `slotOwnedByUser` check before returning/writing data.
- If header is absent → hash-only access (anonymous / offline mode unchanged).
- `profileCacheClient.ts` reads `procv:worker_session` from localStorage directly (no circular import with authService) and attaches the header on every request.

**Why:** Profile cache contains compact user profile data (name, skills summary, work history). A leaked hash would allow anyone to retrieve this data. Auth guard limits access to the slot's owner when signed in.

## Files changed
- `frontend/auth/WorkerAuthContext.tsx` — retry IIFE replacing `.then()` chain
- `frontend/services/authService.ts` — timeout 10 s → 18 s on `linkGoogleSession`
- `frontend/services/profileCacheClient.ts` — `getSessionToken()` + `authHeaders()` helpers, both fetch calls updated
- `backend/cv-engine-worker/src/handlers/cache.ts` — `bearerToken()`, `slotOwnedByUser()`, auth guard blocks in `handleProfileCacheGet` + `handleProfileCachePost`; `import { verifySession } from './auth'`
