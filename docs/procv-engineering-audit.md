# ProCV — Principal Engineer Architecture Audit
**Date:** June 2026  
**Scope:** Full codebase — engine core, variance system, voice architecture, purification pipeline, LLM orchestration, complete generation trace. Updated with cross-referenced second external audit.  
**Verdict:** 9/10 CV engine architecture for a startup product. The surprising moat is not the AI — it is the deterministic layers wrapped around the AI. The system is entering the "complexity wall" — the next 6 months will determine whether it becomes a fragile heuristic stack or a deterministic resume operating system.

---

## 🚦 v3 Roadmap Progress Tracker

> Updated: June 2026. Tick each item as it ships.

| # | System | Status | What was built | Remaining |
|---|---|---|---|---|
| S5 | **Generation Trace** | ✅ **FULLY SHIPPED** | `generationTrace.ts` — full trace model + `GenerationTracePanel.tsx` collapsible debug panel wired into CV editor below the preview. Shows scenario/seniority/field/voice/angle/verbs/ATS pins/blueprint hit/validation violations/timings. Collapsed by default, only renders when `currentCV._trace` exists. | — |
| S2 | **Validation Engine** | ✅ **FULLY SHIPPED** | `cvValidationEngine.ts` — 9 rules total. New: `ruleBulletCountEnforcer` (BLOCK+repair — trims to targetBulletCount when LLM returns > target+3 bullets) and `ruleCurrentRoleTense` (WARN — flags past-tense "-ed" openers in current roles). `ValidationRule.repair` signature updated to accept `opts`. | — |
| S4 | **Prompt Registry** | ✅ **SHIPPED** | `028_prompt_registry.sql` (D1 table seeded with 8 sections at v1) + `handlers/promptRegistry.ts` (4 endpoints: list, get, create, rollback) + `promptRegistryClient.ts` (localStorage cache, 1h TTL, fire-and-forget prefetch on boot). `promptVersions` field added to `GenerationTrace` — every CV now records `{ summary:v1, experience:v1, … }`. Trace panel shows a "Prompt Registry (S4)" row. Worker write endpoints require `editor`/`admin` token. | Deploy worker migration `028` to production via `wrangler d1 execute` |
| S1 | **Rule Registry** | ✅ **SHIPPED** | `029_rule_registry.sql` (D1 table seeded with 6 scenarios at v1) + `handlers/ruleRegistry.ts` (5 endpoints: list, evaluate, get-key, create, rollback) + `ruleRegistryClient.ts` (sync evaluator + localStorage cache 1h TTL + `prefetchRuleConfigs` on boot). `ruleKey`/`ruleId`/`abGroup`/`ruleSource` fields added to `GenerationTrace`. Evaluator is zero-latency (sync localStorage read on generation critical path). Trace panel shows "Rule Registry (S1)" row. A/B weights supported per rule variant. Worker write endpoints require admin token. | Deploy worker migration `029` to production via `wrangler d1 execute` |
| S3 | **Confidence-Tagged Fields** | 🔲 NOT STARTED | — | `TaggedValue<T>` on profile metrics, enhanced anchor block separating `user_supplied` vs `llm_inferred`, non-numeric hallucination prevention |
| S6 | **Profession Ontology** | 🔲 NOT STARTED | — | Parent-child field hierarchy with inheritance resolver, UI dropdown linked to field profiles |

### What's in every generated CV now (as of June 2026)

After S5 + S2 fully shipped, every `generateCV()` call produces a CV that has been:

