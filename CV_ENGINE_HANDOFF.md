# CV Engine — Handoff Notes

Status as of the end of Phase F (2026-04-23). Read this first before continuing.

---

## 1. What the CV Engine is

A Cloudflare-hosted system (D1 + KV + Workers) that supplies the CV generator with structured "human-writing" rules so generated bullets sound like a real person, not an AI. The frontend (`services/geminiService.ts → generateCV`) calls the engine for:

1. A **brief** (verbs, banned phrases, voice profile, structure quotas) injected into the LLM prompt.
2. A post-pass **voice-consistency validator** (`enforceVoiceConsistency`) that rewrites bullets failing the voice rules via Groq.

Both reads are cached in Cloudflare KV for low latency; D1 is the source of truth.

---

## 2. Live infrastructure

| Resource              | ID / URL                                                    |
|-----------------------|-------------------------------------------------------------|
| Cloudflare account    | `3b2dc03a15c292df3054249f73a321bb`                          |
| D1 database           | `5193fa77-54c8-4e49-bf3a-c615af170191` (`cv-engine-db`)     |
| KV namespace          | `8e1722f00d9641b7a8f611b76dac8361` (`CV_KV`)                |
| Worker URL            | https://cv-engine-worker.dripstech.workers.dev              |
| Frontend env var      | `VITE_CV_ENGINE_URL` → worker URL                           |

Secrets on the worker:
- `ADMIN_TOKEN` — required to call any `/api/cv/admin/*` route or `POST /api/cv/sync`. Set via `wrangler secret put ADMIN_TOKEN` from `cv-engine-worker/`.

Local env vars (Replit Secrets) used **only** by `cv-engine-worker/scripts/*.cjs`:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

These let the seed scripts hit D1 directly via the Cloudflare REST API — no `wrangler login` required.

---

## 3. Current DB content (after Phase F seed)

```
cv_verbs                    258
cv_banned_phrases           197
cv_openers                   27
cv_context_connectors        32
cv_result_connectors         42
cv_sentence_structures       76
cv_rhythm_patterns           12
cv_paragraph_structures      12
cv_subjects                  12
cv_seniority_levels           5
cv_field_profiles            17
cv_seniority_field_combos    23
cv_voice_profiles            13
```

KV cache is in sync; the worker writes `cv:meta:last_sync` (epoch ms) on every sync.

---

## 4. Worker routes (`cv-engine-worker/src/index.ts`)

Public reads (cached via KV):
- `GET /health`
- `GET /api/cv/verbs?category=…&tense=…`
- `GET /api/cv/banned`
- `GET /api/cv/openers`
- `GET /api/cv/voices`
- `GET /api/cv/voice/:name`
- `GET /api/cv/field/:field`
- `GET /api/cv/structures`
- `GET /api/cv/rhythms`
- `GET /api/cv/brief?seniority=…&field=…&voice=…&jd=…` ← used by `geminiService`

Admin (requires `X-Admin-Token` header matching `ADMIN_TOKEN`):
- `GET /api/cv/admin/stats` → `{ ok, counts, last_sync }`
- `POST /api/cv/admin/bulk-add` body `{ table, rows[] }` → inserts (max 500), auto-syncs KV
- `POST /api/cv/sync` → rebuilds every KV key from D1, writes `cv:meta:last_sync`

Whitelisted tables for `bulk-add` are the 13 `cv_*` tables.

---

## 5. Frontend

- `services/cvEngineClient.ts` — read API, KV-backed banned-phrase cache, plus admin client functions: `getAdminToken`, `setAdminToken`, `fetchAdminStats`, `bulkAddRows`, `triggerSync`. Token stored in `sessionStorage['cv_engine_admin_token']`.
- `services/geminiService.ts` — `generateCV` fetches the brief and runs `enforceVoiceConsistency` after generation.
- `components/AdminCVEnginePage.tsx` — full admin UI at `#admin/cv-engine`. Forms for verbs (CSV bulk), banned phrases (pipe-separated bulk), voices, fields, openers. Counts grid + Sync KV button.
- `components/AdminLeaksPage.tsx` — at `#admin/leaks`. Each top-leaking phrase now has **two** promote buttons: "+ Local" (existing telemetry server) and "+ Engine" (new — pushes to CV engine D1 via `bulkAddRows('cv_banned_phrases', …)`). The "+ Engine" button only renders when an engine admin token is saved.
- `App.tsx` — hash routing: `#admin/leaks` and `#admin/cv-engine` are hidden admin views.

---

## 6. Seed scripts (`cv-engine-worker/scripts/`)

