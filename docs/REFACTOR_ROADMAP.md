# ProCV — Full Codebase Refactor Roadmap

**Purpose:** Every file over ~400 lines that has more than one clear responsibility is listed here with a specific splitting plan.  
**Rule:** Move code only — never rewrite logic. Same names, same behaviour. Test the app after each task.  
**Status key:** 🔴 Critical · 🟠 High · 🟡 Medium

---

## Size Overview (files needing attention)

| Lines | File | Category |
|-------|------|----------|
| 5,294 | `frontend/services/geminiService.ts` | 🔴 Services |
| 3,063 | `frontend/services/cvPurificationPipeline.ts` | 🔴 Services |
| 2,988 | `frontend/services/pdfService.ts` | 🔴 Services |
| 2,867 | `frontend/App.tsx` | 🔴 Root |
| 2,687 | `frontend/components/CVGenerator.tsx` | 🔴 Components |
| 1,836 | `frontend/services/cvEngineClient.ts` | 🟠 Services |
| 1,518 | `frontend/components/LandingPage.tsx` | 🟠 Components |
| 1,455 | `frontend/components/ProfileForm.tsx` | 🟠 Components |
| 1,336 | `frontend/components/QualityIssuesPanel.tsx` | 🟠 Components |
| 1,069 | `frontend/components/AdminCVEnginePage.tsx` | 🟠 Components |
| 986 | `frontend/components/CoverLetterPreview.tsx` | 🟠 Components |
| 970 | `frontend/components/JobAnalysis.tsx` | 🟡 Components |
| 924 | `backend/cv-engine-worker/src/handlers/purify.ts` | 🟡 Worker |
| 895 | `frontend/components/templates/TemplateCustomGenerated.tsx` | 🟡 Templates |
| 881 | `frontend/components/CVToolkit.tsx` | 🟡 Components |
| 880 | `frontend/components/templates/engine/TemplateV2.tsx` | 🟡 Templates |
| 837 | `frontend/services/cvPromptHelpers.ts` | 🟡 Services |
| 809 | `frontend/types.ts` | 🟡 Types |
| 804 | `backend/cv-engine-worker/src/handlers/llm.ts` | 🟡 Worker |
| 771 | `frontend/components/WordImportPanel.tsx` | 🟡 Components |
| 730 | `frontend/components/PortalScanner.tsx` | 🟡 Components |
| 716 | `frontend/components/Tracker.tsx` | 🟡 Components |
| 674 | `frontend/components/CVDoctorPanel.tsx` | 🟡 Components |
| 651 | `backend/cv-engine-worker/src/handlers/admin.ts` | 🟡 Worker |
| 639 | `frontend/services/cvQualityGate.ts` | 🟡 Services |
| 638 | `frontend/services/aiInlineFix.ts` | 🟡 Services |
| 633 | `frontend/services/groqService.ts` | 🟡 Services |

---

## 🔴 CRITICAL — Split First

---

### FILE 1 — `frontend/services/geminiService.ts` (5,294 lines)
**What it does:** Everything AI. Market research, CV generation, prompt building, humanisation, banned phrase filtering, quality passes, cache, provider routing, Gemini client.  
**Problem:** 9 unrelated responsibilities. A change to prompt wording touches the same file as a change to the Gemini API client.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `services/generation/narrativeAngle.ts` | Angle history, `selectFreshAngle`, `recordAngleUsed` | 80 |
| `services/generation/cvGenerationCache.ts` | In-memory CV cache, `cvCacheKey`, `cvCacheGet`, `cvCacheSet`, `invalidateCVCache` | 80 |
| `services/generation/preGenerationPipeline.ts` | `detectCurrency`, `detectSeniority`, `detectScenario`, `detectDomainPivot`, `buildPivotBlock`, `buildScenarioBlock`, `detectMarket`, `detectGaps`, `buildGapContext`, `buildMetricsCeiling` | 300 |
| `services/generation/modePromptBuilder.ts` | `buildModePromptBlock` — the giant prompt string builder for honest/boosted/aggressive | 250 |
| `services/generation/cvValidator.ts` | `runGroqValidator`, `runHumanizationAudit`, `applyBannedPhraseFilter`, `buildMustFixLeakBlock` | 400 |
| `services/generation/qualityPasses.ts` | `runQualityPolishPasses` and all sub-passes | 300 |
| `services/generation/marketResearchPrompts.ts` | Market research prompt building + Gemini grounding call | 200 |
| `services/generation/geminiClient.ts` | `getGeminiClient`, `loadRules`, and raw Gemini API calls | 200 |
| `services/geminiService.ts` *(remains)* | `generateCV`, `runFreeProviderChain`, top-level orchestration — imports from above | ~600 |

