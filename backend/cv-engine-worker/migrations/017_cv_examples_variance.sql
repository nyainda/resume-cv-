-- Phase: CV Examples — Variance Metadata
--
-- Adds pool diversity fields to cv_examples so the worker can track
-- which narrative angle and voice profile were used per example.
-- Enables future "select most different" pool diversity queries.
--
-- narrative_angle: which story angle was used ('impact'|'process'|'people'|'growth')
-- voice_name:      which voice profile was used (e.g. 'assertive', 'collaborative')
--
-- Both columns are nullable so existing rows are unaffected (graceful migration).

ALTER TABLE cv_examples ADD COLUMN narrative_angle TEXT;
ALTER TABLE cv_examples ADD COLUMN voice_name      TEXT;

-- Index for pool diversity queries:
-- "how many examples of each angle exist for this fingerprint?"
CREATE INDEX IF NOT EXISTS idx_cv_examples_angle
    ON cv_examples(fingerprint, narrative_angle);

CREATE INDEX IF NOT EXISTS idx_cv_examples_voice
    ON cv_examples(fingerprint, voice_name);