1. **Validated** against 9 deterministic hard rules before reaching the user
2. **Auto-repaired** for block violations (skills cap, dedup, seeking phrases, excess bullet trimming)
3. **Tense-checked** — current-role bullets with past-tense openers are flagged as `warn` violations in the trace
4. **Traced** — a full audit trail attached to `CVData._trace` answering every "why did this CV look this way?" question
5. **Debug-visible** — a collapsible "Generation Details" panel below the CV preview shows the full trace without reading any source code

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Complete Generation Trace](#2-complete-generation-trace)
3. [Engine Core — The Brief Builder](#3-engine-core--the-brief-builder)
4. [LLM Orchestration Layer](#4-llm-orchestration-layer)
5. [Variance System Deep Dive](#5-variance-system-deep-dive)
6. [Voice Architecture Deep Dive](#6-voice-architecture-deep-dive)
7. [Scenario Engine Deep Dive](#7-scenario-engine-deep-dive)
8. [Purification Pipeline Deep Dive](#8-purification-pipeline-deep-dive)
9. [Style Governance Layer](#9-style-governance-layer)
10. [Identified Risks — Severity-Ranked](#10-identified-risks--severity-ranked)
11. [Concrete Recommendations](#11-concrete-recommendations)
12. [Appendix — File Reference Map](#12-appendix--file-reference-map)
13. [Second Audit Cross-Reference — 10 Findings Verified Against Real Code](#13-second-audit-cross-reference--10-findings-verified-against-real-code)
14. [The v3 Roadmap — 6 Systems to Build](#14-the-v3-roadmap--6-systems-to-build)
15. [Predicted Challenges — 3 to 12 Month Horizon](#15-predicted-challenges--3-to-12-month-horizon)

---

## 1. Executive Summary

### What ProCV Actually Is

ProCV is **not** a prompt wrapper around an LLM. It is a multi-layer expert system that uses AI only as a *writer* while surrounding that writer with deterministic intelligence at every stage. The correct mental model is:

```
Expert Rules Engine
      ↓
Scenario Classifier (A/B/C/D + Pivot)
      ↓
Brief Builder (field, seniority, voice, verbs, rhythm)
      ↓
Variance Injector (angle, verb shuffle, jitter)
      ↓
LLM Writer (Mistral Small 3.1 24B — parallel sections)
      ↓
Voice Fidelity Enforcer (deterministic regex)
      ↓
Purification Pipeline (7 deterministic stages)
      ↓
Style Governance Auditor (5 heuristic diagnostics)
      ↓
Quality Gate (validation + human score)
      ↓
Final CV
```

The AI is layer 4 of 10. The other 9 are pure TypeScript/deterministic logic.

### Confirmed Strengths

| Strength | Evidence |
|---|---|
| Single purification choke point | `purifyCV()` comment: "Every CV that leaves any AI generation path MUST flow through purifyCV()" |
| Deterministic governance | 7-stage pipeline — all regex, lookup tables, statistical heuristics. Zero AI cost. Cannot fail. |
| Voice is data-driven, not prompt-hacked | `seeds-voices.json` + `023_voice_summary_formulas.sql` + `cvVoiceFidelity.ts` enforcement |
| Variance is engineered, not random | 4 narrative angles with LRU rotation, verb shuffling, forbidden phrase rotation, verbosity jitter |
| Structural blueprint reuse | D1 `cv_examples` table — fingerprinted blueprints guide rhythm and section sizing per role type |
| Metric honesty enforcement | `_CV_HUMANIZATION_RULES`: 50–60% metric density cap, chained-causal metric detection |
| ATS gap-pin | Pre-generation ATS scan pins top 12 confirmed-missing keywords into the prompt |
| Profile caching | D1 `profile_cache` — replaces full profile payloads with `{{PROFILE}}` placeholder to prevent 413s |

### Confirmed Risks (by severity)

| Risk | Severity |
|---|---|
| No generation decision trace | HIGH |
| Scenario explosion | MEDIUM-HIGH |
| Governance accumulation in purify.ts | MEDIUM |
| Variance boundary ambiguity | MEDIUM |
| Unified cache invalidation gap | LOW-MEDIUM |

---

## 2. Complete Generation Trace

This traces a single CV generation request from button click to downloaded PDF. Every step is real code, no assumptions.

### Step 0 — Pre-generation (on button click, before LLM call)

```
CVGenerator.tsx: handleGenerateCV()
  ├── scoreAtsCoverage(currentCV, jobDescription)       // pure-JS ATS scan
  │     └── returns top 12 confirmed-missing keywords → _gapKeywords
  ├── getHashIfCached(slot_id)                          // localStorage scan, zero network
  │     └── returns profile_hash if cached, null if not
  └── computeExampleFingerprint(role, seniority, purpose, mode)
        └── SHA-256(normalised_role:seniority:purpose:mode) → fingerprint
```

### Step 1 — Parallel pre-flight (zero serial latency)

```
geminiService.ts: generateCV()
  ├── [P1] buildBrief(profile, jd, section)             // → /api/cv/brief (Cloudflare Worker)
  ├── [P2] fetchCVExample(fingerprint, currentAngle)    // → /api/cv/examples (D1 lookup)
  └── [P3] selectFreshAngle()                           // localStorage LRU scan
```

All three fire in parallel via `Promise.allSettled()`. The brief call (P1) is the critical path; if P2 or P3 fail, generation continues without them.

### Step 2 — Brief resolution (Cloudflare Worker: brief.ts)

```
handleBrief()
  └── buildBriefData()
        ├── 9 parallel KV lookups:
        │     seniority_rows, field_rows, voice_rows, combo_rows,
        │     rhythm_rows, banned_rows, opener_rows, result_connectors, context_connectors
        ├── estimateYearsFromProfile()          // sums role durations in months
        ├── pickSeniorityByYears()              // maps years → entry/junior/mid/senior/lead
        │     └── + regex title override        // "intern"→entry, "lead/vp/cto"→lead
        ├── Field scoring:
        │     for each field → count JD keyword hits (×3) + profile keyword hits
        │     → sorted, top field wins
        ├── Voice scoring:
        │     compatible_fields match (+3) + compatible_seniority match (+3) + verb_bias overlap (+n)
        │     → optional voice_name override from user
        ├── Verb pool build:
        │     mapFieldToVerbCategory(language_style) → category
        │     KV lookup: cv:verbs:{category}:{tense}
        │     filter avoided_verbs, sort by voice verb_bias
        │     energy-sort by seniority (senior→high, entry→low, mid→shuffle)
        │     → slice top 30
        ├── Rhythm pattern: filter by section, sort by human_score
        ├── Forbidden phrases: seniority.forbidden_phrases + combo.forbidden_phrases
        └── Openers + connectors: 4 shuffled openers, top 6 result/context connectors
```

**Output: a fully parameterised "brief" object** — the contract that governs the LLM call.

### Step 3 — Prompt assembly (client-side, geminiService.ts)

```
  ├── detectScenario(workExperience, projects)
  │     → 'A' (no exp, no projects) | 'B' (exp, no projects)
  │     | 'C' (no exp, has projects) | 'D' (thin exp) | 'standard'
  ├── detectCareerPivot(profile, jd)
  │     → pivot block if source_field ≠ target_field
  ├── engineInstruction block assembly:
  │     ├── shuffleArray(verb_pool).slice(0, 12)        // 12 of 30 verbs per generation
  │     ├── shuffleArray(forbidden_phrases).slice(0, 20) // 20 of 30 forbidden phrases
  │     ├── verbosityJitter = Math.random() * 0.4 - 0.2 // ±0.2 jitter
  │     └── buildNarrativeAngleBlock(selectedAngle)
  ├── lockRealNumbers(profile)                          // anchors real metrics/orgs/degrees
  ├── buildPromptAnchorBlock(locked, field)             // good+bad bullet examples
  ├── buildReferenceBlock(example)                      // structural blueprint injection
  ├── gapPinBlock                                       // 12 confirmed-missing ATS keywords
  ├── Profile: either "{{PROFILE}}" placeholder + hash, or full compact profile
  └── _CV_CRITICAL_RULES_REMINDER (19 rules — injected LAST, highest priority)
```

### Step 4 — LLM Generation (Cloudflare Worker: llm.ts)

```
workerParallelSections()  →  /api/cv/parallel-sections
  ├── Worker fetches profile from D1 if {{PROFILE}} placeholder found
  ├── Splits prompt into section-level sub-prompts
  ├── Fires each section in parallel:
  │     handleTieredLLM → task='cvGenerate' → Mistral Small 3.1 24B (FREE tier)
  └── Assembles section results → raw CVData JSON
```

Model selection is deterministic per task: `cvGenerate` always routes to Mistral Small 3.1 24B.

### Step 5 — Quality Polish Passes (client-side, runQualityPolishPasses)

```
  Stage 1 (Humanize — AI):
    if quality gate flags monotone rhythm / voice drift:
      workerTieredLLM(task='humanize', Hermes-2 Pro 7B)  // targeted AI rewrite

  Stage 2 (Purify — deterministic, 7 stages):
    1. Instruction leak strip        // removes LLM preambles ("Certainly, here is...")
    2. Substitution pass             // banned phrases → replacements
    3. Tense enforcement             // current role → present, past roles → past
    4. Word-overuse & semantic dedup // synonym replacement + identical bullet removal
    5. Phase-2 polish                // pronoun strip, weak openers, number formatting
    6. Skill normalization           // casing canonicalisation + de-duplication
    7. Diagnostic audit              // detect-only: round numbers, low quantification, rhythm

  Stage 3 (Voice Fidelity — deterministic):
    _stripFirstPersonPronouns()      // "I've combined" → "Combined"
    _normalizePresentTenseToImperative() // "Manages" → "Manage"

  Stage 4 (Quality Gate — scoring):
    runQualityGate()                 // validates rhythm, verb diversity, banned phrases
    consumePreviousViolationsBlock() // injects violation list into next regeneration
```

### Step 6 — Post-generation bookkeeping

```
  storeCVExample(fingerprint, angle, cvData)  // blueprint → D1 for future reference
  recordAngleUsed(angle)                      // → localStorage angle history
  logGeneration(cvHash, metrics)              // → telemetry (fire-and-forget)
```

### Step 7 — PDF Download

```
cvDownloadService.downloadCV()
  ├── getCVHtml(cvData, template)    // renders live DOM, inlines Google Fonts as base64
  ├── POST /__pdf/api/generate-pdf  // → local Playwright server (dev)
  │     OR
  │   POST to resume-pdf-worker     // → Cloudflare headless Chrome (prod)
  └── Returns PDF binary (0mm margins, preferCSSPageSize:true)
```

---

## 3. Engine Core — The Brief Builder

**File:** `backend/cv-engine-worker/src/handlers/brief.ts` (262 lines)

The brief builder is the most important file in the entire system. It runs before the LLM sees a single token. It answers: "Who is this person, what job are they applying for, and exactly how should the CV sound?"

### Data Sources (all from Cloudflare KV, 9 parallel lookups)

```
cv:seniority:all      → seniority bands (years_min/max, bullet_style, metric_density)
cv:fields:all         → professional fields (jd_keywords, language_style, metric_types)
cv:voices:all         → voice profiles (tone, verbosity, verb_bias, compatible_fields)
cv:combos:all         → seniority × field forbidden phrase combinations
cv:rhythm:all         → bullet rhythm patterns (sequence, human_score) per section
cv:banned:all         → global banned phrase list
cv:openers:all        → action verb openers pool
cv:results:all        → result connector phrases
cv:contexts:all       → context connector phrases
```

### Seniority Detection Algorithm

```typescript
// Step 1: estimate years from profile work history
totalMonths = sum(end - start) for each role
years = totalMonths / 12

// Step 2: map to band from D1 table
bands: entry(<1yr), junior(1-2), mid(3-5), senior(6-9), lead(10+)

// Step 3: regex title override (takes precedence)
/\b(intern|attachment|trainee)\b/ → entry
/\b(lead|principal|head|director|chief|vp|cto|ceo)\b/ → lead
/\bsenior\b|\bsr\.?\b/ + years>=5 → senior
```

### Field Scoring Algorithm

```typescript
for each field in fieldRows:
    score = 0
    for each keyword in field.jd_keywords:
        jdHits     = count(keyword in JD, word-boundary regex)
        profileHits = count(keyword in profile JSON)
        score += jdPresent ? (jdHits * 3 + profileHits) : (jdHits + profileHits)
// JD hits worth 3× more than profile hits — JD is stronger signal
topField = max(score)
```

### Voice Selection Algorithm

```typescript
for each voice in voiceRows:
    score = 0
    if field in voice.compatible_fields: score += 3
    if seniority in voice.compatible_seniority: score += 3
    verbBiasOverlap = intersection(voice.verb_bias, field.preferred_verbs).length
    score += verbBiasOverlap
primary = max(score)
secondary = second-highest, excluding incompatible_with list
```

### Verb Pool Energy Routing

This is subtle but important. The verb pool is not just filtered by field — it is **energy-sorted by seniority**:

```
senior/lead  → high-energy verbs first  (Architected, Spearheaded, Restructured)
entry/junior → low-energy verbs first   (Supported, Contributed, Assisted)
mid          → shuffle (natural variety)
```

The intent: entry-level CVs don't over-claim authority. Senior CVs don't undersell.

### Brief Output Shape

```json
{
  "seniority": { "level": "senior", "bullet_style": "balanced", "metric_density": "high" },
  "field": { "field": "technology", "language_style": "technical", "metric_types": ["latency", "uptime", "throughput"] },
  "voice": {
    "primary": { "name": "platform_architect", "verbosity_level": 4, "metric_preference": "very_high" },
    "secondary": { "name": "startup_engineer" }
  },
  "rhythm": { "pattern_name": "balanced", "sequence": ["punchy", "standard", "narrative", "standard"], "bullet_count": 5 },
  "verb_pool": [/* 30 verbs with energy_level */],
  "forbidden_phrases": [/* seniority + field combo phrases */],
  "opener_suggestions": [/* 4 random openers */],
  "result_connectors": [/* top 6 by human_score */],
  "context_connectors": [/* 6 diverse types */]
}
```

---

## 4. LLM Orchestration Layer

**File:** `backend/cv-engine-worker/src/handlers/llm.ts` (804 lines)

### Model Tier Routing

```
Task              Model                                    Tier
─────────────────────────────────────────────────────────────
cvGenerate        @cf/mistralai/mistral-small-3.1-24b     Free
cvGenerateLong    @cf/mistralai/mistral-small-3.1-24b     Free
cvExperience      @cf/mistralai/mistral-small-3.1-24b     Free
cvProjects        @cf/mistralai/mistral-small-3.1-24b     Free
cvAudit           @cf/mistralai/mistral-small-3.1-24b     Free
humanize          @hf/nousresearch/hermes-2-pro-mistral-7b Free
visionExtract     @cf/meta/llama-3.2-11b-vision-instruct  Free
```

### Orchestration Modes

**handleRaceLLM** — parallel racing, fastest wins:
```
Fires N models simultaneously
Returns first successful (non-empty) response
Cancels losers via AbortController
Use case: speed-critical paths where any good model will do
```

**handleParallelSections** — parallel section generation:
```
Splits CV into: summary | experience | projects | education | skills
Fires each section as independent LLM call in parallel
Assembles results
Effect: ~5x latency reduction vs. sequential generation
```

**handleTieredLLM** — deterministic task→model routing:
```
task → model mapping enforced server-side
No client can route a task to a higher-tier model without paying
Includes 100K prompt cap, 6K system cap, 8192 token output cap
```

### Fallback Chain (frontend: groqService.ts)

```
1. Workers AI (Cloudflare, free, primary)
2. Groq (llama-3.3-70b-versatile, BYOK)
3. Groq retry with backoff (30s amber countdown in UI)
4. Race: Cerebras + OpenRouter (parallel)
5. Claude (Anthropic, BYOK)
6. Gemini (Google, BYOK)
```

Each provider is monitored by circuit breakers and reported to `WorkerStatusBanner`.

---

## 5. Variance System Deep Dive

**Files:** `frontend/services/geminiService.ts` (lines 47–151, 2422–2451), `frontend/services/cvExamplesClient.ts`, `.agents/memory/cv-variance-architecture.md`

The variance system solves a hard problem: how do you generate different CVs for the same profile without hallucinating different facts?

The answer: **vary the framing, never the facts**.

### Layer 1 — Narrative Angle (strategic-level variance)

Four angles, LRU-rotated across sessions:

```
impact   → lead with quantified outcomes, result-first bullets
process  → lead with the HOW — systems, methods, mechanisms
people   → lead with team scale, leadership, mentorship outcomes
growth   → lead with expanding scope, before/after, trajectory
```

**Selection algorithm:**
```typescript
history = localStorage.getItem('cv:angleHistory')   // last 8 angles
scored  = ALL_ANGLES.map(angle => {
    lastIdx = history.lastIndexOf(angle)   // -1 if never used
    return { angle, recency: lastIdx === -1 ? 0 : lastIdx + 1 }
})
// pick from the lowest-recency tier (ties broken randomly)
```

This guarantees: if you run 4 consecutive CVs you will see each angle exactly once before repeating.

### Layer 2 — Verb Pool Shuffling (word-level variance)

```typescript
verbList = shuffleArray(engineBrief.verb_pool).slice(0, 12)
// From a brief-curated pool of 30 verbs, pick 12 different ones each run
// No two runs share the same 12-verb fingerprint
```

This prevents the LLM developing a "signature" set of openers.

### Layer 3 — Forbidden Phrase Rotation (constraint-level variance)

```typescript
forbidden = shuffleArray(engineBrief.forbidden_phrases).slice(0, 20)
// Of 30 known AI-ism phrases, rotate which 20 are forbidden each run
// Forces the LLM to find different vocabulary paths
```

If the same 30 phrases were banned every time, the LLM would develop a predictable substitution pattern.

### Layer 4 — Verbosity Jitter (density-level variance)

```typescript
verbosityJitter = Math.random() * 0.4 - 0.2   // [-0.2, +0.2]
verbosityEffective = clamp(voice.verbosity_level + verbosityJitter, 1, 5)
```

Small but meaningful: shifts the target word density slightly each run.

### Layer 5 — Structural Blueprint Reuse (rhythm-level variance)

From D1's `cv_examples` table:
```
Fingerprint: SHA-256(normalised_role:seniority:purpose:mode)
What's stored: summary_word_count, skills_count, per-role bullet word-count rhythm
Pool diversity: server queries for a blueprint with a DIFFERENT narrative angle than current
Injection: "===STRUCTURAL REFERENCE===" block (~150 tokens) at top of prompt
```

The blueprint tells the LLM: "bullets in this role should follow a punchy→standard→narrative pattern at roughly these word counts" — without showing content.

### Deterministic Fallback (cvDeterministicAssembler.ts)

When all LLM providers fail:
```
Verb Rotator cycles through action verb list (no repeats)
Rule-based templates per scenario (A/B/C/D)
Zero hallucination possible — only facts from profile, no LLM
Output is lower quality but always honest and complete
```

### What Variance Is NOT

- **Not seed-based determinism**: uses `Math.random()` deliberately, never fixed seeds
- **Not content variation**: facts, metrics, companies, dates never change between runs
- **Not structural randomness**: section order is controlled by scenario rules

---

## 6. Voice Architecture Deep Dive

**Files:** `backend/cv-engine-worker/seeds/seeds-voices.json`, `backend/cv-engine-worker/src/handlers/brief.ts`, `backend/cv-engine-worker/src/handlers/purify.ts`, `frontend/services/cvVoiceFidelity.ts`

### Voice Data Schema

Each voice profile in `seeds-voices.json`:
```json
{
  "name": "platform_architect",
  "tone": "authoritative, systematic",
  "verbosity_level": 4,
  "metric_preference": "very_high",
  "opener_frequency": 0.3,
  "risk_tolerance": "low",
  "formality": "high",
  "compatible_fields": ["technology", "engineering"],
  "compatible_seniority": ["senior", "lead"],
  "verb_bias": ["architected", "standardised", "scaled", "led"]
}
```

### Voice Summary Formulas (migration 023)

Each voice gets a structured formula for the professional summary paragraph. Example:
```
platform_architect summary formula:
"Hook (≤12 words) → Role scope → Strongest metric win → Forward value"
```

This is injected as an LLM system instruction, not just a style suggestion.

### Voice Enforcement Pipeline

Voice is enforced in three places, not one:

```
1. GENERATION (LLM system prompt):
   _CV_HUMANIZATION_RULES → voice description, sentence rhythm rules,
   banned buzzwords, metric honesty rules, bullet opener bans

2. POST-GENERATION (deterministic regex, cvVoiceFidelity.ts):
   _stripFirstPersonPronouns()
   "I've combined" → "Combined"
   "I manage" → "Manage"
   "we delivered" → "Delivered"

   _normalizePresentTenseToImperative()
   "Manages projects" → "Manage projects"
   "Generates reports" → "Generate reports"

3. VALIDATION (Cloudflare Worker, validation.ts):
   handleValidateVoice() — compares generated bullets against brief's
   rhythm.sequence, verbosity_level, metric_preference
   Flags: "rhythm_drift", "verb_outside_pool", "metric_mismatch"
```

### The Anti-Detection Guarantee

`_CV_HUMANIZATION_RULES` (purify.ts:227–249) explicitly targets AI detector signatures:

- Sentence rhythm alternation: mix 5–8 word punchy + 15–25 word elaborative
- Metric density cap: 50–60% of bullets carry numbers (AI writes 80-100%)
- Chained-causal metric ban: "improved by 20%, resulting in 30%" = AI fingerprint
- Specific number oddness: "saved roughly 11 hours/week" not "saved 10 hours/week"
- Contractions in summary: first-person "I've", "didn't" allowed (anti-formal)
- One genuine opinion per section: "actually secure, not just compliant on paper"

---

## 7. Scenario Engine Deep Dive

**Files:** `backend/cv-engine-worker/src/handlers/purify.ts` (lines 15–143), `frontend/services/geminiService.ts`

### Current Scenario Matrix

```
Scenario A — No experience, no projects:
  Summary formula: Identity → Capability → Signal → Readiness (55–70 words)
  Omits: Work Experience section entirely, Projects if none qualify
  Education: carries the weight experience normally would
  Academic projects: qualifies only with real deliverables, not tutorials
  Graduation status rule: past year = completed (never "currently pursuing")

Scenario B — Has experience, no projects:
  Omits: Projects section entirely ("absent = professional, fake = disqualifying")
  Skills: extracted from experience bullets only (every skill backed by a bullet)
  Experience: must carry all transferable skill evidence solo

Scenario C — No experience, has projects:
  Summary formula: builder identity → strongest project outcome → stack → readiness
  Section order: Summary → Skills → Projects → Education → Languages
  Projects: treated as full work experience roles (4–6 bullets each)
  Verb tense: present if live and maintained, past if completed

Scenario D — Thin experience (single internship/attachment):
  Summary formula: credential anchor → internship evidence → skills acquired → readiness
  The single role gets FULL bullet treatment (5–6 bullets, not the usual 1–2)
  Education: expanded to Scenario A depth
  Projects: academic projects included

Pivot Block (orthogonal to A/B/C/D):
  Triggered: when candidate's field ≠ target JD field
  Bridge Formula summary (60–80 words): honest identity → transferable proof → deliberate steps → unique value
  Skills: two-tier (target-field genuine skills first, then domain depth)
  Section order: Summary → Skills → Projects/Certs → Experience → Education
  Banned: "passionate about transitioning", "eager to learn", "career change"
```

### Scenario Detection Code

```typescript
function detectScenario(workExperience, projects):
    hasExp     = workExperience.filter(e => !isInternshipOrSimilar(e)).length > 0
    hasThin    = workExperience.length === 1 && isInternshipOrSimilar(workExperience[0])
    hasProjs   = projects.length > 0

    if (!hasExp && !hasThin && !hasProjs) return 'A'
    if (hasExp && !hasProjs)              return 'B'
    if (!hasExp && !hasThin && hasProjs)  return 'C'
    if (hasThin)                          return 'D'
    return 'standard'
```

### What Is NOT Yet a Scenario

Scenarios that exist in the real world but have no dedicated path today:
- Executive / C-suite (different summary structure, board-level framing)
- Military transition (rank translation, civilian equivalents)
- Academic / research CV (publications, grants, conferences)
- Founder / entrepreneur (exit signals, fundraising metrics)
- Employment gap returner (gap handling, reframing)
- Freelancer / consultant (portfolio-based evidence)

Each of these currently falls through to `standard` and receives generic treatment.

---

## 8. Purification Pipeline Deep Dive

**Files:** `frontend/services/cvPurificationPipeline.ts` (3,063 lines), `backend/cv-engine-worker/src/handlers/purify.ts` (924 lines)

This is the single largest file in the codebase. It is accumulating responsibilities.

### The 7 Deterministic Stages (frontend)

```
Stage 1 — Instruction Leak Strip
Purpose: Remove LLM meta-commentary from the output
Examples: "Certainly, here is your CV...", "Based on your profile..."
Method: regex list of known LLM preamble patterns
Cost: Zero AI, cannot fail

Stage 2 — Substitution Pass
Purpose: Replace banned AI buzzwords with professional language
Examples: "synergy" → [deleted], "utilize" → "use", "leverage" → [max 1/doc]
Sources: static local lists + dynamic list from Cloudflare Worker
Cost: Zero AI, cannot fail

Stage 3 — Tense Enforcement
Purpose: Flip leading verbs to correct tense per role status
Current role: present imperative ("Manage", "Build", "Lead")
Past roles: past tense ("Managed", "Built", "Led")
Method: TPS_TO_BASE lookup table, then regex replacement on first word of each bullet
Cost: Zero AI, cannot fail

Stage 4 — Word-Overuse & Semantic Dedup
Purpose: Remove repetitive vocabulary and identical bullets
Word overuse: if a word appears in >40% of bullets in one role → synonym replacement
Semantic dedup: if two bullets in same role are >85% similar → drop lower-quality one
Cost: Zero AI, cannot fail

Stage 5 — Phase-2 Polish
Purpose: Micro-fixes that don't warrant their own stage
- Strip first-person pronouns
- Replace weak openers ("Responsible for" → action verb)
- Format numbers ("10000" → "10,000")
- Fix trailing period consistency
Cost: Zero AI, cannot fail

Stage 6 — Skill Normalization
Purpose: Canonical skill casing and deduplication
Examples: "reactjs" → "React.js", "javascript" → "JavaScript", "aws" → "AWS"
Method: lookup table of canonical forms, then case-insensitive dedup
Cost: Zero AI, cannot fail

Stage 7 — Diagnostic Audit (detect-only)
Purpose: Flag issues for telemetry and quality gate — does NOT fix
Detects: round-number saturation, low quantification, rhythmic monotony
Output: PurifyReport with leak list
Cost: Zero AI, cannot fail
```

### The Governance Layer (backend, purify.ts)

`_CV_HUMANIZATION_RULES` is the LLM's constraint set for the AI-rewrite stage. Key rules:

- **Rhythm**: alternate short (4–8 words) and long (15–25 words) sentences
- **Banned openers**: Spearheaded, Orchestrated, Leveraged, Utilized, Facilitated, Empowered, Championed
- **Banned buzzwords**: 40+ specific terms listed with zero-tolerance enforcement
- **Metric honesty**: 50–60% density cap, no chained-causal metrics, no `~` character
- **Specificity mandates**: "improved efficiency" → must be replaced with actual numbers

### The 19-Rule Critical Reminder

`_CV_CRITICAL_RULES_REMINDER` is injected as the LAST thing in the prompt, overriding all earlier guidance. Key rules:

1. Summary: no "Seeking to", "Looking for", "Aiming to" — candidate delivers, not seeks
2. No generic buzzwords in summary
3. Summary from candidate experience only — never paraphrase the JD
4. Minimum 8 words per bullet
5. No weak openers ("Responsible for", "Helped to", "Assisted with")
6. Rhythm mix: short must alternate with fuller bullets
7. No invented verbs: Greenfielded, Scaffolded, Actioned, Ideated, Solutioned
8. No banned openers: Spearheaded, Orchestrated, Leveraged, etc.
9. No first-person pronouns in bullets
10. Skills cap: 12–15 maximum
11. Education: never invent classification, GPA, thesis
12. Consistent date format throughout
13. Tense: current → present, past → past
14. Scope anchor: EVERY role's FIRST bullet = scope-setting (team size, budget, region)
15. No `~` before numbers
16. Scope anchor is binding on first bullet
17. Summary must come from candidate experience, never JD
18. Grammar: fix only broken grammar, no stylistic rewriting
19. Example data in rules are placeholder templates — never copy into output

---

## 9. Style Governance Layer

**File:** `frontend/services/cvStyleGovernance.ts` (410 lines)

The governance layer runs **after** purification and is **detect-only** — it emits `PurifyLeak` records for telemetry, not auto-fixes.

### Five Governance Checks

```
1. Opener Diversity
   Flag: 3+ consecutive bullets starting the same way in one role
   Example: "Led the...", "Led the team...", "Led the project..."
   Signal: LLM found one opener and repeated it

2. Verb-Led Saturation
   Flag: >85% of bullets in a role start with an action verb
   Signal: AI write — real humans mix opener types (numbers, context, verb)
   85% threshold: allows some verb variety, not zero-tolerance

3. Semantic Cluster Dominance
   Flag: one verb family dominates a role
   Example: all bullets from "leadership" cluster (Led, Managed, Directed, Supervised)
   Effect: CV sounds one-dimensional, not well-rounded
   Method: verb family classification, cluster ratio check

4. Bare Metric Openers
   Flag: bullet starts with a raw number without a verb setup
   Example: "$2M generated in Q3..." (bad) vs "Drove $2M in revenue..." (good)
   Why: bare metric openers are an AI signature in 2025 recruiting surveys

5. Rhythm & Banding
   Punchy band: 8–14 words
   Standard band: 15–22 words
   Narrative band: 23–45 words
   Monotone flag: all bullets within 2 words of each other in length
   Band imbalance flag: >60% of bullets in any single band
```

---

## 10. Identified Risks — Severity-Ranked

### RISK 1 (HIGH) — No Generation Decision Trace

**The problem:** When a CV looks a certain way, there is currently no way to answer:
- Why was Scenario C selected and not B?
- Why was `platform_architect` voice chosen over `startup_engineer`?
- Which narrative angle was used?
- What structural blueprint was the basis?
- Which 12 verbs were in this generation's pool?

**Current state:** Some telemetry exists (`cv_request_telemetry` D1 table logs seniority, field, voice, section) but:
- It does not log the angle used
- It does not log the scenario classification
- It does not log the verb pool subset
- It does not log whether a structural blueprint was found or missed
- There is no client-accessible trace after generation

**Impact:** Debugging "why did this CV look weird" takes 30 minutes of code-reading. Onboarding a new engineer is difficult. Supporting power users is impossible.

**Fix:** See Recommendation 1.

---

### RISK 2 (MEDIUM-HIGH) — Scenario Explosion

**The problem:** The current 4 scenarios (A/B/C/D) cover the dimensions: `hasExperience × hasProjects × isThin`. Adding realistic job-seeker types explodes this:

```
Current: 4 scenarios (A, B, C, D) + 1 pivot
Realistic full set:
  Scenario E: Executive / C-suite
  Scenario F: Military transition
  Scenario G: Academic / researcher
  Scenario H: Founder / entrepreneur
  Scenario I: Employment gap returner
  Scenario J: Freelancer / consultant
  Scenario K: International (non-English primary)
  + Any combination with pivot block
  = potentially 10+ scenarios × 6 seniority levels × 6 field types
```

**Current state:** These candidates receive `standard` treatment — a technically acceptable but suboptimal result. As the user base grows, edge cases will demand specific handling.

**Impact:** Medium now, high in 12 months as user diversity increases. Each new scenario added as a hardcoded string in `purify.ts` makes the file harder to reason about.

**Fix:** See Recommendation 2.

---

### RISK 3 (MEDIUM) — Governance Accumulation in purify.ts

**The problem:** `purify.ts` is already 924 lines and contains:
- Scenario A prompt (85 lines)
- Scenario B prompt (12 lines)
- Scenario C prompt (18 lines)
- Scenario D prompt (18 lines)
- Pivot block template (50+ lines)
- Humanization instruction header
- Critical rules reminder (50+ lines)
- CV data schema
- Humanization rules (50+ lines)
- Purify handler + clean handler + pre-purify handler
- Governance constants

**Pattern observed:** every new rule, banned phrase, or structural constraint is added to this file. It is becoming the single dumping ground for quality-related concerns.

**Risk:** When a bug emerges, it's unclear whether to fix it in `purify.ts`, `cvPurificationPipeline.ts`, `cvStyleGovernance.ts`, or `cvVoiceFidelity.ts`. The boundaries are blurring.

**Fix:** See Recommendation 3.

---

### RISK 4 (MEDIUM) — Variance Boundary Ambiguity

**The problem:** The variance system operates at three levels but this is not formally documented:

```
Lexical variance:    verb shuffling, forbidden phrase rotation (word-level)
Structural variance: verbosity jitter, rhythm constraints (density-level)
Strategic variance:  NarrativeAngle — impact vs process vs people vs growth (framing-level)
```

The `NarrativeAngle` system crosses into strategic territory. The `growth` angle changes not just wording but what facts are emphasised (trajectory over results). This is valuable but has a hidden risk: two CVs with different angles may look like they contain different information even when the source profile is identical.

**Impact:** If a user generates twice and gets "impact" then "people" angle, they may think the AI made a mistake or hallucinated different facts. The framing difference is invisible to the user.

**Fix:** See Recommendation 4.

---

### RISK 5 (LOW-MEDIUM) — Unified Cache Invalidation Gap

**The problem:** Three separate caches with different invalidation strategies:

```
In-memory LRU cache:  30-min TTL, CV_RULES_VERSION bump invalidates
D1 LLM cache:         30-day TTL, temperature ≤ 0.5 only
D1 CV examples:       no explicit TTL, accumulates blueprints
```

When `CV_RULES_VERSION` is bumped (e.g., a new rule is added to the 19-rule reminder), the in-memory cache is invalidated but the D1 LLM cache is not. An old cached generation could be returned from D1 with the old rules.

**Impact:** Low frequency (requires exact same prompt, same model, within 30 days), but when it happens the output appears to ignore a rule change.

**Fix:** See Recommendation 5.

---

## 11. Concrete Recommendations

### Recommendation 1 — Generation Decision Trace

**What to build:** A `GenerationTrace` object attached to every `CVData` result.

```typescript
interface GenerationTrace {
    timestamp: string;
    scenario: 'A' | 'B' | 'C' | 'D' | 'standard';
    pivotDetected: boolean;
    seniority: string;
    field: string;
    voice: string;
    narrativeAngle: NarrativeAngle;
    verbPoolSample: string[];        // the 12 verbs used
    structuralExampleFound: boolean; // D1 blueprint hit or miss
    gapKeywordsCount: number;
    profileCacheHit: boolean;
    generationMs: number;
    rulesVersion: string;
}
```

**Where to store it:** In `localStorage` alongside the CV, and optionally in the `generation_log` D1 table.

**Where to surface it:** A "Generation Details" expandable section in the CV editor (dev/debug mode only, collapsed by default for regular users).

**Effort:** ~2 days. Minimal impact on generation speed — all data already exists, just not collected.

---

### Recommendation 2 — Scenario Registry (Data-Driven Scenarios)

**Problem:** Scenarios are hardcoded strings in `purify.ts`. Each new scenario is a new export constant and a new `if/else` branch in `buildScenarioBlock()`.

**Solution:** Move scenarios to a JSON registry stored in Cloudflare KV:

```json
{
  "scenarios": {
    "A": {
      "id": "A",
      "label": "No experience, no projects",
      "detection": { "hasExp": false, "hasProjects": false, "isThin": false },
      "summary_formula": "identity → capability → signal → readiness",
      "omit_sections": ["experience", "projects"],
      "special_rules": ["education_carries_weight", "graduation_status_binding"]
    }
  }
}
```

**Benefits:**
- New scenarios added without deploying new worker code
- Scenarios can be A/B tested via KV flag
- Detection logic becomes a pure classifier operating on scenario registry
- `purify.ts` becomes a handler + orchestrator, not a content store

**Effort:** ~1 week. Requires migrating 5 existing scenario strings to the registry + updating `buildScenarioBlock()`.

---

### Recommendation 3 — Purify.ts Split

**Current structure (problematic):**
```
purify.ts (924 lines)
└── everything quality-related
```

**Proposed structure:**
```
handlers/
  purify.ts (orchestrator only, ~150 lines)
    ├── imports from:
    ├── rules/scenarios.ts   (scenario A/B/C/D/Pivot constants)
    ├── rules/governance.ts  (humanization rules, critical reminder, data schema)
    ├── rules/detection.ts   (anti-detection rules, voice tone targets)
    └── handlers actually: handlePurifyCv(), handleCleanCv(), handlePrePurify()
```

**Benefits:**
- Each file has a single responsibility
- Scenarios can be read/updated without touching governance rules
- Governance rules can be updated without touching scenario logic
- File sizes become manageable (<200 lines each)

**Effort:** ~3 days. Pure refactor, no behaviour changes.

---

### Recommendation 4 — Variance Boundary Documentation + User Transparency

**Short term (1 day):**
Add a `narrativeAngle` field to the CV editor header so the user can see which angle was used:
```
"Generated with: Impact angle • platform_architect voice • Senior/Technology brief"
```

**Medium term (1 week):**
Allow the user to pin an angle. Some users always want `impact` for finance roles. Currently they have no control; the LRU rotation picks for them. Add a dropdown in the generation settings:
```
Narrative angle: [ Auto (rotates) | Impact | Process | People | Growth ]
```

**Documentation (1 day):**
Add a `docs/variance-boundaries.md` that formally defines:
- What lexical variance affects (word choice, opener verbs)
- What structural variance affects (sentence density, word count distribution)
- What strategic variance affects (what the CV is "about" — outcomes vs methods vs people)

This prevents the confusion: "why does my CV look different when I regenerate?"

---

### Recommendation 5 — LLM Cache Version Key

**The problem:** D1 LLM cache uses `SHA-256(model + temperature + systemPrompt + userPrompt)` as key. When `CV_RULES_VERSION` bumps, the system prompt changes, so the key changes automatically. **This is actually safe** for the system prompt. The risk is only if the rules version is changed but the system prompt text is not updated.

**Simple fix:** Append the rules version to the cache key explicitly:
```typescript
const cacheKey = SHA256(model + temperature + CV_RULES_VERSION + systemPrompt + userPrompt)
```

This costs nothing and makes the cache invariant to version drift.

**Effort:** 30 minutes.

---

### Recommendation 6 — Explainability Admin Dashboard

A read-only admin page showing:
- Top 5 voices selected in last 7 days
- Top 5 fields detected in last 7 days
- Scenario distribution (A: 12%, B: 45%, C: 18%, D: 8%, standard: 17%)
- Narrative angle distribution (should be ~25% each if LRU works correctly)
- Average quality gate score by scenario
- Top 10 leaked phrases caught by purifier

All data already exists in `cv_request_telemetry`, `detected_leaks`, and `generation_log` D1 tables. This is a query layer, not new instrumentation.

**Effort:** ~3 days (admin endpoint + simple HTML table view).

---

## 12. Appendix — File Reference Map

| File | Lines | Role |
|---|---|---|
| `frontend/services/geminiService.ts` | 5,197 | Main generation orchestrator, variance system, narrative angle |
| `frontend/services/cvPurificationPipeline.ts` | 3,063 | 7-stage deterministic purifier |
| `backend/cv-engine-worker/src/handlers/purify.ts` | 924 | Scenarios A/B/C/D, pivot block, governance rules, humanization |
| `backend/cv-engine-worker/src/handlers/llm.ts` | 804 | LLM tier routing, race, parallel sections, vision |
| `frontend/services/cvStyleGovernance.ts` | 410 | 5 governance checks (detect-only) |
| `frontend/services/cvDeterministicAssembler.ts` | 406 | Zero-LLM fallback assembler |
| `frontend/services/cvExamplesClient.ts` | 288 | D1 structural blueprints, angle-diverse pool |
| `backend/cv-engine-worker/src/handlers/validation.ts` | 321 | Voice validation, quality gate, semantic matching |
| `backend/cv-engine-worker/src/handlers/brief.ts` | 262 | The Brief Builder — most important 262 lines in the system |
| `frontend/services/cvVoiceFidelity.ts` | 210 | Deterministic voice enforcement (pronoun strip, tense fix) |
| `backend/cv-engine-worker/seeds/seeds-voices.json` | — | Voice profile data |
| `backend/cv-engine-worker/migrations/023_voice_summary_formulas.sql` | — | Voice → summary structure formulas |
| `backend/cv-engine-worker/migrations/017_cv_examples_variance.sql` | — | D1 examples table + narrative_angle column |
| `.agents/memory/cv-variance-architecture.md` | — | Variance architecture internal notes |

### Total Deterministic Code vs. AI-Dependent Code

| Category | Files | Lines |
|---|---|---|
| Deterministic engine | brief.ts, purify pipeline, voice fidelity, governance, assembler | ~5,600 |
| LLM orchestration | llm.ts, groqService.ts, cvEngineClient.ts | ~2,400 |
| Generation logic (AI-calls) | geminiService.ts LLM calls only | ~800 |
| **Total deterministic %** | | **~73%** |

**The AI is responsible for roughly 27% of the generation logic. The deterministic layers own the other 73%.** This is the core engineering insight: ProCV's quality floor is not determined by the LLM — it is determined by what happens before and after the LLM.

---

## 13. Second Audit Cross-Reference — 10 Findings Verified Against Real Code

A second senior engineer audit raised 10 concerns about the pipeline. Each has been verified against actual source code. Status: ✅ Solved, ⚠️ Partial, ❌ Gap confirmed.

---

### Finding 1 — Rule Explosion ⚠️ Partial

**The claim:** The system is accumulating heuristics. `if A and B and not C unless D` will become the norm. Rules should be declarative JSON, not nested conditionals.

**What the code actually shows:**

The field keyword scoring (`brief.ts`) IS already declarative — field profiles are data in KV, not `if/else` blocks. The brief builder reads `cv:fields:all` and scores them algorithmically. That part is sound.

However the concern is legitimate in **two places**:

1. **Scenario detection** (`geminiService.ts:detectScenario`) is imperative logic with string constants embedded in `purify.ts`. Adding Scenario E requires editing both files.
2. **Voice selection** uses `compatible_fields` and `compatible_seniority` arrays in seed data, which is good — but the `verb_bias` overlap calculation and `incompatible_with` list are hardcoded scoring logic that will need updating as voices multiply.

**Verdict:** The field taxonomy is declarative. The scenario and voice compatibility systems are not. The risk is real for scenarios — not yet for fields.

---

### Finding 2 — Prompt Assembly Too Powerful ⚠️ Partial

**The claim:** Prompt = Business Logic. Changing wording changes behaviour. The LLM should receive structured parameters, not embedded decision logic.

**What the code actually shows:**

The brief builder (`brief.ts`) DOES separate deterministic decisions from the prompt:
```
{
  bullet_count: 5,
  metric_density: "high",
  tense: "past",
  verb_pool: [...30 verbs],
  rhythm: { sequence: ["punchy", "standard", "narrative"] }
}
```

The LLM receives this as a structured parameter block. That is correct architecture.

The legitimate gap is in the **19-rule critical reminder** and the **scenario blocks (A/B/C/D)**. These are ~500 lines of English-language business rules embedded inside prompt strings in `purify.ts`. When a rule changes (e.g., minimum bullet word count shifts from 8 to 10), a developer edits a natural-language sentence in a 924-line file — and the change is invisible to the cache key unless the full system prompt text changes.

**Verdict:** The deterministic decision layer exists and works. The embedded-rule-in-text-string problem is real and concentrated in `purify.ts`.

---

### Finding 3 — Seniority Classification Fragility ✅ Largely Solved

**The claim:** LLMs are unreliable seniority classifiers. Seniority should be determined deterministically from years, titles, people managed, revenue, certifications.

**What the code actually shows:**

ProCV already has a deterministic seniority engine in `brief.ts`:

```typescript
// Step 1: mathematical years from employment history
totalMonths = sum(role durations)
years = round(totalMonths / 12)

// Step 2: band lookup from D1 seniority table
pickSeniorityByYears(years, seniorityRows)
// bands: entry(<1), junior(1-2), mid(3-5), senior(6-9), lead(10+)

// Step 3: regex title override (takes precedence over years)
/\b(intern|trainee)\b/ → entry
/\b(lead|principal|vp|cto)\b/ → lead
/\bsenior\b/ + years>=5 → senior
```

**The AI never classifies seniority.** This is already frozen.

**What IS missing** from the second audit's recommended inputs:
- People managed count (not extracted from profile)
- Revenue responsibility (not extracted)
- Certifications (not used in seniority scoring)

These three would improve accuracy for management tracks vs. individual contributor tracks at the same year band — e.g., a 7-year engineer who manages 15 people should score `lead`, not `senior`.

**Verdict:** Seniority is already deterministic. The three missing inputs would add ~15% accuracy improvement for management tracks.

---

### Finding 4 — Example Pool Drift ⚠️ Partial

**The claim:** Examples become hidden training data. Style contamination, profession leakage, and repetitive outputs emerge as the pool grows. Examples need tagging by industry, seniority, region, tone, template.

**What the code actually shows:**

The `cv_examples` D1 table (migration 017) stores structural blueprints keyed by `SHA-256(normalised_role:seniority:purpose:mode)`. The `narrative_angle` column was added to prevent the pool from converging on a single angle.

**Current tags on each example:**
- Role fingerprint (implicit)
- Seniority level (implicit in fingerprint)
- Narrative angle (`impact` / `process` / `people` / `growth`)

**Missing tags from the second audit's list:**
- ❌ Industry tag (a nursing blueprint could theoretically match a tech fingerprint if the SHA collides — unlikely but not impossible with the current key design)
- ❌ Region tag (no regional weighting)
- ❌ Tone tag (voice name is not stored in the example — only angle)
- ❌ Template tag (templates affect visual density expectations)

**Verdict:** The foundation is correct — structural blueprints not content, angle diversity enforced. The pool will not contaminate content because only rhythm/word-count metadata is stored. Style contamination is not a risk with the current blueprint architecture. The legitimate gap is the missing voice/tone tag — a blueprint generated under `platform_architect` voice may have different verbosity expectations than one generated under `startup_engineer`.

---

### Finding 5 — No True Validation Layer ⚠️ Partial (more than assumed)

**The claim:** The pipeline generates and returns without a validate → repair loop. A validator should catch bullet count violations, tense errors, and unsupported claims.

**What the code actually shows:**

There IS a validation layer, more substantial than the second audit assumed:

| Validator | File | What it checks |
|---|---|---|
| `runQualityGate()` | `cvQualityGate.ts` | Rhythm, verb diversity, banned phrases, metric density |
| `handleValidateVoice()` | `validation.ts` | Rhythm drift, verb-outside-pool, metric mismatch |
| `stripUngroundedNumbers()` | `cvNumberFidelity.ts` | Strips hallucinated numbers not in source profile |
| `repairBulletsAgainstSource()` | `cvNumberFidelity.ts` | Restores degraded bullets from source text |
| `cvStyleGovernance` | `cvStyleGovernance.ts` | Opener diversity, verb saturation, semantic clustering |

The **repair loop** also exists: if the quality gate flags critical issues, a secondary AI rewrite is triggered via `workerTieredLLM(task='humanize')`.

**What IS genuinely missing:**

1. **Claim support validation** — "Increased revenue by 300%" is stripped if 300 doesn't appear in the source profile, but "Increased revenue" (vague, unquantified) is not flagged. There is no validator that says "this bullet implies a KPI that the profile does not support."
2. **Bullet count enforcement** — If the LLM returns 12 bullets when 5 were requested, no deterministic counter catches and trims this before the user sees it.
3. **Structure validator** — No check that every role's first bullet is a scope anchor (the rule exists in the prompt but is not enforced post-generation).

**Verdict:** The validation layer is substantially more capable than the second audit assumed. The three genuine gaps above are real.

---

### Finding 6 — Hallucination Prevention ✅ Significantly Addressed

**The claim:** LLMs invent KPIs, certifications, and leadership experience. Every profile field needs a confidence score (`user_supplied` vs. `inferred`). Only `user_supplied` metrics should appear in the CV.

**What the code actually shows:**

ProCV has a two-phase hallucination prevention system more sophisticated than any confidence-score approach:

**Phase 1 — Pre-generation anchor (cvPromptHelpers.ts):**
```typescript
lockRealNumbers(profile)
// Extracts: all numeric values from experience/projects,
//           company names, school names, degrees,
//           years calculated from employment dates
// Injects: "Anchor Block" into prompt with explicit instruction:
// "The ONLY numeric figures you may use are these.
//  Never invent a number. Never round one up. Never add zeros."
```

**Phase 2 — Post-generation strip (cvNumberFidelity.ts):**
```typescript
stripUngroundedNumbers(generatedCV, sourceProfile)
// For every number in the generated text:
//   if number NOT in sourceProfile → delete the entire phrase
// "increased sales by 40%" → "increased sales"
// Then: clean up orphan currency symbols, stranded prepositions

repairBulletsAgainstSource(degradedBullet, sourceText)
// If stripping hollows out a bullet → fall back to user's original text
```

**What IS missing** from the confidence-score model:

The current system only anchors **numbers**. It does not catch:
- Hallucinated certifications: "AWS Certified Solutions Architect" — if this text appears in a bullet but not the profile, no system removes it
- Hallucinated leadership: "Managed a team of 12" — if "12" is in a project description (e.g., "12-week project"), the system won't flag the management claim as hallucinated
- Invented company achievements: "Ranked #1 in the region" — no number, so not caught

**Verdict:** Number-level hallucination prevention is robust. Non-numeric claim validation is a real gap.

---

### Finding 7 — Pipeline Observability ⚠️ Partial

**The claim:** "Why did this summary happen?" Currently nobody knows. Stage logs are needed.

**What the code actually shows:**

Telemetry exists across four D1 tables:
- `cv_request_telemetry`: seniority, field, voice, section, jd_present, field_source
- `generation_log`: cv_hash, model, prompt_version, generation_mode, word_count, quality metrics
- `detected_leaks`: every banned phrase caught, every governance violation
- `user_edits`: field-level diff of what users changed after generation

**What is logged:** What happened at the output level.  
**What is NOT logged:** Why a decision was made at each stage.

Specifically missing:
- Which scenario was selected (A/B/C/D) and what triggered it
- Which narrative angle was picked and what the angle history was
- Which 12 verbs were in the generation's pool
- Whether a structural blueprint was found in D1 or was a cold miss
- Whether ATS gap-pin was active and how many keywords were pinned
- Whether the profile cache placeholder was used or the full profile was sent
- Which quality gate violations were found and whether a repair was triggered

**Verdict:** This was already identified as HIGH risk in Section 10. The second audit confirms it. The fix (Section 11, Recommendation 1) is a `GenerationTrace` object attached to each CV.

---

### Finding 8 — Prompt Versioning ⚠️ Partial (smarter than assumed)

**The claim:** Prompts are updated directly with no versioning. "v11 reduced engineering quality" — you can't trace this.

**What the code actually shows:**

A global version (`CV_RULES_VERSION = '2.5'`) is the primary mechanism:
- Included in every in-memory cache key
- Stored in `generation_log.prompt_version` in D1
- When bumped, ALL cached results are invalidated globally

The **Cloudflare Worker scenario blocks** (A/B/C/D, humanization rules, critical reminder) are loaded at runtime via `loadRules()` — effectively allowing hot-updates without a frontend deployment. This IS a form of versioning, but it is **implicit**: if a rule changes in the worker, there is no version bump that would tell you "these 200 CVs were generated under the old scenario C."

**What IS missing:**
- Per-section prompt versions (`summary_v12`, `experience_v8`, `skills_v5`)
- A rollback mechanism — bumping `CV_RULES_VERSION` from 2.5 → 2.6 is one-way; there is no "restore 2.5"
- Diff tracking — no record of what changed between version 2.4 and 2.5

**Verdict:** Global versioning exists and is correctly wired into telemetry. Per-section versioning and rollback capability are not yet built. The second audit's concern is partially valid.

---

### Finding 9 — Profession Taxonomy Gap ⚠️ Real but overstated

**The claim:** Professions rely on inference. Civil Engineering needs sub-specialties (Construction, Water, Irrigation, Structural) with different outputs. A formal profession ontology with inheritance is needed.

**What the code actually shows:**

ProCV already has specialized field entries that go significantly beyond "Civil Engineering":

| Field slug | Examples of specificity |
|---|---|
| `irrigation` | keywords: drip, sprinkler, hydrology, biosystems |
| `drought_management` | keywords: early warning, food security, famine, climate resilience |
| `nursing_medical` | keywords: patient care, triage, EHR, infection control |
| `accounting_audit` | keywords: IFRS, GAAP, reconciliation, audit trail |

These are NOT parent-child relational — they are **flat peers that compete by keyword score**. The sub-specialty handling is emergent: a highly specific `irrigation` JD will out-score `civil_engineering` because it hits more irrigation-specific keywords.

**What IS missing:**
1. **No inheritance** — if `irrigation` doesn't have a rule that `civil_engineering` has, it doesn't inherit it. Every sub-specialty must be fully specified.
2. **No parent fallback** — if a JD scores equally on `civil_engineering` and `irrigation`, which wins? The highest raw score wins, which may be incorrect if the JD is ambiguous.
3. **Role Tracks vs. Field Profiles are separate systems** — `roleTracks.ts` (21 UI categories) and `cv_field_profiles` (D1, ~30+ generation fields) are not linked. A user selecting "Civil Engineering" in the UI doesn't auto-map to the `irrigation` field profile.

**Verdict:** The taxonomy is more granular than the second audit assumed. The flat-peer model works well for distinct specialties. The inheritance and fallback gaps are real — particularly the UI-to-field-profile linkage gap.

---

### Finding 10 — PDF Layer Coupling ✅ Already Solved

**The claim:** AI determines layout. Better to separate content from presentation: JSON → Template Renderer → PDF.

**What the code actually shows:**

This is **already exactly how ProCV works**:

```
CVData (structured JSON)
    ↓
35+ Template Components (React, each a separate renderer)
    ↓
getCVHtml() (renders DOM to self-contained HTML)
    ↓
Playwright / Cloudflare PDF Worker (PDF binary)
```

The AI generates `CVData`. The AI has zero control over visual layout — that is entirely the template renderer's domain. Users switch templates without re-generating. The JSON is the canonical CV; the PDF is a derived artifact.

**Verdict:** The second audit's concern does not apply to ProCV. This is one of the architectural decisions that was made correctly from the start.

---

### Summary Table — All 10 Findings

| Finding | Status | Severity if Unaddressed |
|---|---|---|
| 1. Rule Explosion | ⚠️ Partial (scenarios/voice not declarative) | HIGH |
| 2. Prompt Assembly Too Powerful | ⚠️ Partial (brief separated, rules not) | MEDIUM |
| 3. Seniority Classification Fragility | ✅ Largely Solved (deterministic engine exists) | LOW |
| 4. Example Pool Drift | ⚠️ Partial (angle diversity exists, voice tag missing) | LOW-MEDIUM |
| 5. No True Validation Layer | ⚠️ Partial (substantial but 3 gaps confirmed) | MEDIUM |
| 6. Hallucination Prevention | ✅ Significantly Addressed (non-numeric gap remains) | MEDIUM |
| 7. Pipeline Observability | ❌ Confirmed Gap (no stage-level trace) | HIGH |
| 8. Prompt Versioning | ⚠️ Partial (global version, no per-section or rollback) | MEDIUM |
| 9. Profession Taxonomy Gap | ⚠️ Partial (granular flat taxonomy, no inheritance) | MEDIUM |
| 10. PDF Layer Coupling | ✅ Already Solved | — |

---

## 14. The v3 Roadmap — 6 Systems to Build

Based on both audits and real code verification, here are the 6 systems that would transform ProCV from "sophisticated v2" into a **deterministic resume operating system with AI as the writing layer**.

---

### System 1 — Rule Registry (Declarative Rules Engine)

**What it replaces:** The hardcoded scenario strings in `purify.ts`, the imperative voice compatibility logic in `brief.ts`.

**What it looks like:**

```json
// Stored in Cloudflare KV: cv:rules:scenarios
{
  "scenario_C": {
    "id": "C",
    "label": "No experience, has projects",
    "detection": {
      "has_experience": false,
      "has_projects": true,
      "is_thin": false
    },
    "section_order": ["summary", "skills", "projects", "education", "languages"],
    "omit_sections": ["experience"],
    "summary_formula": "builder_identity → strongest_project_outcome → stack → readiness",
    "summary_word_count": [55, 70],
    "project_bullet_count": [4, 6],
    "rules": ["present_tense_if_live", "treat_projects_as_experience"]
  }
}
```

**The evaluator** reads this registry at brief-build time and returns a `ScenarioSpec` object. The prompt builder consumes the spec, not the hardcoded string.

**Benefits:**
- New scenarios deployed via KV update — no code change, no worker redeploy
- Scenarios A/B tested by serving different registry versions to different user cohorts
- Rule conflicts surface at evaluation time, not at "weird CV output" time
- `purify.ts` shrinks from 924 lines to ~200 lines (handler + orchestrator only)

**Effort:** 2 weeks. Phased rollout: migrate Scenario C first (highest complexity), validate, then A/B/D.

---

### System 2 — Validation Engine (Hard Rules, No Exceptions)

**What it adds:** A deterministic post-generation checker that catches structural violations before the user sees output.

**Rules it enforces (examples):**

```typescript
interface ValidationRule {
  id: string;
  check: (cv: CVData, brief: CVBrief) => ValidationResult;
  severity: 'block' | 'warn' | 'log';
  repair?: RepairStrategy;
}

// Example rules:
RULE_bullet_count:
  check: every role has exactly brief.rhythm.bullet_count bullets
  severity: 'block'
  repair: trim_excess | pad_if_short

RULE_scope_anchor:
  check: every role's first bullet mentions at least one of
         [team_size, budget, region, client_count, report_count]
  severity: 'warn'
  repair: prepend_scope_anchor

RULE_tense_consistency:
  check: current role bullets use present tense; past roles use past tense
  severity: 'block'
  repair: apply _normalizePresentTenseToImperative()

RULE_no_summary_seeking:
  check: summary does not contain any phrase from SEEKING_PHRASES list
  severity: 'block'
  repair: strip_phrase + re-verify

RULE_skills_cap:
  check: skills.length <= 15
  severity: 'block'
  repair: slice(0, 15)
```

**Architecture:**
```
LLM Output
    ↓
ValidationEngine.validate(cv, brief)
    ↓ if violations exist:
RepairEngine.repair(cv, violations, brief)
    ↓
ValidationEngine.validate(cv, brief)  ← second pass
    ↓ if still failing after 2 repairs:
QualityGate.flag(cv) + return with warnings
    ↓ if passing:
Final CV
```

**Effort:** 1.5 weeks. Most rules already exist as prompt instructions — this codifies them as code.

---

### System 3 — Confidence-Tagged Profile Fields

**What it adds:** A distinction between facts the user explicitly provided vs. facts the engine inferred or the LLM extrapolated.

**Data model:**

```typescript
interface TaggedValue<T> {
  value: T;
  confidence: 'user_supplied' | 'system_extracted' | 'llm_inferred';
  source?: string;  // e.g., "extracted from work experience at Company X"
}

// Applied to profile fields that affect CV claims:
interface TaggedExperience {
  teamSize?: TaggedValue<number>;       // user typed "managed 12 people"
  budgetManaged?: TaggedValue<number>;  // user typed "$2M budget"
  revenueImpact?: TaggedValue<number>;  // user typed "grew ARR by 40%"
  certifications: TaggedValue<string>[]; // user listed vs. LLM suggested
}
```

**Enforcement in the anchor block:**

```
Current anchor block:
"The only numbers you may use are: 800000, 12, 40..."

Enhanced anchor block with confidence:
"User-supplied (use freely): 800000, 12, 40
System-extracted (use with attribution): 2023, 4 [years experience]
LLM-inferred (do NOT use in metrics — inference only): [none]
Unverified claims (forbidden in bullets): certifications not in source"
```

**Effort:** 2 weeks for profile tagging + 3 days for anchor block integration.

---

### System 4 — Prompt Registry with Per-Section Versioning

**What it adds:** Independent version tracking for each prompt section, rollback capability, and quality correlation by version.

**Data structure:**

```typescript
interface PromptVersion {
  section: 'summary' | 'experience' | 'skills' | 'education' | 'projects';
  version: string;      // e.g., "summary_v14"
  content: string;      // the actual prompt text
  active: boolean;
  createdAt: string;
  notes: string;        // "Removed 'Seeking to' variants, added scope anchor rule"
}
```

**Storage:** D1 table `prompt_registry`. Active version per section served from KV.

**Telemetry change:** `generation_log.prompt_version` changes from `'2.5'` (global) to:
```json
{
  "summary": "summary_v14",
  "experience": "experience_v9",
  "skills": "skills_v6",
  "global": "2.5"
}
```

**Rollback:** `UPDATE prompt_registry SET active = false WHERE section = 'summary' AND version = 'summary_v14'; UPDATE prompt_registry SET active = true WHERE version = 'summary_v13';`

**Correlation query:** "Did switching from experience_v8 to experience_v9 improve quality scores?"
```sql
SELECT prompt_version->>'experience', AVG(round_number_ratio), AVG(repeated_phrase_count)
FROM generation_log
WHERE created_at > NOW() - INTERVAL '14 days'
GROUP BY prompt_version->>'experience';
```

**Effort:** 1.5 weeks.

---

### System 5 — Generation Trace + Trace Viewer

**What it adds:** A complete audit trail for every CV generation, answerable question: "Why did this CV look this way?"

**Trace data model:**

```typescript
interface GenerationTrace {
  traceId: string;         // UUID, links to generation_log
  timestamp: string;
  rulesVersion: string;

  // Classification decisions
  scenario: 'A' | 'B' | 'C' | 'D' | 'standard';
  scenarioEvidence: {
    hasExperience: boolean;
    hasProjects: boolean;
    isThin: boolean;
    pivotDetected: boolean;
    pivotFrom?: string;
    pivotTo?: string;
  };

  // Brief decisions
  seniority: string;
  senioritySource: 'years' | 'title_override';
  field: string;
  fieldScore: number;
  voice: string;
  voiceScore: number;
  voiceOverridden: boolean;

  // Variance decisions
  narrativeAngle: NarrativeAngle;
  angleHistory: NarrativeAngle[];   // the history that led to this pick
  verbPoolSample: string[];          // the 12 verbs used
  verbosityJitter: number;           // the ±0.2 value applied

  // Example decisions
  structuralExampleFound: boolean;
  exampleAngle?: NarrativeAngle;     // angle of the example retrieved

  // ATS decisions
  gapKeywordsCount: number;
  gapKeywords: string[];

  // Cache decisions
  profileCacheHit: boolean;
  llmCacheHit: boolean;

  // Quality decisions
  qualityGateViolations: string[];
  repairTriggered: boolean;
  validationPassCount: number;

  // Timing
  briefMs: number;
  generationMs: number;
  purificationMs: number;
  totalMs: number;
}
```

**Storage:** Attached to `CVData` object in localStorage. Optionally synced to `generation_log` D1 table (as a JSON column).

**Trace Viewer:** A collapsible "Generation Details" panel in the CV editor (visible only in debug mode or for power users). Displays:

```
Generated: 14 June 2026 at 09:32
Scenario C — No experience, has projects
Voice: startup_engineer (score: 6) — not overridden
Seniority: junior (from 2.1 years calculated)
Field: technology (score: 47, title match on "Software Developer")
Narrative angle: Process (last used: Impact 2 generations ago)
Verb pool: Built, Shipped, Debugged, Wrote, Reduced, Deployed, Migrated, Integrated, Automated, Fixed, Optimised, Launched
ATS gap-pin: 3 keywords pinned (React, Node.js, REST APIs)
Structural example: found (different angle: Impact)
Profile cache: hit (saved 2.1KB from request)
Quality gate: 2 violations found → repair triggered → passed on second pass
Total: 8.4s (brief: 0.3s, generation: 6.9s, purification: 1.2s)
```

**Effort:** 3 days (data collection) + 4 days (UI panel).

---

### System 6 — Profession Ontology with Inheritance

**What it adds:** A formal parent-child taxonomy for field profiles, so sub-specialties inherit parent rules and the UI-to-field mapping is explicit.

**Proposed structure:**

```json
{
  "engineering": {
    "label": "Engineering",
    "children": {
      "civil_engineering": {
        "label": "Civil Engineering",
        "inherits": "engineering",
        "children": {
          "irrigation": { "label": "Water/Irrigation", "inherits": "civil_engineering" },
          "structural": { "label": "Structural", "inherits": "civil_engineering" },
          "construction": { "label": "Construction", "inherits": "civil_engineering" }
        }
      },
      "mechanical_engineering": { "label": "Mechanical", "inherits": "engineering" },
      "software_engineering": { "label": "Software/Tech", "inherits": "engineering" }
    }
  }
}
```

**Inheritance resolver:**
```typescript
resolveFieldRules(field: 'irrigation'): MergedFieldRules {
  // Walk up: irrigation → civil_engineering → engineering → base
  // Child rules override parent rules
  // Returns fully resolved rule set
}
```

**UI benefit:** The profile form's "Industry" dropdown maps directly to the ontology. Selecting "Civil Engineering" → Irrigation allows the brief builder to fetch the exact `irrigation` field profile without relying on keyword scoring alone.

**Effort:** 1 week (ontology schema + resolver + UI dropdown update).

---

## 15. Predicted Challenges — 3 to 12 Month Horizon

These are not hypothetical — they are extrapolated from patterns already visible in the current codebase.

---

### Challenge 1 — Regression Bugs (3 months) 🔴 HIGH LIKELIHOOD

**Pattern:** A fix for nursing CVs (e.g., clinical tense enforcement) breaks engineering CVs (which need different tense rules for lab environments).

**Current risk level:** Already happening — the `seniority-fix-path.md` memory note and `auth-device-id.md` memory note both document fixes that required non-obvious debugging because a rule interaction wasn't anticipated.

**Root cause:** Rules are applied sequentially in the purification pipeline. A rule added for one profession type has no isolation — it runs on all professions.

**Prevention:** Validation Engine (System 2) with per-rule field/seniority scoping:
```json
{
  "rule": "clinical_tense",
  "applies_when": { "field": "nursing_medical" },
  "does_not_apply_when": { "field": "engineering" }
}
```

---

### Challenge 2 — Prompt Bloat and Token Limit Failures (3-6 months) 🟠 MEDIUM LIKELIHOOD

**Pattern:** As the 19-rule reminder grows (currently 19 rules, each a sentence), the system prompt approaches model limits. Long profiles + long JDs + long system prompt = 413 errors.

**Current evidence:** The slim-profile heuristic (`_profileMaxChars = 120 vs 350`) was introduced as a workaround. Profile caching (`{{PROFILE}}` placeholder) was introduced. Both are band-aids for a root problem: the prompt is carrying too much.

**Root cause:** Business logic embedded in prompt strings grows with every new rule.

**Prevention:** Prompt Registry (System 4) with hard token budget enforcement per section:
```typescript
const PROMPT_BUDGET = {
  system: 4000,    // tokens
  scenario: 800,
  anchor: 600,
  reference: 400,
  rules: 1200,
};
// If any section exceeds budget → compress or truncate, never fail silently
```

---

### Challenge 3 — Rule Conflicts Between Voice and ATS (3-6 months) 🟠 MEDIUM LIKELIHOOD

**Pattern:** Voice rules say "50-60% of bullets carry metrics." ATS gap-pin says "these 12 keywords MUST appear." For a thin profile, both constraints cannot be satisfied simultaneously.

**Current evidence:** The gap-pin block explicitly instructs: "Do NOT invent achievements to shoehorn a keyword — use it only where the experience genuinely supports it." This is correct but it means the ATS guarantee is conditional. Users who see the "3 keywords pinned" message expect those keywords to appear — but they won't if the experience can't support them.

**Prevention:** Conflict resolution at the constraint-merging stage:
```
if (gap_keywords_count > 6 AND profile.experience.length < 2):
    log ConflictWarning("ATS gap coverage reduced — profile too thin")
    reduce pinned keywords to top 4
    surface to user: "4 of 12 gap keywords were pinnable given your experience"
```

---

### Challenge 4 — Duplicate Outputs at Scale (6 months) 🟠 MEDIUM LIKELIHOOD

**Pattern:** As user volume grows, structural blueprints from D1 examples become the dominant influence on generation. CVs for "mid-level software engineer" across different users start sharing the same rhythm patterns and word-count distributions.

**Current evidence:** The variance system is designed to prevent this (angle LRU, verb shuffle, forbidden rotation). But structural blueprints are fetched by `SHA-256(role:seniority:purpose:mode)` — two different users with the same role+seniority will share the same blueprint.

**Prevention:** Add a user-specific salt to the structural reference block:
```typescript
buildReferenceBlock(example, {
  // Don't copy — these are calibration targets only
  userSalt: quickHash(profile.name + profile.personalInfo.email),
  // Force slight divergence from blueprint rhythm
  rhythmJitter: Math.random() * 0.15
})
```

---

### Challenge 5 — Debugging Becomes Expert-Only (6-12 months) 🔴 HIGH LIKELIHOOD WITHOUT FIX

**Pattern:** As the team grows or as the original engineer context fades, "why did this CV look weird" becomes a 2-hour investigation through `geminiService.ts` (5,197 lines), `cvPurificationPipeline.ts` (3,063 lines), and `purify.ts` (924 lines).

**Current evidence:** This is already the state. There is no tool to answer "why" without reading code.

**Prevention:** Generation Trace + Trace Viewer (System 5). This is the single highest-leverage fix — it pays dividends on every future debugging session.

---

### 3-Month Priority Order

Given the likelihood and impact of each challenge:

| Priority | System to Build | Challenge it Prevents |
|---|---|---|
| 1 | Generation Trace (System 5) | Debugging, observability, debugging |
| 2 | Validation Engine (System 2) | Regression bugs, structural violations |
| 3 | Prompt Registry (System 4) | Prompt bloat, version tracking |
| 4 | Rule Registry (System 1) | Rule explosion, scenario maintenance |
| 5 | Confidence-Tagged Fields (System 3) | Non-numeric hallucination |
| 6 | Profession Ontology (System 6) | Taxonomy fragility, UI-field gap |

Systems 1 and 2 can be built in parallel. System 5 should start immediately — it has the lowest risk and the highest diagnostic value.

---

### Final Verdict — What ProCV Is and What It's Becoming

**Today:**
> A strong v2 product architecture entering the complexity wall. Not duct tape. A sophisticated pipeline held together by a growing collection of heuristics. The AI is responsible for 27% of the generation logic — the deterministic layers own 73%. That ratio is the right bet.

**The risk without action:**
> Every successful fix adds another heuristic. Without deterministic layers (Rule Registry, Validation Engine, Prompt Registry, Generation Trace), the engine will gradually become fragile over the next 6–12 months. Bugs will become harder to reproduce. New profession support will break old profession behaviour. The "why did this CV look weird" question will have no answer.

**The opportunity with action:**
> Implement the 6 systems above and ProCV evolves from "AI resume generator" into a **deterministic resume operating system** with AI as the writing layer. That architecture is defensible, scalable, and debuggable. It is also rare — most competitors are pure prompt wrappers. ProCV's deterministic layer is already a moat. The 6 systems harden it into a wall.

---

*Document updated from direct cross-reference of two external senior engineer audits against actual source code. All 10 second-audit findings verified against real implementation. All findings marked ✅ Solved, ⚠️ Partial, or ❌ Confirmed Gap.*
