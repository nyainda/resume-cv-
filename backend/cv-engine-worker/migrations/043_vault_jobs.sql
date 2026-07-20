-- Migration 043: Job Vault — per-user saved job descriptions
--
-- Users save JDs as they find them. Each row is scoped to a user + profile slot.
-- match_score is computed lazily (NULL until classified).
-- Cleanup cron removes expired rows older than 30 days + all rows older than 180 days.

CREATE TABLE IF NOT EXISTS vault_jobs (
    id           TEXT    PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
    room_id      TEXT    NOT NULL DEFAULT '',        -- profile slot ID
    title        TEXT    NOT NULL DEFAULT '',
    company      TEXT    NOT NULL DEFAULT '',
    raw_jd       TEXT    NOT NULL DEFAULT '',
    input_type   TEXT    NOT NULL DEFAULT 'text',   -- 'text'|'url'|'pdf'|'image'
    source_url   TEXT,
    match_score  INTEGER,                            -- 0–100, NULL = not yet classified
    room_reason  TEXT,
    room_type    TEXT    NOT NULL DEFAULT 'uncategorized',  -- 'primary'|'stretch'|'uncategorized'
    deadline     TEXT,                              -- ISO date string e.g. 2024-06-01
    priority     TEXT    NOT NULL DEFAULT 'medium', -- 'low'|'medium'|'high'|'dream'
    status       TEXT    NOT NULL DEFAULT 'saved',  -- 'saved'|'building'|'applied'|'expired'
    built_cv_id  TEXT,
    fingerprint  TEXT    NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL,                  -- unix ms
    updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_jobs_user_id      ON vault_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_jobs_room_id      ON vault_jobs(user_id, room_id);
CREATE INDEX IF NOT EXISTS idx_vault_jobs_updated_at   ON vault_jobs(updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_jobs_fp    ON vault_jobs(user_id, fingerprint);
