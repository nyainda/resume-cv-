# ProCV — Rolling Build Progress

Tick `[x]` as items ship. Add new sections under "In progress" as we pick up new phases. This file is the running counterpart to `CV_ENGINE_HANDOFF.md` (which is the static snapshot at the end of Phase F).

---

## Replit environment migration
- [x] Install npm dependencies
- [x] Start app workflow (Vite on :5000)
- [x] Start PDF server workflow (Playwright on :3001)
- [x] Confirm CV engine worker + D1 are reachable from the frontend (`VITE_CV_ENGINE_URL` set in `.replit`, `services/cvEngineClient.ts` calls `/api/cv/brief` on every generation)
- [x] Confirm banned-phrase enforcement is live (worker `/api/cv/banned` → KV cache → `enforceVoiceConsistency`)

## Admin — vocabulary management
- [x] Add Verb (single + CSV bulk)
- [x] Add Banned **Phrase / Sentence** (pipe-separated bulk) — multi-word AI-isms
- [x] Add Banned **Word** (new tab) — single-word AI-isms (`synergy`, `leverage`, `robust`, …) with one-click seed-pack to load 60 common buzzwords
- [x] Add Voice profile
- [x] Add Field profile (incl. `jd_keywords`)
- [x] Add Opener
- [x] Counts grid + KV sync button
- [x] Promote leaks → engine button on `#admin/leaks`

## In progress / next up (pick from `CV_ENGINE_HANDOFF.md` §7)
- [ ] **G** — Backfill `jd_keywords` for every `cv_field_profiles` row so JD-based field detection actually fires (currently many fields fall back to alphabetical default). Use the new Browse / Edit tab to add keywords inline.
- [x] **G.1** — Worker route `POST /api/cv/admin/bulk-update` shipped + inline edit in admin UI (Browse / Edit tab, "Save" button per row, KV auto-syncs).
- [x] **G.2** — Worker route `POST /api/cv/admin/delete` shipped + per-row delete button + searchable row browser per table (`GET /api/cv/admin/list?table=…&q=…&limit=…&offset=…`). Worker redeployed (version `517ad63c`).
- [ ] **H** — Multi-token / role-based admin auth (`cv_admin_tokens` table)
- [x] **I** — Leak miner queue + nightly cron. New table `cv_leak_candidates` (migration `004_leak_candidates.sql`, applied to prod D1). Public route `POST /api/cv/leak-report` upserts reported phrases (skips ones already banned, caps at 100 phrases / 80 chars each). Admin routes `GET /api/cv/admin/leak-candidates?status=pending|promoted|rejected` and `POST /api/cv/admin/leak-candidates/decide` (`{ids, decision:'promote'|'reject', severity}`). Cron Trigger `15 3 * * *` runs `runLeakPromotionCron` which auto-promotes any pending row with `count >= 5` into `cv_banned_phrases` with `reason='auto_promoted'`/`severity='medium'`, then resyncs the KV cache. New admin tab "Leak Queue" shows the queue with select-all + bulk promote/reject + severity picker, highlights rows that have crossed the threshold. Worker redeployed (version `07cd9cd5`).
- [x] **J** — Voice Tester admin tab + worker route `POST /api/cv/admin/voice-test`. Pick a voice profile (forces it past the JD scorer), optional field/seniority/section, paste candidate bullets, get back the brief that was used + per-bullet pass/fail with severity-coded issues (verb outside pool, avoided verb for field, forbidden phrase, rhythm drift, verbosity drift, metric ratio, repeated verb). Refactored `handleBrief` → `buildBriefData()` and `handleValidateVoice` → `computeVoiceValidation()` for reuse.
- [x] **AI Auditor** — Workers AI is now actually wired up (was bound but unused). New admin tab + worker route `POST /api/cv/admin/ai-audit` runs `@cf/meta/llama-3.1-8b-instruct` as a SECOND PASS on top of the deterministic regex rules. Strict JSON-only system prompt, server-side validates each finding appears verbatim in the text, dedupes against the existing banned list, caps at 15 findings. UI shows severity-coded findings with checkbox-pickable promotion straight into `cv_banned_phrases` (KV auto-syncs after). Deterministic rules in `handleClean` / `handleValidate` stay as the fast/free first pass — AI only fills the gap of *novel* AI-isms the admin hasn't seen yet. Worker redeployed (version `1083b425`).
- [ ] **K** — Telemetry of which `(seniority, field, voice)` combos are actually requested

## Operational checklist (run after touching the worker or seeds)
```
cd cv-engine-worker
npx wrangler deploy --env=""
node scripts/seed.cjs
curl -X POST -H "X-Admin-Token: $TOKEN" \
  https://cv-engine-worker.dripstech.workers.dev/api/cv/sync
```
Then in-app: open `#admin/cv-engine`, hit **Refresh**, the counts grid should match `node cv-engine-worker/scripts/stats.cjs`.
