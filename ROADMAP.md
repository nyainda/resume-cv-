# ProCV — Master Roadmap
*Based on: Engine, Pipeline & Competitive Roadmap audit (June 2026)*
*Tick [x] when an item ships and is deployed to Cloudflare.*

---

## Engine Inventory — What Already Works ✅

These are confirmed working from code audit (June 2026):

| Component | Confirmed |
|-----------|-----------|
| 7-pass purification pipeline (Steps 0–6) | ✅ |
| Brief builder — 6 parallel KV reads, JD×3 weight, voice matrix | ✅ |
| Tiered model routing (task → right model) | ✅ |
| Race LLM + fallback chain (`Promise.any()`) | ✅ |
| Parallel sections fan-out with per-section fallback | ✅ |
| System prompts stay in worker (IP protected) | ✅ |
| Scenario blocks A/B/C/D (fresh grad → pivot → thin exp) | ✅ |
| Career pivot template (bridge formula + reframe rules) | ✅ |
| HR detector simulation (8 signals, 0–100) | ✅ |
| Number fidelity (source-grounded, orphan cleanup) | ✅ |
| Voice fidelity (first-person strip, tense normalise) | ✅ |
| Seniority coherence (date math, career arc audit) | ✅ |
| Leak miner + nightly cron (auto-promotes ≥5 sightings) | ✅ |
| Semantic match via CF AI embeddings | ✅ |
| Verb pool expanded to 1 012 verbs (6 categories) | ✅ |
| 19 D1 migrations (004–019), clean chain, no skips | ✅ |
| LLM response cache in D1 (migration 008) | ✅ |
| CV examples pool + structural blueprints (migrations 009, 017, 018) | ✅ |
| Profile cache in D1 (migration 010) | ✅ |
| Market research cache (migration 011) | ✅ |
| JD analysis cache (migration 012) | ✅ |
| CV share links (migration 013) | ✅ |
| CV events table — server-side tracking skeleton (migration 015) | ✅ |
| Custom templates store (migration 016) | ✅ |
| Multi-role admin token system (migration 007) | ✅ |
| Leak queue with admin review UI (migration 004) | ✅ |
| Word frequency check + overused-word rewrite loop | ✅ |
| Handler split — `brief.ts`, `purify.ts`, `llm.ts`, `validation.ts`, etc. | ✅ |
| Admin page — verbs, banned phrases, voices, fields, openers data entry | ✅ |
| AI Auditor (Llama second-pass for novel AI-isms, admin tab) | ✅ |

---

## PHASE 1 — Fix The Cracks (Engine Integrity)
*These are gaps that silently hurt quality. Fix before growing.*

- [ ] **1.1 — Worker purify-cv: dedup pass**
  - Add prefix-based dedup after Step 4 in `handlePurifyCv()` in `handlers/purify.ts`
  - Prevents duplicate bullets for job-agent and direct API consumers
  - **Effort:** 1 hour

- [ ] **1.2 — Close the Leak Miner → Purify loop**
  - After static `_SUBS` pass in `handlePurifyCv()`, add a second dynamic pass that fetches `cv:banned:all` from KV and applies new AI-isms
  - Right now the loop is broken: phrases auto-promoted by the cron never get fixed in new CVs
  - **Effort:** 2 hours

- [ ] **1.3 — Wire the 3 dead tables into the brief**
  - `cv_openers` (27 rows), `cv_context_connectors` (32 rows), `cv_result_connectors` (42 rows) are seeded and KV-synced but never read by `buildBriefData()`
  - Add 3 more parallel KV reads (total goes from 6 → 9), pick 4 random openers + top-scored result/context connectors, return as `opener_suggestions`, `result_connectors`, `context_connectors`
  - Single biggest quality win — directly improves HR detector verb-saturation score
  - **Effort:** 3 hours

- [ ] **1.4 — `handleClean` input length guard**
  - Cap the text input to 50 000 chars: `const text = String(body?.text || '').slice(0, 50_000);`
  - Prevents abuse and worker timeout from huge payloads
  - **Effort:** 15 minutes

