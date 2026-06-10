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

- [x] **1.1 — Worker purify-cv: dedup pass**
  - Added prefix-based dedup (first-6-word key) after tense-flipping in `handlePurifyCv()` in `handlers/purify.ts`
  - Prevents duplicate bullets for job-agent and direct API consumers
  - Deployed: worker version `13a83637` → superseded by Phase 1 deploy

- [x] **1.2 — Close the Leak Miner → Purify loop**
  - Added dynamic KV pass in `handlePurifyCv()`: fetches `cv:banned:all` after static `_SUBS` pass, applies leak-miner-promoted phrases to summary, experience bullets, and project descriptions
  - Wrapped in try/catch so KV outage is graceful
  - Self-improvement loop is now closed

- [x] **1.3 — Wire the 3 dead tables into the brief**
  - `cv_openers`, `cv_context_connectors`, `cv_result_connectors` now read in `buildBriefData()` — 6 → 9 parallel KV reads
  - Brief now returns `opener_suggestions` (4 random), `result_connectors` (top 6 by score), `context_connectors` (6)
  - Single biggest quality win — directly improves HR detector verb-saturation score

- [x] **1.4 — `handleClean` input length guard**
  - Capped rawText to 50 000 chars in `handleClean()` in `handlers/validation.ts`
  - Prevents abuse and worker timeout from huge payloads

---

## PHASE 2 — Beat Resume Worded (Score My CV)
*Direct competitor killer. Build after Phase 1 is solid.*

- [x] **2.1 — "Score My CV" full feature**
  - New view `"score"` + `ScoreMyCVPage.tsx` component (350 lines)
  - 4 active dimensions: Human Voice (scoreHRDetection — 8 signals, 0–100), Bullet Quality (inline regex scorer — 7 checks, 0–100), Career Logic (auditSeniorityCoherence — overreach/underreach, 0–100), ATS Match (scoreAtsCoverage — JD keyword gap, 0–100, optional)
  - Composite score = weighted average (equal weights; ATS excluded if no JD pasted)
  - SVG gauge, animated progress bars, expandable per-dimension issue panels with specific fix instructions
  - Anti-gaming: ATS >88% = amber warning "looks keyword-stuffed — aim for 65–80%"
  - "Fix My CV →" CTA routes to CV Generator; "Re-score with JD" inline JD input
  - Zero LLM tokens, zero network calls, results in <1 second
  - Nav item: "Score My CV" in the Tools group with bar-chart icon

- [x] **2.2 — Career Pivot Score page**
  - New view `"pivot"` + `CareerPivotPage.tsx` component
  - Detects profile field vs JD field using `detectField`; flags when they differ
  - Shows: pivot score (0–100), transferable universal skills, field-specific bridge skills already present, bridge skills missing, top JD keyword gaps via `scoreAtsCoverage`, and a numbered action plan specific to the target field
  - All deterministic — zero LLM calls, instant results
  - Nav item: "Career Pivot" in Tools group with swap-arrows icon

- [ ] **2.3 — LinkedIn Score page**
  - Basic LinkedIn headline + summary scorer (re-use `cvQualityGate` logic adapted for LinkedIn text format)
  - Free — funnel users into the CV generation flow
  - Competes for Resume Worded's #1 keyword ("LinkedIn resume checker") on Google
  - **Effort:** 2 days

---

## PHASE 3 — Expand the Engine (Seed Data + Field Coverage)

- [x] **3.1 — Add 9 missing field profiles**
  - Migration `021_field_profiles_expansion.sql` adds: `nursing_medical`, `accounting_audit`, `hospitality_tourism`, `real_estate_property`, `media_journalism`, `construction_site`, `customer_success`, `research_academia`, `supply_chain_logistics`
  - Each has realistic `jd_keywords[]`, `preferred_verbs[]`, `avoided_verbs[]`, `metric_types[]` drawn from domain conventions

- [x] **3.2 — Add missing seniority + field combos**
  - Migration `022_seniority_combos_expansion.sql` adds 10 combos: `entry+healthcare_clinical`, `entry+education_teaching`, `junior+data_analytics`, `senior+finance`, `lead+product_management`, `entry+sales_commercial`, `mid+communications_marketing`, `senior+hr_people`, `mid+tech`, `entry+consulting`
  - Each combo has `forbidden_phrases[]` — credibility-break phrases wrong at that level in that field

- [x] **3.3 — Voice-specific summary formulas**
  - Migration `023_voice_summary_formulas.sql` adds `summary_formula TEXT` to `cv_voice_profiles`
  - 7 formula patterns keyed by verbosity_level + metric_preference — terse/results-first (v1–2+high), balanced analytical (v3+high), balanced mid-range (v3+medium), mission/people (v3+low), expansive strategic (v4–5+high), expansive narrative (v4–5+low/medium)

- [x] **3.4 — Rhythm patterns for Projects + Education sections**
  - Migration `020_rhythm_projects_education.sql` adds three new patterns: `project_showcase` (5-bullet, impact-first), `project_minimal` (3-bullet, tight listing), `education_rich` (4-bullet, fresh-grad/academic)
  - Fixes Scenario C (fresh grad / no experience) — projects now get rhythm enforcement

- [x] **3.5 — Cover letter brief injection**
  - `generateCoverLetter` in `geminiService.ts` now fires `buildBrief({ jd, profile, section: 'summary' })` in parallel with prompt construction (zero added latency on a miss)
  - Injects a `### VOICE BRIEF` block with voice name, tone, verbosity level, metric preference, and top-10 forbidden phrases
  - Graceful fallback: if worker is unreachable, generates without the brief (no regression)

- [x] **3.6 — Verb energy routing by seniority**
  - `brief.ts` now sorts `verbPool` by `energy_level` after voice bias sort, before slicing to 30
  - Senior/Lead → high-energy verbs first; Entry/Junior → low/medium energy first; Mid → shuffle (variety)
  - Uses `ENERGY_RANK` lookup table; gracefully handles missing energy_level values

---

## PHASE 4 — Distribution & Monetization

- [ ] **4.1 — SEO proxy landing pages**
  - Target Resume Worded's top keywords: `/ats-checker`, `/cv-score`, `/resume-checker/software-engineer`, `/resume-checker/kenya`, `/resume-checker/nigeria`
  - Each page = lightweight Score My CV tool (Phase 2.1) + "Fix My CV" CTA
  - **Effort:** 1 week

- [x] **4.2 — Server-side generation tracking foundation**
  - `cv_events` table exists (migration 015) — tracking skeleton is in place
  - *Next: wire actual event writes into `handleTieredLLM` and `handleParallelSections` before any paid gating*

- [x] **4.3 — Remove download gate reset button**
  - Removed `showReset` state, `handleReset` function, the "or" divider, and the soft-gate disclosure section from `DownloadGateModal.tsx`
  - Removed `resetDownloadCount` helper (was only used internally by the reset button)
  - Gate now has a single call-to-action: sign in with Google

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
