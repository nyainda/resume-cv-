# Pipeline Intelligence — Full Design & Build Plan

> **Status:** Planning — approved for implementation  
> **Scope:** Four interconnected improvements to the CV generation, quality, and Doctor subsystems  
> **Principle:** Every AI output routes through the purification pipeline. Every quality signal lives in one place. The system learns from what it misses.

---

## The Problem (current state)

| Area | What exists today | The gap |
|---|---|---|
| Post-generation feedback | `QualityIssuesPanel`, `CVCompareModal`, `ScoreMyCVPage`, `CVDoctorPanel` — all separate, all require the user to navigate | No single moment of truth after build |
| Purification coverage | `cvPurificationPipeline.ts` covers import + generation | Doctor AI (`groqChat`), copilot, and any LLM amendment **bypasses** purification entirely |
| Skills | `deduplicateSkills()` string-matches profile skills against JD skills | Semantic clashes remain; JD skills injected even when not evidenced in bullets |
| Learning | Banned phrase list is static; Doctor flags issues that already escaped | Nothing feeds Doctor's findings or user edits back into purification |

---

## Feature 1 — Build Complete: Central Command Panel

### What it is
A structured panel that appears **automatically** after every CV generation. It replaces hunting across four separate tools. Everything that happened to the user's CV — what was caught, what was cleaned, what scored, what the pipeline decided about skills — is surfaced in one place, one time.

### Design
- **Trigger:** Immediately when `onUpdateCV` is called in `CVGenerator.tsx` after a successful build
- **Component:** `BuildCompletePanel.tsx` — right-side drawer (same slot as CVDoctorPanel) with 4 tabs

```
┌──────────────────────────────────────────────────────┐
│  ✓ CV Built  ·  3 things fixed  ·  ATS 87%  ·  [×] │
├──────────────┬────────────┬───────────┬──────────────┤
│ 🔧 Pipeline  │ ✦ Quality  │ 🎯 ATS    │ ⚡ Skills    │
├──────────────┴────────────┴───────────┴──────────────┤
│                                                      │
│  PIPELINE TAB                                        │
│  ┌─────────────────────────────────────────────┐    │
│  │ ✓  Banned phrases removed          2        │    │
│  │ ✓  Metrics grounded (no invented)  OK       │    │
│  │ ✓  Voice normalised (no "I/my")    1 fixed  │    │
│  │ ✓  Certifications verified         OK       │    │
│  │ ⚠  Bullet rhythm: 1 role thin      review   │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  QUALITY TAB                                         │
│  Overall score: 91/100  ████████████░░              │
│  ✓ No passive voice  ✓ Strong verbs  ⚠ 1 filler    │
│                                                      │
│  ATS TAB                                             │
│  87% keyword match  |  Missing: "CI/CD", "Agile"    │
│                                                      │
│  SKILLS TAB                                          │
│  Native (profile): 8 skills shown                   │
│  Added from JD:    3  (all evidenced in bullets)    │
│  Dropped:          4  (not evidenced — protected)   │
└──────────────────────────────────────────────────────┘
```

### Data model — `CVBuildReport`

```typescript
// frontend/types/buildReport.ts
export interface PipelineEvent {
  stage: 'banned_phrase' | 'metric_fidelity' | 'voice' | 'cert' | 'rhythm' | 'skills';
  action: 'removed' | 'fixed' | 'warned' | 'ok';
  count?: number;
  detail?: string;       // human-readable, shown in panel
  pattern?: string;      // the actual text removed (for learning — see Feature 2)
}

export interface CVBuildReport {
  generatedAt: string;           // ISO timestamp
  cvId: string;
  templateId: string;
  pipeline: PipelineEvent[];
  qualityScore: number;          // from cvFinalGuard 7-pass
  qualityIssues: QualityIssue[]; // existing type, reused
  atsScore: number;
  atsMissing: string[];
  skillsNative: string[];
  skillsAddedFromJD: string[];
  skillsDropped: string[];       // not evidenced, stripped by reconciler
}
```

### What to build

| File | Action |
|---|---|
| `frontend/types/buildReport.ts` | New — `CVBuildReport`, `PipelineEvent` types |
| `frontend/services/cvPurificationPipeline.ts` | Emit `PipelineEvent[]` from `purifyProfile()` — return alongside the cleaned profile |
| `frontend/services/geminiService.ts` | Collect events from `finalizeCvData()` + `cvFinalGuard` pass; attach to the build result |
| `frontend/components/BuildCompletePanel.tsx` | New — 4-tab drawer, auto-shown post-generation |
| `frontend/components/CVGenerator.tsx` | On build success: store `CVBuildReport` in state, open `BuildCompletePanel` |