---

## PHASE 2 — Beat Resume Worded (Score My CV)
*Direct competitor killer. Build after Phase 1 is solid.*

- [ ] **2.1 — "Score My CV" full feature**
  - Composite score (0–100) across 5 dimensions already built: ATS Compatibility (`/api/cv/validate`), Human Voice Score (`hrDetectorSimulation`), Bullet Quality (`cvQualityGate`), Career Progression (`cvSeniorityCoherence`), JD Match (`/api/cv/semantic-match`)
  - UI: upload/paste CV → optional JD → parallel score → expandable per-dimension panels with exact failing bullets → "Fix My CV Automatically" CTA
  - Anti-gaming: 72% JD match = green ✅, 95% = amber ⚠️ "looks keyword-stuffed"
  - Zero new infrastructure — all endpoints already exist
  - **Effort:** 3–4 days

- [ ] **2.2 — Career Pivot Score page**
  - When `cvSeniorityCoherence` or field detection detects background field ≠ JD field, don't penalise — explain
  - Show: "Career Pivot Detected: Agri-Engineering → Software Dev", what transfers, what gaps, what to add
  - Resume Worded marks this as a bad CV. ProCV explains and helps fix it.
  - **Effort:** 1 day

- [ ] **2.3 — LinkedIn Score page**
  - Basic LinkedIn headline + summary scorer (re-use `cvQualityGate` logic adapted for LinkedIn text format)
  - Free — funnel users into the CV generation flow
  - Competes for Resume Worded's #1 keyword ("LinkedIn resume checker") on Google
  - **Effort:** 2 days

---

## PHASE 3 — Expand the Engine (Seed Data + Field Coverage)

- [ ] **3.1 — Add 9 missing field profiles**
  - Use the Admin CV Engine page already built
  - Missing: `nursing_medical`, `accounting_audit`, `hospitality_tourism`, `real_estate_property`, `media_journalism`, `construction_site`, `customer_success`, `research_academia`, `supply_chain_logistics`
  - Each needs: `jd_keywords[]`, `preferred_verbs[]`, `avoided_verbs[]`, `metric_types[]`
  - **Effort:** 1 day

- [ ] **3.2 — Add missing seniority + field combos**
  - Currently 23 combos out of 85 possible (17 fields × 5 levels = 85). Covering ~27%.
  - Most critical: `entry+healthcare_clinical`, `entry+education_teaching`, `junior+data_analytics`, `senior+finance`, `lead+product_management`, `entry+sales_commercial`, `mid+communications_marketing`, `senior+hr_people`
  - Each combo needs `forbidden_phrases[]` — what sounds wrong at that level in that field
  - **Effort:** 3 hours

- [ ] **3.3 — Voice-specific summary formulas**
  - All 13 voices currently use the same 4-line summary structure
  - Add `summary_formula` to each voice profile in `cv_voice_profiles` so `analytical_thinker` (verbosity 4) produces a different shape than `hands_on_builder` (verbosity 2)
  - **Effort:** 1 day

- [ ] **3.4 — Rhythm patterns for Projects + Education sections**
  - `current_role`, `past_role`, `internship`, `summary` have rhythms — `projects` and `education` have none
  - Scenario C (no experience, has projects) is hurt most — projects are the main work history but get no rhythm enforcement
  - Add: `project_showcase`, `project_minimal`, `education_rich` patterns
  - **Effort:** 2 hours

- [ ] **3.5 — Cover letter brief injection**
  - Cover letter generation uses the same system prompt as CV generation but never receives the brief
  - Voice chosen for the CV is ignored for the cover letter → they sound like different people
  - Fix: pass the same brief used for CV generation as additional context in the cover letter prompt
  - **Effort:** 3 hours

