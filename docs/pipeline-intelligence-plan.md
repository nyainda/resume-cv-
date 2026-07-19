# Pipeline Intelligence — Full Design & Build Plan

> **Status:** Planning — approved for implementation  
> **Scope:** Four interconnected improvements to the CV generation, quality, and Doctor subsystems  
> **North star:** Every AI output is clean before the user sees it. Every fixable problem is fixed automatically. Only what genuinely needs human knowledge reaches the user — and it reaches them in one place, one time.

---

## The Root Problem

The codebase has **good individual tools** that were built independently:

| Tool | Lives in | What it checks | What it auto-fixes |
|---|---|---|---|
| `cvPurificationPipeline.ts` | Frontend service | Banned phrases, voice, metrics, certs | ✓ All (but only called at generation time) |
| `cvFinalGuard.ts` | Frontend service | 7 passes: dedup skills, placeholders, openers, grammar | ✓ All (but returns separate CVData copy — not always applied) |
| `cvDoctorService.ts` | Frontend service | 12 bullet issue types, AI strategic scan | ✗ Only flags — user manually triggers each fix |
| `QualityIssuesPanel.tsx` | Component | Calls final guard, shows results | ✗ Shows issues, user must navigate separately |
| `ScoreMyCVPage.tsx` | Component | ATS keyword match | ✗ Read-only report |

They **conflict** because they run independently on the same CV, produce overlapping findings, and present results in four different places. A user gets contradictory "passive voice" flags from Doctor and Quality Check simultaneously. Neither tool injects the fix — the user is left to reconcile manually.

The fix is not to remove these tools. It is to make them all feed from and write to **one engine**, run that engine automatically after every build, and let it fix everything it can before the user ever sees a result.

---

## Feature 1 — Autonomous CV Repair Engine + Build Complete Panel

### Concept

After every CV generation, an **Autonomous Repair Engine (ARE)** runs silently in the background. It orchestrates all existing passes — purification, final guard, Doctor classification — into a single ordered pipeline. Each issue it finds falls into one of four tiers:

```
TIER 0  Silent auto-fix     → just do it, don't bother the user
TIER 1  Shown auto-fix      → do it, show a brief "we fixed X" note
TIER 2  AI auto-fix         → rewrite with AI, apply if confidence ≥ threshold
TIER 3  One-click accept    → user sees the suggestion, one tap to apply
TIER 4  Manual flag         → requires user knowledge we don't have
```

The result is a **Build Complete Panel** that shows the user only what they need to act on. When everything is clean, it's a single green screen. When things need attention, it's a tight action list — not a wall of warnings.

---

### Repair Tier Map

Every issue type from every existing tool is assigned exactly one tier. No issue appears in two places.

#### Tier 0 — Silent auto-fix (no notification)
These are mechanical errors. Fixing them silently is the right call — users don't want to be told we removed an "I" from a bullet.

