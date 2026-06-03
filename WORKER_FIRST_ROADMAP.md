# ProCV — CV Engine Worker Roadmap

The CV Engine Worker (`backend/cv-engine-worker`) is the deterministic brain of ProCV. It handles verb pools, banned phrases, voice profiles, field detection, ATS scoring, and LLM caching — all without exposing API keys to the browser.

---

## Shipped (Production)

### Core Engine
- [x] Brief endpoint (`/api/cv/brief`) — returns seniority, field, voice, rhythm, verb pool, forbidden phrases
- [x] Worker brief injected into every LLM generation prompt via `buildBrief()`
- [x] Leak-report loop — candidates fed back for admin review and auto-promotion
- [x] JD keyword scoring for field detection (`jd_keywords` on all 17 field profiles)
- [x] KV cache for hot lookups — verb pools, banned phrases, field profiles

### Vocabulary Management (Admin)
- [x] Add verb (single + CSV bulk)
- [x] Add banned phrase / sentence (pipe-separated bulk) — multi-word AI-isms
- [x] Add banned word (single-word AI-isms: `synergy`, `leverage`, `robust`, etc.) with 60-word seed pack
- [x] Add voice profile, field profile (incl. `jd_keywords`), opener
- [x] Counts grid + KV sync button
- [x] Leak queue with bulk promote / reject + severity picker
- [x] Per-row delete + searchable row browser per table
- [x] Inline edit per row with auto KV sync
- [x] Word-frequency overuse detection (`findOverusedWords` — stem-collapsing, stopword-aware, 5+ uses triggers rewrite)
- [x] Verb pool expanded to **1,012 verbs** (technical, analysis, financial, creative, management, communication)

### Auth & Security (Admin)
- [x] Multi-role admin tokens — `viewer`, `editor`, `admin` (hierarchical)
- [x] SHA-256 hashed token storage — plaintext returned once at creation only
- [x] Token CRUD — mint, list, revoke; last-used tracking
- [x] Bootstrap `ADMIN_TOKEN` env var remains as permanent admin fallback

### AI Integration
- [x] AI Auditor tab — Workers AI (`llama-3.1-8b-instruct`) second pass on top of regex rules
- [x] Voice Tester — force a voice profile, paste bullets, get per-bullet pass/fail with issue codes
- [x] Worker A/B diagnostic — compare Workers AI vs Groq on 7 deterministic metrics

### Caching & Performance
- [x] D1 LLM response cache (`llm_cache`) — SHA-256 key, 30-day TTL, auto-cleanup on write
- [x] Profile cache (`profile_cache`) — compact profile stored by hash, replaces `{{PROFILE}}` in prompts
- [x] CV examples pool (`cv_examples`) — structural blueprints keyed by role+seniority+purpose+mode
- [x] Circuit breaker — opens on 5xx / timeout; cold-start false positives fixed
- [x] Model prewarm — fires 16-token probes at boot for all three production models

### Telemetry
- [x] Brief request telemetry (`cv_request_telemetry`) — seniority, field, voice, field_source logged per request
- [x] LLM provider chain events (`procv:provider-chain`) — real-time banner showing provider health

---

## In Progress / Planned

### 1. Strict Worker-First Mode
**Status**: Planned  
Add an optional env flag (`REQUIRE_WORKER_BRIEF=true`) that surfaces an explicit "engine unavailable" error if the worker is unreachable, instead of silently falling back to the generic prompt. Gives production clarity.

### 2. Source Ingestion Pipeline
**Status**: Planned  
- Automated collector for high-quality CV corpora, curated job posts, and GitHub profile signals
- Normalise + dedupe + quality-score before D1 insertion
- Target: expand field profiles from 17 → 35+ with richer keyword sets

### 3. Staging / Review Tables
**Status**: Planned  
Add `pending_verbs`, `pending_phrases`, `pending_keywords` review tables before promotion to production. Prevents unreviewed data from affecting live generation immediately.

### 4. A/B Evaluation Loop
**Status**: Planned  
- Track `brief_version` alongside output quality metrics (ATS score, interview conversion proxy)
- Promote profile packs only when they demonstrably improve output quality
- Dashboard view in the admin panel showing pack performance over time

### 5. Per-Field Confidence Thresholds
**Status**: Planned  
If JD keyword match score is below a threshold, fall back to a safer generalized profile rather than a weak field-specific one. Prevents mis-classification from degrading output.

### 6. Versioned Profile Packs
**Status**: Planned  
Add `pack_id` + `version` tags to field profiles so rollbacks are instant and pack history is queryable. Useful for A/B testing and incident recovery.

### 7. Semantic Keyword Matching
**Status**: Partial (Workers AI `@cf/baai/bge-small-en-v1.5` available)  
Replace exact-match JD keyword scoring with embedding similarity. The embedding model is already bound — needs a scoring endpoint and threshold calibration.

### 8. Multilingual CV Support
**Status**: Partial (Mistral Small 3.1 handles non-English well)  
Extend field profiles and verb pools for French, German, and Spanish. Expose language selector in the CV Generator. Worker brief already passes `language` field — just needs populated data.

---

## Operational Checklist

Run after any worker code change, seed change, or D1 migration:

```bash
# Deploy worker
cd backend/cv-engine-worker
npx wrangler deploy

# Re-seed if verb/phrase data changed
node scripts/seed.cjs

# Sync KV cache
curl -X POST -H "X-Admin-Token: $TOKEN" \
  https://cv-engine-worker.dripstech.workers.dev/api/cv/sync
```

Then in-app: open `#admin/cv-engine` → **Refresh** → verify counts grid matches `node scripts/stats.cjs`.

---

## D1 Tables

| Table | Purpose |
|-------|---------|
| `cv_voice_profiles` | Voice archetypes (technical_specialist, analytical_strategist, etc.) |
| `cv_field_profiles` | Field-specific verb pools, jd_keywords, seniority modifiers |
| `cv_verbs` | 1,012 action verbs by category and tense |
| `cv_banned_phrases` | Multi-word AI-isms + corporate clichés |
| `cv_banned_words` | Single-word AI-isms |
| `cv_openers` | Bullet opener patterns by voice and seniority |
| `cv_admin_tokens` | Hashed admin tokens with roles |
| `cv_leak_candidates` | Reported phrases pending review |
| `llm_cache` | LLM response cache (SHA-256 key, 30-day TTL) |
| `cv_examples` | Structural blueprints by role fingerprint |
| `profile_cache` | Compact profile JSON by SHA-256 hash |
| `cv_request_telemetry` | Brief request logs — field, voice, seniority, field_source |

---

*Last updated: June 2026*