- `_lib.cjs` — shared `d1Query`, `kvPut`, `runConcurrent` helpers (REST API direct).
- `gen-expansion.cjs` — generates `seeds/seeds-expansion.json` (205 verbs, 139 banned phrases, etc.). Re-run if you tweak the inline lists.
- `seed.cjs` — merges `seeds/seeds.json` + `seeds/seeds-expansion.json` and inserts via `INSERT OR IGNORE`. Idempotent.
- Schema: `cv-engine-worker/schema.sql` (13 tables).

To redeploy + reseed:
```
cd cv-engine-worker
npx wrangler deploy --env=""
node scripts/seed.cjs        # idempotent, safe to rerun
curl -X POST -H "X-Admin-Token: <token>" https://cv-engine-worker.dripstech.workers.dev/api/cv/sync
```

---

## 7. Phases done (✓) vs not done (✗)

✓ **A** — D1 schema + initial seeds.
✓ **B** — KV sync + read routes (`/health` reports phase B but routes through E are live).
✓ **C** — Brief builder route (`/api/cv/brief`).
✓ **D** — `geminiService.generateCV` wired to the brief.
✓ **E** — Voice consistency validator (`enforceVoiceConsistency`) with Groq rewrite of failing bullets.
✓ **F** — Massive seed expansion + admin UI + leaks→engine promotion button.

**Remaining / candidate phases (the next AI should pick from these):**

✗ **G — Field-detection coverage.** `/api/cv/brief` chooses a field profile by JD-keyword overlap, but many fields still have empty `jd_keywords`, so it falls back to alphabetical default. Audit `cv_field_profiles.jd_keywords` and fill them in (admin UI's "Add Field" form supports this — or do a `bulk-add` migration script that updates existing rows; note that current `bulk-add` is `INSERT OR IGNORE`, not UPDATE — see next item).
✗ **G.1** — `bulk-add` does not support updates. Add a sibling endpoint `POST /api/cv/admin/bulk-update` (or extend with `mode: 'upsert' | 'insert'`) so the admin UI can edit existing rows, not just append. Right now the only way to fix a bad row is to delete via raw D1.
✗ **G.2** — Add `POST /api/cv/admin/delete` (whitelisted by table + id). Frontend should grow a row-browser per table.
✗ **H — Roles & multi-token auth.** Single `ADMIN_TOKEN` is fine for one operator. If you want analyst-only / writer / superadmin tiers, introduce a `cv_admin_tokens` table or store role claims in a JWT. The "Part 11 API roles" note in the original brief lives here.
✗ **I — Leak miner background job.** Today leaks → engine promotion is one-click manual. Add a Cron Trigger on the worker that pulls high-frequency leak phrases from the telemetry server and auto-creates `cv_banned_phrases` rows tagged `auto_promoted` (with a review queue in the admin UI).
✗ **J — Voice-profile tuning UI.** `AdminCVEnginePage` can ADD voices but not tweak existing ones. Plus a tester: paste a bullet, pick a voice, see which rules fire (uses the existing `enforceVoiceConsistency` logic exposed as an endpoint).
✗ **K — Telemetry of brief usage.** Log which `(seniority, field, voice)` combos are actually requested, so the seed list can be pruned to what's used.

---

## 8. Known gotchas

- `cv-engine-worker/src/index.ts` `/health` still returns `phase: "B"` — cosmetic, update if you want.
- `bulk-add` payload cap = 500 rows. The seed script chunks naturally because each table is small.
- `cv_seniority_field_combos` table uses column `notes`, **not** `default_voice` (we hit this during F). The expansion generator now formats `default voice: <name>` into `notes`.
- KV reads in the worker fall through to D1 on miss — so a stale KV is never wrong, only slower. The brief route always reads live D1 anyway (it's a dynamic join).
- Pre-existing TS errors in `App.tsx` / `vite.config.ts` are unrelated to engine work; do not chase them as part of engine phases.
- The frontend admin token lives in `sessionStorage`, so closing the tab requires re-entering it. This is intentional — do not move it to `localStorage` without a logout flow.
- `services/telemetryService.ts` `promoteToBannedList` writes to the **local telemetry SQLite**, not D1. The two banned lists are independent — the purifier reads the telemetry one at runtime, the brief builder reads the D1 one. Keep them in sync via the Leaks page's two-button promote.

---

## 9. Quick smoke tests

```bash
# Public read
curl https://cv-engine-worker.dripstech.workers.dev/api/cv/brief?seniority=senior&field=engineering&voice=numbers_first

# Admin stats (replace TOKEN)
curl -H "X-Admin-Token: TOKEN" https://cv-engine-worker.dripstech.workers.dev/api/cv/admin/stats

# Force KV resync
curl -X POST -H "X-Admin-Token: TOKEN" https://cv-engine-worker.dripstech.workers.dev/api/cv/sync
```

In-app: open `#admin/cv-engine`, paste the token once, hit "Refresh" — counts grid should match section 3 above.