| Issue | Source | Fix applied |
|---|---|---|
| First-person pronouns (I, my, we) | `cvVoiceFidelity.ts` `stripFirstPersonPronouns` | Strip + re-capitalise next verb |
| Third-person verb on current role (Generates → Generate) | `cvVoiceFidelity.ts` `normaliseCurrentRoleTense` | Verb normalisation map |
| Banned phrases / substitutions | `cvPurificationPipeline.ts` `cleanImportedText` | Regex replace from SUBSTITUTIONS list |
| Placeholder tokens (`[Add metric]`, `XX%`, `{VALUE}`) | `cvFinalGuard.ts` pass 4 | Strip token |
| Double words ("the the") | `cvFinalGuard.ts` pass 5 | Dedup |
| Generic summary openers ("Results-driven", "Dynamic") | `cvFinalGuard.ts` `fixSummaryOpener` | Strip opener |
| Seeking language in summary | `cvFinalGuard.ts` `purgeSummarySeekingLanguage` | Strip phrase |
| Duplicate skills | `cvFinalGuard.ts` `deduplicateSkills` | Keep canonical form |
| AI metadata leaks (Note:, ```markdown, **bold label**) | `cvFinalGuard.ts` pass 6 | Strip |
| Hallucinated numbers | `cvNumberFidelity.ts` `stripUngroundedNumbers` | Strip numeric phrase |

#### Tier 1 — Shown auto-fix (note in Build Complete panel)
These change actual content. Users should see what changed, but they don't need to approve it.

| Issue | Source | Fix applied | Note shown |
|---|---|---|---|
| "Ensuring" virus | `classifyBullets` type `ensuring_virus` | Strip "ensuring X" → restructure clause | "Removed 'ensuring' filler from 2 bullets" |
| Passive role phrases ("responsible for", "tasked with") | `classifyBullets` type `passive_voice` PASSIVE_ROLE_RX | Replace with active form via verb swap map | "Rewrote 3 passive openers" |
| Weak verb at bullet start (helped, assisted, worked) | `classifyBullets` type `weak_verb` | Swap from WEAK_VERB_SET using STRONG_VERB_ALTERNATIVES map | "Upgraded 2 weak verbs" |
| Bare metric opener (bullet starts with "$4M" or "3×") | `classifyBullets` type `bare_metric_opener` | Move metric to proof position, restructure opener | "Restructured 1 metric opener" |
| Duplicate word within bullet | `classifyBullets` type `duplicate_word` | Strip second occurrence | "Fixed repeated word" |

#### Tier 2 — AI auto-fix (apply if confidence ≥ 0.8)
These require an AI call to rewrite. If the rewrite is clean (passes purification) and confidence is high, it is applied silently. If not, it falls through to Tier 3.

| Issue | Source | AI fix | Fallback |
|---|---|---|---|
| Bullet too short (< 7 words) | `classifyBullets` type `too_short` | `rewriteBulletOptions()` → pick best of 3 via internal scorer | Tier 3 |
| Bullet too long (> 35 words) | `classifyBullets` type `too_long` | `rewriteBulletOptions()` → trim + restructure | Tier 3 |
| was/were passive voice (grammatical) | `classifyBullets` type `passive_voice` PASSIVE_RX | Rewrite via `rewriteBulletOptions('passive_voice')` | Tier 3 |
| Tense mismatch | `classifyBullets` type `tense_mismatch` | Rewrite via `rewriteBulletOptions('tense_mismatch')` | Tier 3 |
| AI grammar (cut-off sentences, agreement) | `cvFinalGuard.ts` pass 7 AI grammar | Already calls GROQ_FAST — result applied | — |

> **Confidence scoring for Tier 2:** A rewrite scores ≥ 0.8 if: (a) it passes the same `classifyBullets` scan with zero issues, (b) it passes purification with zero events, and (c) it does not introduce any new numbers not in the source profile.

#### Tier 3 — One-click accept (shown in Build Complete panel)
These are improvements, not errors. The engine has a suggestion ready. The user taps "Apply" or dismisses.

| Issue | What's shown | Action |
|---|---|---|
| Bullet with no metric (no_metric) on a high-impact role | AI-generated quantified alternative via `suggestQuantifiedBullet()` | Apply / Skip |
| Tier 2 fallbacks (AI fix below confidence) | Best rewrite option shown | Apply / Edit / Skip |
| Summary missing impact (from `scanCVForDoctor`) | `suggestedSummary` from AI scan | Apply / Edit / Skip |
| Skills reconciliation result | Skills added/dropped from JD scan | Confirm list / Adjust |

#### Tier 4 — Manual flag (shown in Build Complete panel, user must act)
These require information only the user has.

| Issue | Why it's manual |
|---|---|
| Role gap > 3 months with no explanation | We can't invent a reason |
| Cert not evidenced in experience | User must add evidence or remove the cert |
| Seniority incoherence (title vs bullet content mismatch) | Judgment call |
| Bullet that became empty after purification | Source content was entirely banned phrases — needs rewrite |
| Third-person name usage ("John led a team") | Ambiguous — could be client name or wrong-person error |

---

### The Unified Engine — `autoRepairEngine.ts`

This is a new orchestrator. It calls existing services **in the correct order** and assigns their findings to tiers. It replaces the uncoordinated individual calls scattered across CVGenerator, CVDoctorPanel, and QualityIssuesPanel.

```typescript
// frontend/services/autoRepairEngine.ts

export interface RepairResult {
  cv: CVData;                     // the repaired CV — ready to inject
  report: CVBuildReport;          // structured report for the panel
  appliedCount: number;           // tier 0 + tier 1 + tier 2 fixes applied
  reviewItems: ReviewItem[];      // tier 3 — one-click suggestions
  manualFlags: ManualFlag[];      // tier 4 — needs user
}

export interface ReviewItem {
  id: string;
  location: BulletLocation;       // { roleIndex, bulletIndex } or 'summary'
  issueType: string;
  original: string;
  suggested: string;
  confidence: number;
  applied: boolean;               // user tapped Apply
}

export interface ManualFlag {
  id: string;
  location: BulletLocation | 'cert' | 'gap';
  issueType: string;
  description: string;            // human-readable, non-technical
  ctaLabel: string;               // "Add evidence →" | "Remove cert →" | "Fill gap →"
  ctaAction: 'edit_profile' | 'edit_bullet' | 'remove_cert';
}

export async function runAutoRepair(
  cv: CVData,
  profile: UserProfile,
  jobDescription?: string
): Promise<RepairResult>
```

**Execution order inside `runAutoRepair`:**

```
1. runFinalCVGuard(cv)
     → applies tier 0 passes (dedup, placeholders, openers, grammar)
     → returns new CVData + fix log

2. purifyCV(cv, profile)  [from cvPurificationPipeline]
     → applies tier 0 passes (banned phrases, voice, metrics)
     → returns new CVData + PurificationLog[]

3. classifyBullets(cv)  [from cvDoctorService]
     → returns BulletAnnotation[] — issue type per bullet

4. applyTier1Fixes(cv, annotations)  [new — deterministic rewrites]
     → WEAK_VERB_ALTERNATIVES map, PASSIVE_ROLE rewrites, ensuring-virus strip
     → returns new CVData + Tier1Event[]

5. runTier2AIFixes(cv, annotations, profile)  [new — parallel AI rewrites for short/long/passive]
     → rewriteBulletOptions() called in parallel for flagged bullets
     → confidence-score each result
     → apply if ≥ 0.8, push rest to ReviewItems (tier 3)

6. reconcileSkills(cv.skills, jdSkills, profile)  [Feature 3 — new]
     → returns ReconciledSkills, updates cv.skills

7. scoreAtsCoverage(cv, jobDescription)  [existing]
     → returns ATS score + missing keywords

8. collectManualFlags(cv, profile, annotations)  [new]
     → gaps, ungrounded certs, empty-after-purification bullets

9. build CVBuildReport from all events
10. return { cv: finalCV, report, reviewItems, manualFlags }
```

---

### Build Complete Panel — `BuildCompletePanel.tsx`

Opens automatically when `runAutoRepair` completes. Replaces the ad-hoc opening of CVCompareModal / QualityIssuesPanel.

```
┌─────────────────────────────────────────────────────────────────┐
│  ✓ CV ready  ·  Fixed 14 automatically  ·  2 to review  ·  [×] │
├───────────────┬────────────┬─────────────┬─────────────────────┤
│  🔧 Repaired  │ ⚡ Review  │  🎯 ATS     │  ✦ Skills          │
├───────────────┴────────────┴─────────────┴─────────────────────┤
│                                                                 │
│  REPAIRED TAB (tier 0 + 1 + 2 applied fixes, grouped)         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Voice & tense      ✓ 4 first-person pronouns removed    │  │
│  │                    ✓ 2 passive role phrases rewritten    │  │
│  │ Language           ✓ 3 banned phrases substituted        │  │
│  │                    ✓ 1 "ensuring" filler removed         │  │
│  │ Verbs              ✓ 2 weak verbs upgraded               │  │
│  │ Skills             ✓ Deduped (kept "Python" not "Python  │  │
│  │                      Programming")                        │  │
│  │ Metrics            ✓ All numbers grounded in your data   │  │
│  └──────────────────────────────────────────────────────────┘  │
│  [See full diff →]    links to CVCompareModal                  │
│                                                                 │
│  REVIEW TAB (tier 3 — one-click items)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 📝 Senior Engineer · Bullet 2                            │  │
│  │ NOW: "Led infrastructure work across 3 regions"          │  │
│  │ SUG: "Reduced deployment time 40% across 3 regions by   │  │
│  │      migrating infrastructure to Terraform IaC"          │  │
│  │ [Apply] [Edit] [Skip]                                    │  │
│  │ ─────────────────────────────────────────────────────── │  │
│  │ 📝 Summary rewrite ready                                 │  │
│  │ [Apply] [Edit] [Skip]                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ATS TAB                                                        │
│  87% match  ████████████░░  Missing: "CI/CD", "Agile"         │
│  [Add missing keywords to JD →]                                │
│                                                                 │
│  SKILLS TAB                                                     │
│  Kept (yours):    Python, React, PostgreSQL…          8        │
│  Added from JD:   Kubernetes, CI/CD (in your bullets) 3        │
│  Dropped:         Six Sigma, SAP (not in your bullets) 4       │
│  [Adjust →]                                                    │
│                                                                 │
│  MANUAL FLAG (if any — shown as red banner at bottom)          │
│  ⚠ "Certified Scrum Master" not evidenced in your roles.       │
│    [Add evidence →]  [Remove cert →]                           │
└─────────────────────────────────────────────────────────────────┘
```

**When the panel is clean** (no tier 3/4 items and few tier 1 events), it collapses to a single green bar:
```
┌────────────────────────────────────────────────────────┐
│  ✓ All clear — 9 issues fixed automatically  ·  [View] │
└────────────────────────────────────────────────────────┘
```

**How fixes are applied to the CV:**
- The `cv` returned by `runAutoRepair` is the already-repaired version
- `CVGenerator.tsx` calls `onUpdateCV(result.cv)` immediately — the CV in state is always the clean version
- Tier 3 "Apply" button calls `onUpdateCV` with the accepted suggestion patched in
- The "old" unrepaired CV is kept in `compareBase` state for the CVCompareModal diff view

---

### Unifying the existing tools

The existing tools stay as deep-dive views. They become consumers of the same engine's output rather than running independent scans:

| Tool | Today | After |
|---|---|---|
| `CVDoctorPanel` | Runs its own `classifyBullets` + `scanCVForDoctor` independently | Shows annotations already produced by ARE; "Deep Scan" button triggers `scanCVForDoctor` on demand |
| `QualityIssuesPanel` | Calls `runFinalCVGuard` independently | Reads from the same `FinalGuardResult` produced by ARE; no second pass |
| `ScoreMyCVPage` | Calls `scoreAtsCoverage` independently | Reads from the ATS result in `CVBuildReport`; no second pass |

This eliminates the conflict: one scan, one set of results, three views into the same data.

---

### New files (Feature 1)

```
frontend/types/buildReport.ts               — CVBuildReport, ReviewItem, ManualFlag, PipelineEvent
frontend/services/autoRepairEngine.ts       — orchestrator (runAutoRepair)
frontend/services/tier1Fixes.ts             — deterministic Tier 1 rewrites (verb swap, passive → active, ensuring-strip)
frontend/services/verbAlternatives.ts       — WEAK_VERB_ALTERNATIVES map, PASSIVE_ROLE_REWRITES
frontend/components/BuildCompletePanel.tsx  — 4-tab panel, auto-shown post-generation
```

### Modified files (Feature 1)

```
frontend/services/cvPurificationPipeline.ts — export individual passes; return PurificationLog[] alongside result
frontend/services/cvFinalGuard.ts           — export FinalGuardResult so ARE can consume it
frontend/services/cvDoctorService.ts        — export classifyBullets result from ARE; remove duplicate scan in panel
frontend/components/CVGenerator.tsx         — call runAutoRepair on success; open BuildCompletePanel; pass result to onUpdateCV
frontend/components/CVDoctorPanel.tsx       — accept pre-computed annotations prop; only trigger AI scan on demand
frontend/components/QualityIssuesPanel.tsx  — accept FinalGuardResult prop; no independent guard call
frontend/components/ScoreMyCVPage.tsx       — accept CVBuildReport.atsScore as optional prop; fall back to own scan
```

---

## Feature 2 — Pipeline Learning Loop

### What it is
Whatever escapes the pipeline and gets flagged later (by Doctor, by the user editing manually) is evidence of a gap in the rules. We collect those signals, aggregate them, and let admins promote new patterns into the live purification rules. The system improves over time rather than staying static.

### Signal sources

| Signal | When it fires | What we learn |
|---|---|---|
| ARE finds a Tier 1/2 issue | Every build | A pattern that `cvPurificationPipeline` missed pre-generation |
| User taps "Skip" on a Tier 3 suggestion | In Build Complete panel | AI rewrite wasn't good enough — the issue type + role context |
| User manually edits a bullet in the CV editor | Post-generation | AI output was wrong; the category of issue is inferred from the original annotation |
| Admin marks a promoted pattern "not effective" | Admin review page | The rule should be removed or narrowed |

### Data flow

```
ARE runs → emits PipelineEvent[] (tier 1/2 fixes applied)
User skips a suggestion → emit escape signal
User manually edits → emit escape signal
      │
      ▼
escapeCollector.ts   ← thin, non-blocking, IDB-queued
      │  (flush every 10 events or on app idle)
      ▼
CF Worker: POST /api/pipeline/escapes
      │
      ▼
D1: pipeline_escapes table
      │
      ▼
Admin: EscapeReviewPage.tsx  ← aggregated patterns, frequency, examples
      │  admin clicks "Promote"
      ▼
CF KV: banned_phrases / verb_alternatives lists
      │  invalidateKVCache() called
      ▼
All future ARE runs pick up the improved rules
```

### D1 schema — migration 040

```sql
CREATE TABLE IF NOT EXISTS pipeline_escapes (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL,
  escape_type TEXT    NOT NULL,   -- 'banned_phrase'|'weak_verb'|'passive'|'ai_language'|'metric'|'cert'
  pattern     TEXT    NOT NULL,   -- sanitised fragment (no names/companies/numbers)
  source      TEXT    NOT NULL,   -- 'tier1_fix'|'tier2_fix'|'user_skip'|'user_edit'|'build_warn'
  promoted    INTEGER DEFAULT 0,  -- 1 = admin promoted to live rules
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_pe_type ON pipeline_escapes(escape_type, promoted);
CREATE INDEX idx_pe_user ON pipeline_escapes(user_id);
```

### Privacy rule — non-negotiable
`escapeCollector.ts` strips ALL personal data before any network write. The stored `pattern` is a **sanitised structural fragment** — numbers replaced with `[NUM]`, proper nouns with `[NAME]`, companies with `[ORG]`. No CV text leaves the client in raw form via this path.

### New files (Feature 2)

```
frontend/services/escapeCollector.ts                        — recordEscape(), IDB queue, PII strip, flush to worker
backend/cv-engine-worker/src/handlers/escapes.ts           — POST /api/pipeline/escapes, GET /api/admin/escapes
backend/cv-engine-worker/migrations/040_pipeline_escapes.sql
frontend/components/admin/EscapeReviewPage.tsx              — aggregated table, "Promote" button
```

### Modified files (Feature 2)

```
frontend/components/BuildCompletePanel.tsx     — call recordEscape() on user "Skip" events
frontend/components/CVGenerator.tsx            — call recordEscape() on manual bullet edit
backend/cv-engine-worker/src/data.ts           — promoteEscapeToRule() writes to KV, calls invalidateKVCache()
backend/cv-engine-worker/src/router.ts         — register /api/pipeline/escapes routes
```

---

## Feature 3 — Smart Skills Reconciliation

### The current problem
When a JD is scanned, `deduplicateSkills()` does string-level deduplication — but semantic clashes remain. Skills from the JD that aren't evidenced in the user's bullets are injected anyway. Backend `purify.ts` eventually caps and strips generics, but by then the generation prompt has already been poisoned with irrelevant skills, and the output reads as two different people's profiles.

### The fix — `skillsReconciler.ts`

Runs in Step 6 of `runAutoRepair`, **before** the current CV skills list is finalised. Fully deterministic — no LLM needed.

```typescript
// frontend/services/skillsReconciler.ts

export interface ReconciledSkills {
  finalSkills: string[];      // what goes into cv.skills (max 15, ranked)
  native: string[];           // from user profile, evidenced
  addedFromJD: string[];      // from JD, evidenced in bullets
  dropped: string[];          // from JD, not evidenced — stripped
  promoted: string[];         // profile skill that JD confirms (rank boosted)
}

export function reconcileSkills(
  profileSkills: string[],
  jdSkills: string[],
  experienceBullets: string[],
  targetSeniority: string
): ReconciledSkills
```

**5 passes (deterministic):**

1. **Normalise** — lowercase, trim, expand abbreviations (`JS → JavaScript`, `k8s → Kubernetes`)
2. **Semantic dedup** — cluster using edit distance + `SKILL_SYNONYMS` map (`"Stakeholder Management"` ≈ `"Stakeholder Engagement"` → keep the user's own phrasing)
3. **Evidence check** — fuzzy-match each JD skill against the concatenated experience bullets; tag `evidenced` or `ungrounded`
4. **Rank** — user native > JD-evidenced > JD-ungrounded (dropped entirely, never injected)
5. **Voice normalise** — if user writes `"Python"` not `"Python programming"`, rephrase JD's `"Python scripting"` → `"Python"` using the brevity pattern of the user's existing skills

### New files (Feature 3)

```
frontend/services/skillsReconciler.ts    — 5-pass reconciler
frontend/services/skillsSynonymMap.ts    — SKILL_SYNONYMS (50–100 pairs to start), ABBREV_EXPANSIONS
```

### Modified files (Feature 3)

```
frontend/services/autoRepairEngine.ts    — call reconcileSkills() in step 6; attach ReconciledSkills to CVBuildReport
frontend/components/BuildCompletePanel.tsx — Skills tab renders ReconciledSkills
```

---

## Feature 4 — Purified LLM Gateway (All AI Through the Pipeline)

### The current problem

| AI call site | Through purification? |
|---|---|
| `geminiService.ts` → `finalizeCvData()` | ✓ |
| `importPipeline.ts` → `purifyProfile()` | ✓ |
| `cvDoctorService.rewriteBulletOptions()` | ✗ Raw LLM output → user |
| `cvDoctorService.suggestQuantifiedBullet()` | ✗ Raw LLM output → user |
| `cvDoctorService.scanCVForDoctor()` AI suggestions | ✗ |
| `ProfileForm.tsx` LLM generators | Partial |

Doctor can introduce the same banned phrases it's supposed to detect. A user who clicks "Rewrite" in Doctor can end up with a bullet that says "I spearheaded…".

### The fix — `purifiedLLMGateway.ts`

```typescript
// frontend/services/purifiedLLMGateway.ts

export async function purifiedCompletion(
  callFn: () => Promise<string>,
  context: { profileMetrics: string[]; skills: string[]; currentRole?: boolean }
): Promise<{ text: string; events: PipelineEvent[] }>
```

Internally:
1. Calls `callFn()` — the raw LLM call
2. Runs output through exported individual passes from `cvPurificationPipeline`:
   - `stripBannedPhrases(text)` 
   - `applyVoiceFidelity(text, context)`
   - `checkMetricFidelity(text, context.profileMetrics)`
3. Scores confidence (any events fired = lower confidence)
4. Returns `{ text: cleaned, events: whatWasChanged }`

Any `events` emitted here feed directly into `escapeCollector` (Feature 2): the LLM produced something that needed cleaning, which is exactly the escape signal we want.

### Modified files (Feature 4)

```
frontend/services/purifiedLLMGateway.ts       — new gateway (purifiedCompletion)
frontend/services/cvPurificationPipeline.ts   — export stripBannedPhrases, applyVoiceFidelity, checkMetricFidelity as standalone fns
frontend/services/cvDoctorService.ts          — wrap rewriteBulletOptions, suggestQuantifiedBullet, scanCVForDoctor through gateway
frontend/components/ProfileForm.tsx            — audit: ensure purifyProfile() called on all LLM generator exit paths
```

---

## How the Four Features Connect

```
User generates CV
      │
      ▼
geminiService.ts  (generation, existing)
      │
      ▼
autoRepairEngine.ts  ◄──── Feature 1 (orchestrator)
  │                                │
  ├─ purifyCV()                    │  PurificationLog[] → PipelineEvent[]
  ├─ runFinalCVGuard()             │  FinalGuardResult → PipelineEvent[]
  ├─ classifyBullets()             │  BulletAnnotation[] → tier assignment
  ├─ applyTier1Fixes()             │  verb map, passive rewrites → Tier1Event[]
  ├─ runTier2AIFixes()             │  → purifiedCompletion()  ◄── Feature 4
  │     └─ rewriteBulletOptions()  │         │
  │                                │         └─ events → escapeCollector  ◄── Feature 2
  ├─ reconcileSkills()             │  ◄── Feature 3
  └─ scoreAtsCoverage()            │
      │
      ▼
RepairResult { cv, report, reviewItems, manualFlags }
      │
      ├─ cv → onUpdateCV(repaired CV)     ← injected immediately
      ├─ report → BuildCompletePanel      ← Feature 1 UI
      └─ escapes → escapeCollector        ← Feature 2

User skips suggestion / manually edits
      │
      ▼
escapeCollector → D1 → admin review → KV update → future builds improved
```

---

## Build Order

```
Phase A — Types + deterministic foundations (no backend, no UI)
  1. frontend/types/buildReport.ts
  2. frontend/services/verbAlternatives.ts   (verb swap maps)
  3. frontend/services/skillsSynonymMap.ts
  4. frontend/services/tier1Fixes.ts
  5. frontend/services/skillsReconciler.ts
  6. Export individual passes from cvPurificationPipeline.ts

Phase B — Gateway (Feature 4)
  7. frontend/services/purifiedLLMGateway.ts
  8. Wire into cvDoctorService.ts (rewrite + suggest functions)
  9. Audit ProfileForm.tsx LLM paths

Phase C — Orchestrator (Feature 1 engine)
  10. frontend/services/autoRepairEngine.ts
  11. Wire into CVGenerator.tsx (call ARE on build success; pass result.cv to onUpdateCV)

Phase D — Backend + learning (Feature 2)
  12. migration 040_pipeline_escapes.sql
  13. backend handler: escapes.ts
  14. frontend/services/escapeCollector.ts
  15. Wire escapeCollector into ARE events + user skip/edit actions

Phase E — UI (Feature 1 panel + admin)
  16. frontend/components/BuildCompletePanel.tsx
  17. Wire BuildCompletePanel into CVGenerator.tsx (auto-open)
  18. Update CVDoctorPanel / QualityIssuesPanel / ScoreMyCVPage to consume shared report
  19. frontend/components/admin/EscapeReviewPage.tsx
```

---

## Non-negotiables

1. **The repaired CV is applied immediately.** `onUpdateCV(result.cv)` is called before the panel opens. The user is never looking at an un-repaired CV.
2. **One scan per build.** No tool re-runs its own independent scan after ARE has run. All panels consume the ARE output.
3. **Tier 0 is silent.** Never ask the user to confirm removal of a first-person pronoun.
4. **No PII in escape logs.** Pattern fragments only, all personal data stripped client-side before any network write.
5. **Gateway is synchronous from the caller's perspective.** `purifiedCompletion` is a drop-in swap — callers get cleaner text, no new loading states.
6. **Reconciler is deterministic.** No LLM in skills reconciliation. Fast, predictable, auditable.
7. **Admin promotes rules; system never auto-promotes.** Human review required before any pattern becomes a live rule.