### What does NOT change
- `CVDoctorPanel`, `ScoreMyCVPage`, `QualityIssuesPanel` all stay as deep-dive tools. The Build Complete panel links to them for users who want to dig further. It is a summary layer, not a replacement.

---

## Feature 2 — Pipeline Learning Loop

### What it is
The pipeline currently has a static banned phrase list and static rules. When Doctor flags a problem that generation didn't catch, that's evidence a pattern escaped. When a user manually rewrites a bullet, that's a signal about what the AI produced. We capture these signals, aggregate them, and let admins promote patterns into the live purification rules — which then ship to all users via CF KV.

### Signal sources

| Signal | When it fires | What we learn |
|---|---|---|
| Doctor flags an issue post-generation | User opens Doctor after a build | A pattern that escaped `cvPurificationPipeline` |
| User manually edits a Doctor-suggested bullet | User picks "manual" instead of AI suggestion | AI rewrite was wrong; the original Doctor flag was valid but the fix wasn't |
| `BuildCompletePanel` "Warn" events not "OK" | Every build | What is slipping through to warning vs fully clean |
| User accepts / rejects a suggested skill | Skills tab of Build Complete | JD skill quality signal |

### Data flow

```
Build or Doctor action
      │
      ▼
escapeCollector.ts          ← thin, non-blocking, fire-and-forget
      │
      ▼
IDB: pipeline_escapes        ← local queue (privacy: no CV text, only pattern type + category)
      │  (batch every 10 events or on app idle)
      ▼
CF Worker: POST /api/pipeline/escapes
      │
      ▼
D1: pipeline_escapes table
      │
      ▼
Admin: EscapeReviewPage.tsx  ← shows aggregated patterns, frequency, examples
      │  admin clicks "Promote to banned phrase"
      ▼
CF KV: banned_phrases list   ← invalidateKVCache() called
      │
      ▼
All future generations pick up the new rule automatically
```

### D1 schema (new migration)

```sql
-- migration 040
CREATE TABLE IF NOT EXISTS pipeline_escapes (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  escape_type TEXT   NOT NULL,  -- 'banned_phrase' | 'weak_verb' | 'hallucinated_cert' | 'jd_skill_clash' | 'passive_voice'
  pattern    TEXT    NOT NULL,  -- the text fragment (no PII — strip names/companies client-side)
  source     TEXT    NOT NULL,  -- 'doctor_flag' | 'user_edit' | 'build_warn'
  promoted   INTEGER DEFAULT 0, -- 1 = promoted to live rules by admin
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_pe_type ON pipeline_escapes(escape_type, promoted);
```

### What to build

| File | Action |
|---|---|
| `frontend/services/escapeCollector.ts` | New — `recordEscape(type, pattern, source)`, batches to IDB queue, strips PII before storing |
| `backend/cv-engine-worker/src/handlers/escapes.ts` | New — `POST /api/pipeline/escapes` (batch insert to D1), `GET /api/admin/escapes` (aggregated view) |
| `frontend/components/CVDoctorPanel.tsx` | On each flag emitted by `classifyBullets()`, call `recordEscape('doctor_flag', pattern, 'doctor_flag')` |
| `frontend/components/BuildCompletePanel.tsx` | On each "warn" event in the pipeline tab, call `recordEscape(...)` |
| `frontend/components/admin/EscapeReviewPage.tsx` | New admin page — table of aggregated patterns, frequency count, "Promote" button per row |
| `backend/cv-engine-worker/src/data.ts` | `promoteEscapeToRule(id)` — writes to banned_phrases KV, calls `invalidateKVCache()` |

### Privacy rule
`escapeCollector.ts` must strip personal data before logging any pattern. The pattern stored is the **category** + **sanitised fragment** (e.g. `"responsible for [VERB_PHRASE]"`). No names, companies, dates, or metric values ever leave the client in this payload.

---

## Feature 3 — Smart Skills Reconciliation

### The current problem

Today's flow:
1. User profile has `skills: string[]` — self-reported, often generic
2. JD scan extracts `jdSkills: string[]` via IBM Granite
3. `deduplicateSkills()` does string-level dedup → still clashes semantically
4. Backend `purify.ts` caps at 12–15 and strips generics — but by then the damage is done

Result: user's CV has a skills block that looks like it belongs to two different people — their original voice plus JD keywords dropped in without coherence.

### The fix — `skillsReconciler.ts`