- [ ] **3.6 — Verb energy routing by seniority**
  - Every verb has `energy_level` (high/medium/low) — tracked in DB but never used
  - Senior/Lead CVs should lead with high-energy verbs; Entry CVs should use medium/low
  - Sort `verbPool` by energy level before slicing to 30, based on seniority tier
  - **Effort:** 1 hour

---

## PHASE 4 — Distribution & Monetization

- [ ] **4.1 — SEO proxy landing pages**
  - Target Resume Worded's top keywords: `/ats-checker`, `/cv-score`, `/resume-checker/software-engineer`, `/resume-checker/kenya`, `/resume-checker/nigeria`
  - Each page = lightweight Score My CV tool (Phase 2.1) + "Fix My CV" CTA
  - **Effort:** 1 week

- [x] **4.2 — Server-side generation tracking foundation**
  - `cv_events` table exists (migration 015) — tracking skeleton is in place
  - *Next: wire actual event writes into `handleTieredLLM` and `handleParallelSections` before any paid gating*

- [ ] **4.3 — Remove download gate reset button**
  - The download gate modal has a "Reset my counter" button — users bypass the gate instantly
  - Remove the reset button. Track downloads server-side in D1 via cv_events.
  - **Effort:** 30 minutes

- [ ] **4.4 — Stripe integration (Global Payments)**
  - Free: 3 CV generations/month, 2 downloads, Score My CV unlimited
  - Pro ($8/mo): unlimited generations, all features, cover letter, priority models
  - BYOK (free forever): bring Groq/Gemini key — all features, user pays AI costs
  - Score My CV stays free forever — it is the acquisition funnel, not the product
  - **Effort:** 2–3 days

---

## Priority Order (Master Table)

| Priority | Item | Effort | Why |
|----------|------|--------|-----|
| 🔴 1 | 1.3 Wire 3 dead tables into brief | 3 hrs | Biggest quality win, zero infra cost |
| 🔴 2 | 1.2 Close leak miner → purify loop | 2 hrs | Self-improvement loop is currently broken |
| 🔴 3 | 1.1 Worker purify-cv dedup pass | 1 hr | Duplicate bullets fixed for all consumers |
| 🔴 4 | 1.4 handleClean length guard | 15 min | Security + stability |
| 🟡 5 | 3.6 Verb energy routing by seniority | 1 hr | Easy quality win |
| 🟡 6 | 3.4 Rhythm patterns for projects + education | 2 hrs | Fixes fresh grad CVs (Scenario C) |
| 🟡 7 | 3.5 Cover letter brief injection | 3 hrs | Voice consistency across documents |
| 🟠 8 | 2.1 Score My CV feature | 3–4 days | Direct Resume Worded killer |
| 🟠 9 | 2.2 Career Pivot Score | 1 day | Owns career-changer market |
| 🟠 10 | 2.3 LinkedIn Score page | 2 days | SEO + acquisition funnel |
| ⚪ 11 | 3.1 Add 9 missing field profiles | 1 day | Global demographic coverage |
| ⚪ 12 | 3.2 Missing seniority+field combos | 3 hrs | Better forbidden phrases per level |
| ⚪ 13 | 3.3 Voice summary formulas | 1 day | Voice extends to summary section |
| ⚪ 14 | 4.3 Remove download gate reset button | 30 min | Gate actually works |
| ⚪ 15 | 4.2 Wire cv_events into generation handlers | 4 hrs | Required before any paid gating |
| ⚪ 16 | 4.4 Stripe integration | 2–3 days | Revenue |
| ⚪ 17 | 4.1 SEO proxy pages | 1 week | Distribution |

---

## The Big Picture

```
Phase 1 — Fix the cracks (engine integrity)
    ↓
Phase 2 — Score My CV (beats Resume Worded)
    ↓
Phase 3 — Expand engine (field coverage, voice depth)
    ↓
Phase 4 — SEO proxy + Stripe (distribution + revenue)
```

> The engine is already the moat.
> Phase 2 is the weapon.
> Phase 4 is the war.
>
> Slow by slowly 😂🔥
