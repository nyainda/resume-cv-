-- Migration 038: Per-user usage counters
--
-- Tracks lifetime CV generation and PDF download counts server-side so
-- the free-tier cap (3 generations, 2 PDFs) is enforced across devices
-- instead of relying on per-device localStorage alone.
--
-- One row per user. Rows are created on first increment (INSERT OR IGNORE).
-- Deleted automatically when the user account is deleted (CASCADE).

CREATE TABLE IF NOT EXISTS user_usage (
  user_id       INTEGER PRIMARY KEY
                  REFERENCES user_identities(id) ON DELETE CASCADE,
  cv_gen_count  INTEGER NOT NULL DEFAULT 0,
  pdf_dl_count  INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_user_usage_updated ON user_usage(updated_at);
