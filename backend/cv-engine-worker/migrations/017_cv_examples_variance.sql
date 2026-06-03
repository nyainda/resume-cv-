-- Phase: CV Examples — Variance Metadata
--
-- Adds pool diversity fields to cv_examples so the worker can:
--   1. Detect when the example pool is skewed toward one narrative angle or voice.
--   2. Expose a "select most different" endpoint that returns a structural example
--      that used a DIFFERENT angle/voice than the current generation — enforcing
--      variance rather than convergence.
--
-- narrative_angle: which story angle was used ('impact'|'process'|'people'|'growth')
-- voice_name:      which voice profile was used (e.g. 'assertive', 'collaborative')
--
-- Both columns are nullable so existing rows are unaffected (graceful migration).
-- The client (storeCVExample) already sends these fields; older worker versions
-- simply ignored the extra JSON keys. After this migration the worker persists them.

ALTER TABLE cv_examples ADD COLUMN IF NOT EXISTS narrative_angle TEXT;
ALTER TABLE cv_examples ADD COLUMN IF NOT EXISTS voice_name      TEXT;

-- Index for pool diversity queries:
-- "how many examples of each angle exist for this fingerprint?"
CREATE INDEX IF NOT EXISTS idx_cv_examples_angle
    ON cv_examples(fingerprint, narrative_angle);

CREATE INDEX IF NOT EXISTS idx_cv_examples_voice
    ON cv_examples(fingerprint, voice_name);