---

### FILE 2 — `frontend/services/cvPurificationPipeline.ts` (3,063 lines)
**What it does:** Post-generation text cleaning pipeline. Removes duplicates, fixes tense, jitters round numbers, detects phrase repetition, reverts corrupted metrics, and more.  
**Problem:** 8 independent text-transform stages bundled into one file. Each stage is testable alone.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `services/purification/duplicateWords.ts` | `removeDuplicateWords`, `cleanImportedText`, `cleanImportedTextRemote` | 120 |
| `services/purification/phraseRepetition.ts` | `detectPhraseRepetition` | 80 |
| `services/purification/roundNumbers.ts` | `detectRoundNumberSaturation`, `jitterRoundNumbers` | 120 |
| `services/purification/tenseConsistency.ts` | `enforceTenseConsistency`, `detectTenseMismatch`, `flipLeadingVerb`, `flipMidBulletVerb` | 200 |
| `services/purification/metricGuard.ts` | `hasCorruptedMetric`, `revertCorruptedMetrics` | 100 |
| `services/purification/bannedPhrases.ts` | Banned phrase tables + substitution engine | 400 |
| `services/purification/verbTenseMap.ts` | Verb pair tables (present ↔ past) | 150 |
| `services/cvPurificationPipeline.ts` *(remains)* | `purifyCV` orchestrator — imports from above | ~200 |

---

### FILE 3 — `frontend/services/pdfService.ts` (2,988 lines)
**What it does:** Renders every CV template to a PDF via html2canvas. Contains colour helpers, per-template page sizing calculations, font embedding logic, and the public download API.  
**Problem:** Template-specific layout code for 35 templates is bundled with generic PDF infrastructure.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `services/pdf/pdfInfrastructure.ts` | `hexToRgb`, page size helpers, margin helpers, jsPDF setup | 200 |
| `services/pdf/fontEmbedder.ts` | Base64 font encoding, embed cache, `prewarmFontEmbedCache` | 300 |
| `services/pdf/templateRenderer.ts` | html2canvas capture, template-to-canvas mapping | 400 |
| `services/pdf/coverLetterPdf.ts` | `getCoverLetterAsPDFBytes`, `downloadCoverLetterAsPDF` | 150 |
| `services/pdfService.ts` *(remains)* | `getCVAsPDFBytes`, `downloadCVAsPDF` — thin orchestrator | ~150 |

---

### FILE 4 — `frontend/App.tsx` (2,867 lines)
**What it does:** Root application shell. Auth, profile management, CV management, navigation, boot effects, full navbar JSX, 14-view router JSX — all in one file.  
**See:** `docs/APP_REFACTOR.md` for the detailed 8-task plan already written.

**Summary of splits:**

| New file | Responsibility |
|----------|---------------|
| `hooks/useBootEffects.ts` | Prewarm, prefetch, IDB migration, GC |
| `hooks/useAppNavigation.ts` | `currentView`, hash routing, nav items |
| `hooks/useAuthSession.ts` | Auth modal mode, session sync, cross-tab guard |
| `hooks/useJsonImport.ts` + `components/JsonImportDialog.tsx` | JSON import confirmation flow |
| `hooks/useCVManager.ts` | All CV/cover-letter/tracker save-delete-load handlers |
| `hooks/useProfileManager.ts` | Profile CRUD + restore flows |
| `components/AppNavbar.tsx` | Full top-bar JSX |
| `components/AppViewRouter.tsx` | 14-view content router |

---

### FILE 5 — `frontend/components/CVGenerator.tsx` (2,687 lines)
**What it does:** The main CV generation UI. State, sidebar panel, generation form, ATS gap detection, quality panel toggle, provider status, cover letter generation, doctor panel, LinkedIn panel.  
**Problem:** UI, business logic, and side-panel management all mixed together.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `hooks/useCVGeneratorState.ts` | All useState/useLocalStorage declarations (50+ state items) | 200 |
| `hooks/useCVGeneratorHandlers.ts` | `handleAutoOptimize`, `handleGenerate`, `handleReset` and other event handlers | 400 |
| `components/generator/GeneratorForm.tsx` | The left-side job/mode/purpose input form | 300 |
| `components/generator/GeneratorSidebar.tsx` | Right-side CV preview + template picker | 200 |
| `components/generator/ProviderStatusBar.tsx` | The live AI provider status bar at the top | 100 |
| `components/CVGenerator.tsx` *(remains)* | Composition — imports and renders the above | ~300 |

---

