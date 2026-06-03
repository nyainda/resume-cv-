-- Phase: CV Examples — Quality Score
--
-- Adds a quality_score column (0-100) to cv_examples so the worker can
-- prefer structurally cleaner reference examples when multiple generations
-- exist for the same role fingerprint.
--
-- The score is computed client-side from the final CV after the full quality
-- pipeline runs — no extra API calls:
--   +5  summary word count in the 50-100 word sweet spot
--   +5  skills count in the 8-16 item range
--   +10 verb variety ≥70% (unique openers / total bullets)
--   +5  bullets per role averaging 3-7
--   baseline 70 (every stored example ran the full pipeline)
--
-- ON CONFLICT behaviour: structural data (summary_words, skills_count,
-- experience_structure) only overwrites when the new score is strictly higher,
-- so the stored blueprint always reflects the best-quality generation seen.
-- Metadata (narrative_angle, voice_name) always updates to the latest.

ALTER TABLE cv_examples ADD COLUMN quality_score INTEGER DEFAULT 70;

CREATE INDEX IF NOT EXISTS idx_cv_examples_quality
    ON cv_examples(fingerprint, quality_score DESC);
