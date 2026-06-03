---
name: CV variance architecture
description: Changes made to prevent monotony/fingerprinting — verb pool shuffle, forbidden phrase rotation, rhythm constraints, narrative angle, verbosity jitter.
---

# CV Variance Architecture

## Problem
Every quality system added to ProCV narrowed the LLM's output space identically on every generation, causing:
- Verb fingerprint: same 24 verbs in every CV → HR detects pattern
- Rhythm fingerprint: fixed sequence → identical visual mass across all CVs
- Banned phrases: same 30 sent every run → LLM shifts to same alternative
- No story variation: same profile always tells the same story

## What was changed (all in `frontend/services/geminiService.ts`)

### Priority 1 — Verb pool randomisation
- Generation: `shuffleArray(verb_pool).slice(0, 12)` — random 12 per generation
- Enforcement: `shuffleArray(verb_pool.slice(0, 40)).slice(0, 16)` — random 16 per enforcement run
- **Why 12/16 not 24**: Different subset each time = different verb energy; enforcement needs more headroom for cross-role non-repeating replacements

### Priority 2 — Rhythm constraint mode
- Removed fixed sequence from `engineInstruction` (`short → long → medium…`)
- New prompt: "≥1 punchy (≤14w) + ≥1 narrative (≥25w) per role; avoid 3+ consecutive same length"
- `rhythm_drift` issues from voice validator are now SKIPPED (null) in `enforceVoiceConsistency` — not fixed
- Gross imbalance still caught by purification pipeline's `bullet_band_imbalance`

### Priority 3 — Forbidden phrase rotation
- Both `engineInstruction` and `enforceVoiceConsistency`: `shuffleArray(forbidden_phrases).slice(0, 20)`
- Different 20 of 30 phrases each run → LLM's avoidance strategy varies

### Priority 4 — Narrative angle system
- 4 angles: `impact | process | people | growth`
- Selected randomly per generation via `selectNarrativeAngle()`
- Academic CVs always → `impact`
- Angle name logged: `[CV Gen] Narrative angle: impact`
- Stored to cv_examples (with D1 migration 017)
- Injected into `engineInstruction` via `buildNarrativeAngleBlock()`

### Priority 5 — cv_examples pool diversity
- `CVExampleStructure` now has `narrativeAngle?` and `voiceName?` fields
- `storeCVExample()` accepts + sends both to worker
- `buildReferenceBlock()` uses "CALIBRATION TARGETS" language, never "mirror"
- Angle noted in reference block so LLM knows the prior angle was different

### Priority 6 — Verbosity jitter
- `verbosity_level ± random(0.4) - 0.2` applied in `engineInstruction`
- Small variance → big effect on output density feel

## `shuffleArray` helper
Fisher-Yates, always returns new array, never mutates. Defined in `geminiService.ts` after imports.

## D1 migration needed for Cloudflare deploy
`backend/cv-engine-worker/migrations/017_cv_examples_variance.sql`
- Adds `narrative_angle TEXT` and `voice_name TEXT` columns to `cv_examples`
- Adds indexes for pool diversity queries
- **Requires CF token** — ask user before deploying

**Why:** Worker gracefully ignores unknown JSON keys until migration runs, so client-side changes are safe to ship immediately.