## 🟠 HIGH — Split After Critical

---

### FILE 6 — `frontend/services/cvEngineClient.ts` (1,836 lines)
**What it does:** Client for the Cloudflare Worker. Circuit breaker, banned phrases/verbs API, brief building, model warm-up, AND a full admin API client (dashboard, users, auth logs, DB browser, user detail).  
**Problem:** Admin API has no business being in the same file as the warm-up and CV generation client.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `services/cvEngineAdminClient.ts` | All admin API functions (`getAdminDashboardStats`, `listAdminUsers`, `updateUserPlan`, `revokeUserSessions`, `listAuthLogs`, `fetchDbBrowse`, `fetchUserDetail`, `reportLeaks`, etc.) | 400 |
| `services/cvEnginePrewarm.ts` | `prewarmCVEngineModels`, `rewarmCVEngineModels`, `warmCVEngine`, `prewarmOne`, account tier logic | 300 |
| `services/cvEngineClient.ts` *(remains)* | Circuit breaker, banned phrases/verbs fetch, brief building, validation | ~500 |

---

### FILE 7 — `frontend/components/LandingPage.tsx` (1,518 lines)
**What it does:** Marketing landing page. Hero section, features grid, testimonials, pricing, FAQ, footer.  
**Problem:** Every section is a wall of JSX in one component with no separation.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `components/landing/LandingHero.tsx` | Hero headline, CTA, illustration | 150 |
| `components/landing/LandingFeatures.tsx` | Features grid / cards | 200 |
| `components/landing/LandingTestimonials.tsx` | Social proof / testimonials | 150 |
| `components/landing/LandingPricing.tsx` | Pricing table / tiers | 200 |
| `components/landing/LandingFAQ.tsx` | FAQ accordion | 150 |
| `components/landing/LandingFooter.tsx` | Footer links | 100 |
| `components/LandingPage.tsx` *(remains)* | Assembles sections, scroll handlers | ~150 |

---

### FILE 8 — `frontend/components/ProfileForm.tsx` (1,455 lines)
**What it does:** The full profile editing form — personal info, work experience, education, skills, projects, certifications, languages, references.  
**Problem:** Each form section is a self-contained sub-form that never needs to know about the others.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `components/profileForm/PersonalInfoSection.tsx` | Name, email, phone, location, links | 150 |
| `components/profileForm/WorkExperienceSection.tsx` | Work history add/edit/reorder | 250 |
| `components/profileForm/EducationSection.tsx` | Education entries | 150 |
| `components/profileForm/SkillsSection.tsx` | Skills tags + categories | 120 |
| `components/profileForm/ProjectsSection.tsx` | Projects + GitHub import | 150 |
| `components/profileForm/ExtraSection.tsx` | Certifications, languages, references, custom sections | 200 |
| `components/ProfileForm.tsx` *(remains)* | Tab/accordion layout that renders sections | ~150 |

---

### FILE 9 — `frontend/components/QualityIssuesPanel.tsx` (1,336 lines)
**What it does:** Displays CV quality scores. Contains `DimensionalScoreCard`, `AchievementDensityBar`, and the main `QualityIssuesPanel` with issue lists and fix buttons.  
**Problem:** Three clearly named sub-components are defined in the same file.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `components/quality/DimensionalScoreCard.tsx` | Radar/card showing 6 quality dimensions | 150 |
| `components/quality/AchievementDensityBar.tsx` | Density bar visualisation | 80 |
| `components/quality/IssueRow.tsx` | Single issue row with fix/dismiss actions | 100 |
| `components/QualityIssuesPanel.tsx` *(remains)* | Panel shell + issue list using above | ~400 |

---

### FILE 10 — `frontend/components/CoverLetterPreview.tsx` (986 lines)
**What it does:** Cover letter live preview. Includes letter formatter, 5 template layouts, thumbnail, letter header, letter body, word count bar, HR rule checker, and download overlay.  
**Problem:** Templates, a rules engine, and an overlay are co-located with the main preview.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `components/coverLetter/CoverLetterTemplates.tsx` | 5 letter layout templates | 250 |
| `components/coverLetter/CoverLetterRulesPanel.tsx` | HR rule checker + issue list | 120 |
| `components/coverLetter/CoverLetterWordCount.tsx` | Word count bar | 60 |
| `components/CoverLetterPreview.tsx` *(remains)* | Main preview shell + download logic | ~300 |

---

### FILE 11 — `frontend/components/AdminCVEnginePage.tsx` (1,069 lines)
**What it does:** Admin dashboard for the CV engine. Multiple tabs: banned phrases, verb pools, pipeline comparison, voice testing.  
**Problem:** Each tab is complex enough to be its own component.