A dedicated reconciler runs **before** the generation prompt is built. It has one job: produce a single, coherent, evidenced skills list that sounds like the user.

```typescript
// frontend/services/skillsReconciler.ts

interface ReconciledSkills {
  finalSkills: string[];        // what goes into the CV (max 15, ranked)
  native: string[];             // came from user profile, evidenced
  addedFromJD: string[];        // came from JD, evidenced in bullets
  dropped: string[];            // came from JD, NOT evidenced — dropped
  promoted: string[];           // user profile skill that JD confirms (boost ranked)
}

function reconcileSkills(
  profileSkills: string[],
  jdSkills: string[],
  experienceBullets: string[],  // all bullet text from user's work history
  targetSeniority: string
): ReconciledSkills
```

**Algorithm (5 passes, deterministic — no LLM needed):**

1. **Normalise** — lowercase, trim, expand abbreviations (`JS → JavaScript`)
2. **Semantic dedup** — cluster by edit distance + known synonym map (e.g. `"Stakeholder Management"` ≈ `"Stakeholder Engagement"` → keep the one in the user's profile)
3. **Evidence check** — for each JD skill, scan `experienceBullets` for presence (fuzzy match). Tag as `evidenced` or `ungrounded`
4. **Rank** — profile native > JD-evidenced > JD-ungrounded (dropped entirely)
5. **Voice normalise** — rephrase JD skills to match the seniority and brevity pattern of the user's existing profile skills (rule-based: if user says "Python" not "Python programming", standardise JD's "Python scripting" to "Python")

### Build Complete panel — Skills tab

After reconciliation, the Skills tab of the Build Complete panel shows:

```
⚡ Skills (15 selected)

  ✓ Native skills (from your profile)         8
    Python, React, PostgreSQL…

  ✓ Added from this job                       3
    (evidenced in your experience bullets)
    Kubernetes, CI/CD, Agile

  ✗ Dropped (not evidenced)                   4
    Six Sigma, SAP, COBOL, Salesforce
    These appeared in the JD but your
    experience doesn't support them.
    Add them to a role's bullets if real →
```

This transparency prevents the "I never used SAP" moment after download.

### What to build

| File | Action |
|---|---|
| `frontend/services/skillsReconciler.ts` | New — 5-pass reconciler, fully deterministic |
| `frontend/services/skillsSynonymMap.ts` | New — curated synonym clusters (50–100 pairs to start) |
| `frontend/services/geminiService.ts` | Call `reconcileSkills()` before building the generation prompt; attach `ReconciledSkills` to `CVBuildReport` |
| `frontend/components/BuildCompletePanel.tsx` | Skills tab renders `ReconciledSkills` from the report |

---

## Feature 4 — All AI Goes Through the Pipeline

### The current problem

| AI call site | Goes through purification? |
|---|---|
| `geminiService.ts` → `finalizeCvData()` | ✓ Yes |
| `importPipeline.ts` → `purifyProfile()` | ✓ Yes |
| `CVDoctorPanel.tsx` → `cvDoctorService.ts` → `groqChat` | ✗ **No** — own local banned phrase check only |
| `cvDoctorService.rewriteBulletOptions()` | ✗ **No** |
| `cvDoctorService.suggestQuantifiedBullet()` | ✗ **No** |
| `ProfileForm.tsx` LLM generators | Partial — `purifyProfile()` sometimes called |

Doctor is the main offender. It calls `groqChat` directly and returns raw LLM text to the user. This means Doctor can:
- Introduce banned phrases ("responsible for", "seeking to")
- Invent metrics not in the user's profile
- Add first-person ("I led a team of")
- Produce passive voice it was supposed to fix

### The fix — `purifiedLLMGateway.ts`

A thin wrapper that every AI call for CV content routes through:

```typescript
// frontend/services/purifiedLLMGateway.ts

export async function purifiedCompletion(
  callFn: () => Promise<string>,     // the actual LLM call
  context: PurificationContext       // what we know about the user's CV
): Promise<{ text: string; events: PipelineEvent[] }>
```

Internally:
1. Calls `callFn()` to get raw LLM output
2. Runs the output through the same purification passes as `cvPurificationPipeline`:
   - `stripBannedPhrases()`
   - `applyVoiceFidelity()` (strip I/my, normalise verb tense)
   - `checkMetricFidelity()` (no invented numbers)
3. Returns cleaned text + the `PipelineEvent[]` of what was changed

**Doctor integration:**

