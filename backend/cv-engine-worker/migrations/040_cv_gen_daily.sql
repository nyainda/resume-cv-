-- migration 040 — daily CV generation counter
-- Adds per-user daily tracking so we can enforce a soft daily cap (15/day)
-- without touching the lifetime cv_gen_count.  cv_gen_daily_reset stores the
-- UTC date string (YYYY-MM-DD) of the current window; when it no longer matches
-- today the counter is reset to 0 atomically in the upsert.
ALTER TABLE user_usage ADD COLUMN cv_gen_daily_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_usage ADD COLUMN cv_gen_daily_reset TEXT    NOT NULL DEFAULT '';