**Split into:**

| New file | Responsibility | ~Lines |
|----------|---------------|--------|
| `components/admin/BannedPhrasesTab.tsx` | Browse/add/remove banned phrases | 250 |
| `components/admin/VerbPoolsTab.tsx` | Verb pool viewer + editor | 200 |
| `components/admin/PipelineCompareTab.tsx` | Worker vs Groq comparison tool | 200 |
| `components/AdminCVEnginePage.tsx` *(remains)* | Tab shell + shared state | ~200 |

---

## 🟡 MEDIUM — Split When Time Allows

---

### FILE 12 — `frontend/services/cvPromptHelpers.ts` (837 lines)
**What it does:** Field detection, locked number values, prompt anchor blocks, pronoun fixes, field history.  
**3 separate concerns** that happen to share a file.

**Split into:**
- `services/prompts/fieldDetection.ts` — `detectField`, `detectFieldWithSource`, title-to-field map (~200 lines)
- `services/prompts/lockedValues.ts` — `lockRealNumbers`, `LockedValues`, number extraction (~200 lines)
- `services/prompts/promptAnchorBuilder.ts` — `buildPromptAnchorBlock`, `getFieldExamples` (~200 lines)
- `services/cvPromptHelpers.ts` *(remains)* — `fixPronouns`, `fixPronounsInCV`, field history (~200 lines)

---

### FILE 13 — `frontend/types.ts` (809 lines)
**What it does:** All TypeScript types and interfaces for the whole app.  
**Problem:** Types for CV data, UI state, auth, storage, and worker responses are all mixed together. Finding a type requires searching the whole file.

**Split into:**
- `types/cv.ts` — `CVData`, `CVExperience`, `CVEducation`, `CVProject`, etc. (~200 lines)
- `types/profile.ts` — `UserProfile`, `UserProfileSlot`, `ProfileColor`, `ProfileSectionKey` (~150 lines)
- `types/ui.ts` — `SavedCV`, `SavedCoverLetter`, `TrackedApplication`, modal/view types (~150 lines)
- `types/api.ts` — Worker response shapes, auth types, slot sync types (~150 lines)
- `types/index.ts` — Re-exports everything from the above (one import point for consumers) (~20 lines)

---

### FILE 14 — `backend/cv-engine-worker/src/handlers/llm.ts` (804 lines)
**What it does:** Worker LLM handlers — legacy proxy, tiered LLM, race LLM, parallel sections, BYOK proxy, account tier.  
**5 independent request handlers** that share no state.

**Split into:**
- `handlers/llmTiered.ts` — `handleTieredLLM` + `TIERED_MODEL_MAP` + constants (~200 lines)
- `handlers/llmRace.ts` — `handleRaceLLM` (~80 lines)
- `handlers/llmParallel.ts` — `handleParallelSections` (~180 lines)
- `handlers/llmProxy.ts` — `handleProxyLLM` (BYOK Claude/Gemini) (~300 lines)
- `handlers/llm.ts` *(remains)* — `handleLLM` (legacy), `handleAccountTier`, imports (~100 lines)

---

### FILE 15 — `backend/cv-engine-worker/src/handlers/purify.ts` (924 lines)
**What it does:** Worker-side CV purification handler + verb/tense helpers + rules endpoint.  
**Problem:** Inline verb tables and tense flip logic duplicates the frontend's `cvPurificationPipeline.ts`.

**Split into:**
- `handlers/purifyRules.ts` — `handleGetRules` + rules data loading (~150 lines)
- `handlers/purifyHelpers.ts` — Verb tables, `_flipLead`, `_flipMid`, `_purifyField` helpers (~300 lines)
- `handlers/purify.ts` *(remains)* — `handlePurifyCv` main handler (~350 lines)

---

### FILE 16 — `frontend/components/CVToolkit.tsx` (881 lines)
**What it does:** Multi-tab toolkit with ATS score, keyword gap analysis, humanization audit, and quality polish.  
**Each tab is independent.**

**Split into:**
- `components/toolkit/AtsScoreTab.tsx` — ATS score + keyword pills (~200 lines)
- `components/toolkit/KeywordGapTab.tsx` — Missing keyword finder (~200 lines)
- `components/toolkit/HumanizationTab.tsx` — AI-ism detector + audit (~200 lines)
- `components/CVToolkit.tsx` *(remains)* — Tab shell + shared state (~200 lines)

---

### FILE 17 — `frontend/components/JobAnalysis.tsx` (970 lines)
**What it does:** Analyses a job description vs the user's CV. Has cache helpers, a history sidebar, and the main analysis display.

