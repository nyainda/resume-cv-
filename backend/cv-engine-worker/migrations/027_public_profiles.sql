-- Migration 027: Public profile pages
--
-- Stores a user's "published" CV snapshot so they get a permanent URL
-- that always shows their latest published version:
--   https://<domain>/#p=<user_id>
--
-- Columns:
--   user_id    — FK to user_identities, one row per user (upsert on update)
--   payload    — lz-string compressed SharedCVPayload JSON (same format as cv_shares)
--   updated_at — unix epoch seconds (bumped on every publish)
--   view_count — incremented on every public GET

CREATE TABLE IF NOT EXISTS public_profiles (
    user_id     INTEGER PRIMARY KEY REFERENCES user_identities(id),
    payload     TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    view_count  INTEGER NOT NULL DEFAULT 0
);
