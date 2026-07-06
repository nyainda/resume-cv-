---
name: Import pipeline — AI-first refactor
description: importPipeline.ts rewritten to delegate all text parsing to AI (Workers AI / BYOK). Heuristic Stage 1 deleted. purifyProfile() rule.
---

## Rule
All import paths must call `purifyProfile()` on the output, no exceptions.

## Architecture after refactor
- **Text-based imports** (PDF text layer, DOCX, pasted text): `runImportPipeline(text, format)` → `parseWordTextToProfile(text)` → `purifyProfile(profile)`
- **Vision imports** (scanned PDF, image): `generateProfileFromFileWithGemini/Claude()` → caller must wrap with `purifyProfile()` immediately
- **JSON imports**: `runImportPipeline(profile, 'json')` → `purifyProfile(profile)` (still sanitised)

## What was deleted
- `heuristicParse()` — 900-line regex Stage 1
- `aiVerifyImport()` — 200-line AI patch Stage 2
- All heuristic section helpers (`parseExperienceSection`, `parseSummarySection`, etc.)
- `frontend/services/__tests__/importPipeline.test.ts` — tested the deleted heuristic

## What was kept / where
- `classifyImportedRoles()` — still in importPipeline.ts (field/track detection)
- `queueUnknownRoles()` — still in importPipeline.ts (fire-and-forget ontology)
- `ImportResult`, `OntologyResult`, `RunImportPipelineOpts` — interfaces preserved for callers
- `parseWordTextToProfile()` — lives in `wordImportService.ts`; uses Workers AI → Claude → Gemini

## purifyProfile call sites (must stay complete)
1. `runImportPipeline` → called inline after `parseWordTextToProfile`
2. `App.tsx` vision paths (scanned PDF, image) → wraps `generateProfileFromFileWithGemini`
3. `ProfileForm.tsx` vision paths → wraps `generateProfileFromFileClaude/Gemini`
4. `OnboardingWizard.tsx` uses `parseWordTextToProfile` directly — check if it calls purifyProfile or goes through handleWordProfileImported (which doesn't purify — handleWordProfileImported trusts callers)

**Why:** purifyProfile strips forbidden phrases / formatting artefacts from AI output. Without it, banned phrases leak into the profile and then into generated CVs.