**Split into:**
- `components/jobAnalysis/AnalysisCache.ts` — Cache helpers, `loadCachedAnalysis`, `saveToAnalysisHistory` (~100 lines)
- `components/jobAnalysis/AnalysisHistory.tsx` — History sidebar list (~100 lines)
- `components/jobAnalysis/AnalysisDisplay.tsx` — Match scores, keyword sections, suggestions (~400 lines)
- `components/JobAnalysis.tsx` *(remains)* — Orchestration shell (~200 lines)

---

### FILE 18 — `frontend/services/groqService.ts` (633 lines)
**What it does:** Provider health tracking, key helpers, BYOK proxy calls, provider connection test, AI engine tracker, token usage tracker.  
**Problem:** Provider health state management is mixed with key retrieval and proxy calls.

**Split into:**
- `services/provider/providerHealth.ts` — Health state, events, `_recordProviderResult`, `getProviderChainStatus` (~200 lines)
- `services/provider/providerKeys.ts` — `getGeminiApiKey`, `getClaudeApiKey`, `hasAnyLlmKey`, `getSelectedProvider` (~100 lines)
- `services/groqService.ts` *(remains)* — `groqChat`, `runFreeProviderChain`, token tracker, `testProviderConnection` (~300 lines)

---

### FILE 19 — `frontend/services/aiInlineFix.ts` (638 lines)
**What it does:** AI-powered CV fixes — keyword insertion, seniority repair, summary repair. Also defines `parseAuditPath` and `applyFixToCv`.  
**Problem:** Path parsing/patching utilities are pure helpers bundled with AI network calls.

**Split into:**
- `services/fixes/cvPatcher.ts` — `parseAuditPath`, `applyFixToCv`, `getOriginalTextAt` (pure, no network) (~150 lines)
- `services/fixes/cvSummaryRepair.ts` — `repairCvSummaryWithAi`, `buildSummaryRepairPrompt` (~150 lines)
- `services/aiInlineFix.ts` *(remains)* — `fixCvIssueWithAi`, `insertKeywordIntoBullet`, `fixSeniorityIssueWithAi` (~250 lines)

---

### FILE 20 — `frontend/services/cvQualityGate.ts` (639 lines)
**What it does:** Scores summary, experience, skills, and projects sections for quality violations, then repairs them via AI.  
**Scoring and repairing** are two different concerns.

**Split into:**
- `services/quality/cvScorers.ts` — `scoreSummary`, `scoreExperience`, `scoreSkills`, `scoreProjects` (pure scoring, no network) (~350 lines)
- `services/quality/cvRepairers.ts` — `repairSummary`, `repairExperience` (AI repair calls) (~150 lines)
- `services/cvQualityGate.ts` *(remains)* — `runQualityGate`, `consumePreviousViolationsBlock` orchestration (~150 lines)

---

## Suggested Working Order

Work through the files in this priority order. Each group can be done in any internal order.

### Batch A — Services (no UI risk)
1. `cvPurificationPipeline.ts` — pure functions, safe to split anytime
2. `cvPromptHelpers.ts` — pure helpers, no React
3. `types.ts` — rename only, update imports
4. `groqService.ts` (provider split)
5. `aiInlineFix.ts` (patcher split)
6. `cvQualityGate.ts` (scorers split)

### Batch B — Engine client + worker
7. `cvEngineClient.ts` — extract admin client
8. Worker `llm.ts` — split handlers
9. Worker `purify.ts` — split rules + helpers

### Batch C — App.tsx (use `docs/APP_REFACTOR.md`)
10. Tasks 1–8 from the App.tsx plan

### Batch D — Components
11. `CVGenerator.tsx`
12. `ProfileForm.tsx`
13. `QualityIssuesPanel.tsx`
14. `CoverLetterPreview.tsx`
15. `CVToolkit.tsx`
16. `JobAnalysis.tsx`
17. `AdminCVEnginePage.tsx`
18. `LandingPage.tsx`

### Batch E — Large service split
19. `geminiService.ts` — do last (biggest risk, most dependants)
20. `pdfService.ts` — do last (complex internal state)

---

## Target File Size After Refactor

| Area | Before (lines) | After (files) | Avg file size |
|------|---------------|---------------|---------------|
| Services | ~20,000 | ~35 files | ~350 lines |
| Components | ~18,000 | ~50 files | ~250 lines |
| Worker handlers | ~5,000 | ~20 files | ~200 lines |
| Types | 809 | 5 files | ~160 lines |
| **Total** | **~44,000** | **~110 files** | **~290 lines** |
