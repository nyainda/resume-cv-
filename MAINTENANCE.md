# ProCV — Maintenance Reference

> Single source of truth for system architecture, key decisions, and runbooks.
> Update this file when you change the architecture, add a new provider, or make a decision future maintainers need to know about.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Repository Structure](#repository-structure)
3. [AI Provider Chain](#ai-provider-chain)
4. [Cloudflare Worker — cv-engine-worker](#cloudflare-worker--cv-engine-worker)
5. [KV Data Versioning](#kv-data-versioning)
6. [Validation Pipeline](#validation-pipeline)
7. [Quality Pipeline](#quality-pipeline)
8. [CV Generation Pipeline](#cv-generation-pipeline)
9. [D1 Database Schema](#d1-database-schema)
10. [Environment Variables & Secrets](#environment-variables--secrets)
11. [Deploy Runbooks](#deploy-runbooks)
12. [Admin API Reference](#admin-api-reference)
13. [Known Issues & Decisions](#known-issues--decisions)

---

## System Overview

ProCV is a React 19 + Vite + TypeScript PWA. The frontend runs entirely in the browser. The backend is a Cloudflare Worker (`cv-engine-worker`) that handles AI calls, rule enforcement, and D1/KV data.

```
Browser (React PWA)
    │
    ├── Cloudflare Worker (/api/cv/*)  ← cv-engine-worker
    │       D1 (SQLite) + KV (cache) + Workers AI
    │
    ├── Playwright PDF server (local dev, port 3001)  ← npm run pdf-server
    └── Cloudflare Worker (PDF)  ← resume-pdf-worker (production)
```

---

## Repository Structure

```
backend/
  cv-engine-worker/
    src/
      index.ts          ← Route dispatcher + all handlers (4 400+ lines, split in progress)
      types.ts          ← Env, kvd, VERB_CATEGORIES, AdminRole, ADMIN_TABLES (Phase 1 split)
      utils.ts          ← corsHeaders, json, safeParse, verifyAdminAuth, sha256Hex (Phase 1 split)
    migrations/         ← D1 SQL migrations (001–019+)
    wrangler.toml       ← CF Worker config (D1 binding, KV binding, environments)
  resume-pdf-worker/    ← Separate CF Worker: headless Chrome PDF rendering
  scripts/              ← Audit / test / seeding scripts (Node.js)
  server-pdf.cjs        ← Local Playwright PDF server (port 3001)

frontend/
  components/           ← React components (35+ CV templates, CVToolkit, etc.)
  services/
    cvEngineClient.ts   ← All calls to cv-engine-worker: buildBrief, validateBullets,
                           validateVoice, runFullValidation, workerTieredLLM, etc.
    geminiService.ts    ← CV generation pipeline (Gemini market research + multi-model gen)
    groqService.ts      ← AI provider chain (Workers AI → Claude → Gemini)
    hrDetectorSimulation.ts ← Pure-JS 8-signal quality scorer (no API calls)
  hooks/                ← useLocalStorage, etc.
  types.ts              ← Shared TypeScript types (CVData, UserProfile, CVExperience, etc.)
  App.tsx               ← Root component

api/                    ← Vercel serverless functions (root — Vercel convention)
vite.config.ts
tailwind.config.js
```

---

## AI Provider Chain

### Active providers (as of June 2026)

| Provider | Key source | Used for |
|---|---|---|
| **Workers AI** | CF Worker binding | Primary: CV generation, humanization, audit, embedding |
| **Claude** | User BYOK (`CLAUDE_API_KEY` in localStorage) | Fallback when CF quota exhausted |
| **Gemini** | User BYOK (`GEMINI_API_KEY` in localStorage) + Gemini API | Market research (grounding), fallback generation |

`PROVIDERS = ['Workers AI', 'Claude', 'Gemini']` in `frontend/services/groqService.ts` — this is the single source of truth. The `WorkerStatusBanner` is data-driven from this array.

### Legacy providers (removed)
Groq, Cerebras, OpenRouter, Together.ai — no longer in the active code. References in older documentation are stale.

### Provider status banner
`components/WorkerStatusBanner.tsx` reads `getProviderChainStatus()` from `groqService.ts`. Pills are generated dynamically — not hardcoded in the component. To add a provider, add it to `PROVIDERS` in `groqService.ts`.

---

## Cloudflare Worker — cv-engine-worker

### Deployment

```bash
cd backend/cv-engine-worker
npx wrangler deploy --env production   # production
npx wrangler deploy --env staging      # staging
```

Requires `CLOUDFLARE_API_TOKEN` in the environment (or `wrangler login` interactively).

### After every deploy that changes CV rules

Run the admin sync once to populate KV under the new version prefix:

```bash
curl -X POST https://cv-engine-worker.dripstech.workers.dev/api/cv/sync \
  -H "X-Admin-Token: <your-admin-token>"
```

The sync response includes `data_version` confirming which version was written.

### wrangler.toml key bindings

- `CV_DB` — D1 database (SQLite)
- `CV_KV` — KV namespace (cache layer)
- `AI` — Workers AI binding (LLM + embedding)

### Route dispatcher

All routes are dispatched from `_dispatch()` in `index.ts`. The `fetch` handler wraps this with a CORS guarantee — any thrown error returns a 500 with CORS headers rather than an unhandled rejection.

---

## KV Data Versioning

### Problem
When CV rules change (banned phrases, verb pools, seniority/field tables), KV serves the old cached data until a manual sync. Old data can persist for up to 7 days (the KV TTL).

### Solution (June 2026)
Every data KV key is prefixed with `WORKER_DATA_VERSION` via the `kvd()` helper:

```typescript
// backend/cv-engine-worker/src/types.ts
export const WORKER_DATA_VERSION = 'v2';
export const kvd = (key: string) => `${WORKER_DATA_VERSION}:${key}`;

// Usage:
env.CV_KV.get(kvd('cv:banned:all'), { type: 'json' })
env.CV_KV.put(kvd('cv:banned:all'), JSON.stringify(rows))
```

### Versioned keys (all prefixed with `v2:`)
- `cv:banned:all`
- `cv:rhythm:all`
- `cv:seniority:all`, `cv:fields:all`, `cv:voices:all`, `cv:combos:all`
- `cv:verbs:{category}:{tense}`
- `cv:structures:{label}`
- `cv:verbs:technical:past`, `cv:verbs:management:past`, `cv:verbs:analysis:past`
- `cv:results:emdash`

### NOT versioned (intentional)
- `cv:meta:last_sync` — sync timestamp metadata
- `cv:meta:data_version` — written by sync to confirm current version
- LLM cache KV entries — have their own hex-hash key scheme and 30-day TTL

### Bump procedure
1. Change `WORKER_DATA_VERSION = 'v3'` in `types.ts`
2. Deploy the worker
3. Run `/api/cv/sync` once — all data is written under the new prefix

### `handleSync` now writes ALL data tables
As of June 2026, the sync handler writes seniority, fields, voices, combos, and emdash connectors — previously these were read from KV but never written by sync, silently degrading to empty arrays on a cold cache. The sync response now returns `data_version` confirming the version written.

---

## Validation Pipeline

### Three endpoints (always call together via `runFullValidation`)

| Endpoint | Frontend function | What it checks |
|---|---|---|
| `POST /api/cv/validate` | `validateBullets(bullets)` | Banned phrases, structural rules per bullet |
| `POST /api/cv/validate-voice` | `validateVoice(bullets, brief)` | Voice consistency, rhythm, metric density |
| `POST /api/cv/semantic-match` | (internal) | JD keyword coverage via embedding similarity |

### Unified call (June 2026)

```typescript
// frontend/services/cvEngineClient.ts
const result = await runFullValidation(bullets, brief, jdText, cvText);
// result.bullets   — ValidateResult | null
// result.voice     — ValidateVoiceResult | null
// result.semantic  — SemanticMatchResult | null
// result.complete  — true only if all three returned non-null
```

Uses `Promise.allSettled` so a single endpoint failure doesn't block the other two. `result.complete === false` means the worker was partially unavailable (e.g., cold-starting).

### Where it's used
- `frontend/components/CVToolkit.tsx` — Quality Audit tab "Worker Validation" panel (triggered manually)
- `frontend/services/geminiService.ts` — post-generation validation pass via `validateVoice`

---

## Quality Pipeline

After CV generation, the text passes through several quality passes before being returned to the user:

1. **purifyCV** — removes first-person pronouns, fixes tense consistency, strips AI-isms
2. **cvNumberFidelity** — ensures numbers in the output match the profile (no hallucinated metrics)
3. **humanizer** — replaces banned phrases with natural alternatives from the seeded verb pool
4. **voice validator** — checks rhythm, metric density, opener variety against the brief
5. **runQualityPolishPasses** — bullet hygiene, pronoun fixes, orphan metric detection, rhythm monotony check

### HR Detector (pure-JS, no API)
`frontend/services/hrDetectorSimulation.ts` — 8-signal scorer that runs instantly in the browser:

| Signal | What it detects |
|---|---|
| Banned phrase density | Overused phrases the engine should have caught |
| Opener variety | First-word repetition across bullets |
| Round number ratio | Suspiciously round metrics (100%, $1M) |
| Pronoun leak | I/we/my in bullet text |
| AI-ism density | Generic AI phrases ("spearheaded", "leveraged") |
| Tense consistency | Mixed present/past tense within a role |
| Verb variety | Same action verb repeated too often |
| Metric ratio | Proportion of bullets with a quantified result |

Score ≥ 85 = clean. Score < 70 = recommend regeneration.

---

## CV Generation Pipeline

```
User clicks Generate
    │
    ├── 1. Market Research  (Gemini 2.0 Flash + Google Search grounding)
    │       → company intel, role requirements, salary range
    │
    ├── 2. ATS Gap Analysis  (scoreAtsCoverage — pure-JS, zero tokens)
    │       → top 12 missing keywords → gapPinBlock injected into prompt
    │
    ├── 3. Profile cache check  (D1 profile_cache)
    │       → {{PROFILE}} placeholder if cached, else full inline profile
    │
    ├── 4. Structural reference  (D1 cv_examples)
    │       → SHA-256 keyed blueprint for proven bullet-rhythm patterns
    │
    ├── 5. CV Generation  (workerParallelSections → Mistral Small 3.1 24B FREE)
    │       → sections generated in parallel, stitched together
    │
    └── 6. Quality Pipeline  (purify → fidelity → humanize → voice → polish)
            → stored as structural blueprint for next generation
```

### Model routing (as of June 2026)

| Task | Model | Cost |
|---|---|---|
| `cvGenerate`, `cvGenerateLong` | Mistral Small 3.1 24B | FREE |
| `cvAudit`, `cvExperience` | Mistral Small 3.1 24B | FREE |
| `humanize` | Hermes-2 Pro 7B | FREE |
| `jdDeepAnalysis` | DeepSeek-R1 32B | PAID |
| `embedding` | BGE-M3 | FREE |

GLM 4.7 Flash was remapped → Mistral Small 3.1 24B after CF infrastructure issues caused persistent 502s (May 2026).

---

## D1 Database Schema

Migrations live in `backend/cv-engine-worker/migrations/`. Run via:

```bash
npx wrangler d1 migrations apply cv-engine-db --env production
```

### Key tables

| Table | Purpose |
|---|---|
| `cv_verbs` | Action verb pool (category, tense, energy_level, human_score) |
| `cv_banned_phrases` | Phrases the humanizer replaces |
| `cv_rhythm_patterns` | Bullet sequence patterns (short→long→short→medium) |
| `cv_seniority_levels` | Bullet style by seniority (entry/mid/senior/lead) |
| `cv_field_profiles` | Language style by industry field |
| `cv_voice_profiles` | Tone profiles (conservative/balanced/bold) |
| `cv_seniority_field_combos` | Combined seniority+field rules |
| `llm_cache` | SHA-256 keyed LLM response cache (30-day TTL) |
| `cv_examples` | Structural blueprints for reference-guided generation |
| `profile_cache` | Compact profile cache to reduce prompt payload size |
| `cv_admin_tokens` | Multi-token admin auth (viewer/editor/admin roles) |
| `cv_leak_candidates` | AI-ism candidates pending promotion to banned list |

---

## Environment Variables & Secrets

### Cloudflare Worker (set in wrangler.toml or CF dashboard)

| Variable | Description |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `ADMIN_TOKEN` | Bootstrap admin token (use DB tokens in production) |

### Frontend (Vite env vars — set in Replit secrets)

| Variable | Description |
|---|---|
| `VITE_CV_ENGINE_URL` | Base URL of cv-engine-worker |
| `VITE_PDF_WORKER_URL` | Base URL of resume-pdf-worker |

### User-provided (stored in browser localStorage)
- `CLAUDE_API_KEY` — optional, enables Claude fallback
- `GEMINI_API_KEY` — optional, enables Gemini fallback + market research
- `GROQ_API_KEY` — legacy, no longer used in active provider chain
- `TAVILY_API_KEY` — job search and company research

---

## Deploy Runbooks

### Frontend (Vite build)

```bash
npm run build
# Output: dist/ — deploy to Vercel / static host
```

### CV Engine Worker

```bash
cd backend/cv-engine-worker
npx wrangler deploy --env production
# After deploy — run one sync to rebuild KV:
curl -X POST https://cv-engine-worker.dripstech.workers.dev/api/cv/sync \
  -H "X-Admin-Token: <token>"
```

### PDF Worker

```bash
cd backend/resume-pdf-worker
npx wrangler deploy --env production
```

### Local dev

```bash
npm run dev        # Vite dev server (frontend)
npm run pdf-server # Local Playwright PDF server (port 3001)
```

### Smoke tests

```bash
npm run test:pdf      # PDF renderer smoke test (both dev + prod)
npm run test:variance # CV variance / anti-monotony tests (36 checks)
```

---

## Admin API Reference

All admin endpoints require `X-Admin-Token` header.

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/cv/admin/stats` | viewer | Row counts + last sync time |
| `GET` | `/api/cv/admin/list?table=X` | viewer | List rows from an admin table |
| `POST` | `/api/cv/admin/bulk-add` | editor | Insert rows (auto-triggers sync) |
| `POST` | `/api/cv/admin/bulk-update` | editor | Update rows (auto-triggers sync) |
| `POST` | `/api/cv/admin/delete` | editor | Delete a row |
| `POST` | `/api/cv/admin/ai-audit` | viewer | Run AI audit on sample text |
| `POST` | `/api/cv/admin/voice-test` | viewer | Test voice validation |
| `GET` | `/api/cv/admin/tokens` | admin | List admin tokens |
| `POST` | `/api/cv/admin/tokens` | admin | Create admin token |
| `POST` | `/api/cv/admin/tokens/revoke` | admin | Revoke token |
| `GET` | `/api/cv/admin/leak-candidates` | viewer | List AI-ism leak candidates |
| `POST` | `/api/cv/admin/leak-candidates/decide` | editor | Promote or reject a candidate |
| `POST` | `/api/cv/sync` | editor | Rebuild KV cache from D1 |

### Token roles
- `viewer` — read-only access to stats and data
- `editor` — can insert/update/delete rows and trigger syncs
- `admin` — full access including token management

---

## Known Issues & Decisions

### Worker split — Phase 1 only (June 2026)
`index.ts` has been partially split: `types.ts` and `utils.ts` were extracted as shared modules. The handler functions (~84 total) remain in `index.ts` pending Phase 2. The split does not affect runtime behaviour — Wrangler bundles everything at deploy time.

**Phase 2 plan** (handler files):
- `handlers/data.ts` — handleHealth, handleWords, handleBanned, handleStructures, handleRhythm, handleSync
- `handlers/validation.ts` — handleClean, handleValidate, handleValidateVoice, handleSemanticMatch
- `handlers/brief.ts` — handleBrief + helpers
- `handlers/llm.ts` — handleTieredLLM, handleRaceLLM, handleParallelSections, handleProxyLLM
- `handlers/admin.ts` — all admin endpoints + token management
- `handlers/cache.ts` — LLM cache, CV examples, profile cache, market research, JD analysis
- `handlers/purify.ts` — handlePurifyCv, handleGetRules + text-transform helpers
- `handlers/leak.ts` — leak report/promote/cron
- `handlers/user.ts` — events, custom templates, user slots/prefs/data, share links, job cache

### GLM 4.7 Flash → Mistral Small (May 2026)
GLM 4.7 Flash returned empty text / HTTP 502 on CF infrastructure. All generation tasks were remapped to Mistral Small 3.1 24B which is confirmed FREE and stable.

### Cold-start circuit-breaker (May 2026)
The startup `workerStatusDiagnostic` probe was incorrectly calling `markFailure` when a model returned empty text (HTTP 200, no tokens — normal for cold models). Fixed: HTTP 200 + empty body → `cold_model`, not a failure. Only HTTP 5xx / network errors open the circuit.

### Scout 17B rhythm failure (documented, not fixed)
Scout 17B (Llama 4) passes 6/7 quality checks but consistently fails the rhythm-sequence check — it writes uniform-length bullets instead of short→long→short→medium sequences. Not used in production.

### Scout 17B empty response with JSON blobs
Scout 17B returns empty `llm_empty` HTTP 502 when the user prompt contains a literal JSON blob. Production code avoids this by describing schemas in plain English (see `geminiService.ts`).

### Semantic match endpoint requires JD
`POST /api/cv/semantic-match` requires a meaningful `jd` string to produce a useful score. When `jdText` is empty, `runFullValidation` still fires it but the semantic score will be 0% — this is expected and displayed as-is.

### Profile cache — graceful fallback
All profile cache operations are fire-and-forget. If the worker is unreachable, the app continues with the full inline profile in the prompt. No visible error to the user.

### replit.md
`replit.md` is a Replit-specific project README used by the AI agent. It does NOT affect the running application. This `MAINTENANCE.md` is the authoritative technical reference.
