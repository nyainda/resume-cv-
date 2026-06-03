---
name: CV examples pool diversity
description: The cv_examples D1 table and client now track narrative_angle + voice_name for pool diversity enforcement. Migration 017 needed for CF deploy.
---

# CV Examples Pool Diversity

## Risk identified
cv_examples feedback loop: generating from own stored examples → accidental fine-tuning → every CV converges toward CV #1's style by month 6.

## Safeguards implemented

### Client (cvExamplesClient.ts)
- `NarrativeAngle` type exported here (avoids circular dep with geminiService)
- `CVExampleStructure` interface: added `narrativeAngle?` and `voiceName?`
- `storeCVExample()`: now accepts `narrativeAngle` and `voiceName` params, sends both to worker
- `buildReferenceBlock()`: language changed from "mirror" → "CALIBRATION TARGETS"; angle note added

### Backend (needs CF deploy)
Migration: `backend/cv-engine-worker/migrations/017_cv_examples_variance.sql`
- `ALTER TABLE cv_examples ADD COLUMN IF NOT EXISTS narrative_angle TEXT`
- `ALTER TABLE cv_examples ADD COLUMN IF NOT EXISTS voice_name TEXT`
- Indexes: `idx_cv_examples_angle`, `idx_cv_examples_voice`

### Future work (not yet implemented)
"Select most different" logic: when fetching an example for a generation using angle=X, prefer an example that used angle≠X. Requires worker-side query change after migration is deployed.

## Key rule
Examples store MEASUREMENTS (word counts, bullet counts) only — never text content.
The prompt block explicitly says "NEVER echo example phrasing".
