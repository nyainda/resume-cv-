-- Migration 032: Drop five legacy device_id-keyed tables that are now empty
-- and replaced by user_slots (user_id-scoped, schema rebuilt in migration 031).
--
-- Tables being dropped:
--   custom_templates      — feature removed entirely (code deleted in May 2026)
--   saved_cvs             — superseded by user_slots.profile_json
--   saved_cover_letters   — superseded by user_slots.profile_json
--   tracked_applications  — superseded by user_slots.profile_json
--   star_stories          — superseded by user_slots.profile_json
--
-- All five had 0 rows at time of this migration (verified 2026-06-21).

DROP TABLE IF EXISTS custom_templates;
DROP TABLE IF EXISTS saved_cvs;
DROP TABLE IF EXISTS saved_cover_letters;
DROP TABLE IF EXISTS tracked_applications;
DROP TABLE IF EXISTS star_stories;

INSERT INTO d1_migrations (name, applied_at) VALUES ('032_drop_legacy_tables', datetime('now'))
ON CONFLICT(name) DO NOTHING;
