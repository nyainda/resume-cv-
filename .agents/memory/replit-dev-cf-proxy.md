---
name: Replit dev CF proxy setup
description: How the CF worker endpoint is connected in Replit dev without CORS issues, and the URL-building fix required.
---

# Replit dev Cloudflare Worker proxy

## The rule
In Replit dev, `VITE_CV_ENGINE_URL` must be set to `/cf-engine` (a relative proxy path), NOT the full `https://cv-engine-worker.dripstech.workers.dev` URL directly. The full URL is used in production (Vercel).

**Why:** The deployed CF worker's `ALLOWED_ORIGINS` only lists specific origins (Vercel + old Replit dev domains). Any new Replit dev domain triggers CORS rejection. Routing through the Vite dev server proxy sidesteps CORS entirely.

## How to apply
- `VITE_CV_ENGINE_URL=/cf-engine` is set as a Replit shared env var.
- `vite.config.ts` has a `/cf-engine` proxy entry pointing to `https://cv-engine-worker.dripstech.workers.dev` with path rewrite.
- `isCVEngineConfigured()` in `frontend/services/cvEngineClient.ts` was patched to accept paths starting with `/` (not just `https://`).
- `buildEngineURL(path)` helper was added to handle both absolute and relative ENGINE_URL values — `new URL(path, ENGINE_URL)` only works for absolute bases; relative bases need `new URL(ENGINE_URL + path, window.location.origin)`.

## Gotcha
After adding `buildEngineURL()`, a global sed replace of `new URL(*, ENGINE_URL)` also replaced the call INSIDE the helper itself, causing infinite recursion. Always exempt the helper's own body from any bulk replacement.

## PDF in local dev
`VITE_PDF_WORKER_URL` is left empty. The local Playwright PDF server (port 3001) handles PDF generation via the `/__pdf` Vite proxy. The Cloudflare Browser rendering worker is not used locally.
