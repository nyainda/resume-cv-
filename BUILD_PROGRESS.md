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
- [ ] **G** — Backfill `jd_keywords` for every `cv_field_profiles` row so JD-based field detection actually fires (currently many fields fall back to alphabetical default)
- [ ] **G.1** — Worker route `POST /api/cv/admin/bulk-update` (or `mode: 'upsert'`) so admin UI can edit existing rows, not just append
- [ ] **G.2** — Worker route `POST /api/cv/admin/delete` + admin row-browser per table
- [ ] **H** — Multi-token / role-based admin auth (`cv_admin_tokens` table)
- [ ] **I** — Cron Trigger that auto-promotes high-frequency leak phrases into `cv_banned_phrases` with `source='auto_promoted'` + review queue
- [ ] **J** — Voice-profile editor + bullet tester (paste a bullet, pick a voice, see which rules fire)
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