```typescript
// cvDoctorService.ts — before
const raw = await groqChat(prompt);
return raw;

// cvDoctorService.ts — after
const { text, events } = await purifiedCompletion(
  () => groqChat(prompt),
  { profileMetrics: context.profileMetrics, skills: context.skills }
);
recordEscape(events);  // Feature 2 — any warning = an escape signal
return text;
```

The user sees **already-clean** Doctor suggestions. The pipeline events feed into Feature 2 (learning).

### What to build

| File | Action |
|---|---|
| `frontend/services/purifiedLLMGateway.ts` | New — `purifiedCompletion()` wrapper |
| `frontend/services/cvDoctorService.ts` | Wrap `groqChat` calls in `rewriteBulletOptions`, `suggestQuantifiedBullet`, and `scanCVForDoctor` with `purifiedCompletion` |
| `frontend/components/ProfileForm.tsx` | Audit all LLM generator calls — ensure `purifyProfile()` is called on every exit path (some are already compliant) |
| `frontend/services/cvPurificationPipeline.ts` | Export individual passes (`stripBannedPhrases`, `applyVoiceFidelity`, `checkMetricFidelity`) so the gateway can compose them without running the full profile pipeline |

---

## Build Order

These four features are interdependent. Build in this order to avoid rework:

```
Phase A (foundation — no UI yet)
  ├── Export individual purification passes from cvPurificationPipeline.ts   [Feature 4 dep]
  ├── Create PipelineEvent + CVBuildReport types                              [Feature 1 dep]
  └── skillsReconciler.ts (deterministic, no backend needed)                 [Feature 3 dep]

Phase B (backend + data)
  ├── D1 migration 040 (pipeline_escapes table)                              [Feature 2]
  ├── CF Worker: POST /api/pipeline/escapes handler                          [Feature 2]
  └── CF Worker: GET /api/admin/escapes handler                              [Feature 2]

Phase C (wire purification everywhere)
  ├── purifiedLLMGateway.ts                                                  [Feature 4]
  ├── cvDoctorService.ts — route all completions through gateway             [Feature 4]
  ├── geminiService.ts — collect PipelineEvents from finalizeCvData()        [Feature 1 dep]
  └── escapeCollector.ts — fire-and-forget on Doctor flags + warn events     [Feature 2]

Phase D (UI)
  ├── BuildCompletePanel.tsx (4 tabs, auto-shown post-generation)            [Feature 1]
  ├── CVGenerator.tsx — open panel on build success                         [Feature 1]
  └── admin/EscapeReviewPage.tsx — promote patterns to live rules            [Feature 2]
```

---

## Key decisions & non-negotiables

1. **No PII in escape logs.** `escapeCollector.ts` must sanitise before any network call. Patterns are fragments, never full bullets or names.
2. **Gateway is synchronous from the caller's perspective.** `purifiedCompletion` is a drop-in swap for raw `groqChat` — callers just get cleaner text back. No new loading states introduced.
3. **Reconciler is deterministic.** No LLM in the skills reconciler. Fast, predictable, auditable. The synonym map is a maintained static file.
4. **Build Complete panel is additive, not a replacement.** Doctor, Quality, Score pages remain accessible. The panel links to them for users who want depth.
5. **Admin promotes rules; the system does not auto-promote.** Preventing runaway self-modification. A human reviews before any pattern becomes a live rule.
6. **Every AI amendment follows the pipeline — no exceptions.** If a new AI call is added anywhere in the codebase for CV content, it wraps `purifiedCompletion`. This is enforced by making raw `groqChat` / `callGemini` private to the gateway module long-term.

---

## Files created net-new

```
frontend/types/buildReport.ts
frontend/services/purifiedLLMGateway.ts
frontend/services/skillsReconciler.ts
frontend/services/skillsSynonymMap.ts
frontend/services/escapeCollector.ts
frontend/components/BuildCompletePanel.tsx
frontend/components/admin/EscapeReviewPage.tsx
backend/cv-engine-worker/src/handlers/escapes.ts
backend/cv-engine-worker/migrations/040_pipeline_escapes.sql
```

## Files modified

```
frontend/services/cvPurificationPipeline.ts  — export individual passes; return PipelineEvents
frontend/services/cvDoctorService.ts         — route completions through gateway
frontend/services/geminiService.ts           — collect PipelineEvents; call reconcileSkills()
frontend/components/CVGenerator.tsx          — open BuildCompletePanel on success
frontend/components/CVDoctorPanel.tsx        — call recordEscape() on each flag
frontend/components/ProfileForm.tsx          — audit + complete purifyProfile() coverage
backend/cv-engine-worker/src/router.ts       — register /api/pipeline/escapes routes
```
