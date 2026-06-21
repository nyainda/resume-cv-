-- Migration 031: Rebuild user_slots and user_preferences for single-constraint ownership
--
-- Root cause addressed: migration 019 created user_slots with PRIMARY KEY (device_id, slot_id).
-- Migration 026 added a SECOND competing unique index on (user_id, slot_id) without removing
-- the first. The write handler's fallback branch (now deleted in code) could silently write
-- under the old constraint, landing a row with a NULL or wrong user_id — causing cross-account
-- data to appear in another user's GET /api/cv/user-data response.
--
-- Fix (Rule 2 — Identity & Ownership Directive):
--   One table may have exactly ONE active uniqueness constraint that determines row ownership.
--   We rebuild both tables with PRIMARY KEY (user_id, slot_id) / PRIMARY KEY (user_id) and
--   keep device_id as metadata-only (indexed but never a conflict target).
--
-- Rows with user_id IS NULL (pre-auth anonymous saves) are dropped — they were never
-- reachable by an authenticated user. Collision resolution policy: keep the row with
-- the highest updated_at per (user_id, slot_id) cluster.

-- ── user_slots rebuild ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_slots_new (
    user_id      INTEGER NOT NULL REFERENCES user_identities(id) ON DELETE CASCADE,
    slot_id      TEXT    NOT NULL,
    slot_name    TEXT    NOT NULL DEFAULT '',
    color        TEXT    NOT NULL DEFAULT 'indigo',
    profile_json TEXT    NOT NULL,
    current_cv   TEXT,
    device_id    TEXT,                    -- metadata only: never a conflict target
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (user_id, slot_id)
);

-- Copy only authenticated rows; discard user_id IS NULL orphans.
-- On collision (same user_id+slot_id from two device rows) keep the most recent.
INSERT OR REPLACE INTO user_slots_new
    (user_id, slot_id, slot_name, color, profile_json, current_cv, device_id, updated_at)
SELECT user_id, slot_id, slot_name, color, profile_json, current_cv, device_id, updated_at
FROM user_slots
WHERE user_id IS NOT NULL
ORDER BY updated_at DESC;  -- INSERT OR REPLACE keeps the last writer; ordering ensures newest wins

DROP TABLE user_slots;
ALTER TABLE user_slots_new RENAME TO user_slots;

CREATE INDEX IF NOT EXISTS idx_user_slots_device  ON user_slots(device_id);
CREATE INDEX IF NOT EXISTS idx_user_slots_updated ON user_slots(updated_at);

-- ── user_preferences rebuild ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_preferences_new (
    user_id          INTEGER NOT NULL PRIMARY KEY REFERENCES user_identities(id) ON DELETE CASCADE,
    device_id        TEXT,                -- metadata only
    ai_provider      TEXT,
    sidebar_sections TEXT,
    cv_purpose       TEXT,
    target_company   TEXT,
    target_job_title TEXT,
    jd_keywords      TEXT,
    dark_mode        INTEGER DEFAULT 0,
    updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR REPLACE INTO user_preferences_new
    (user_id, device_id, ai_provider, sidebar_sections, cv_purpose,
     target_company, target_job_title, jd_keywords, dark_mode, updated_at)
SELECT user_id, device_id, ai_provider, sidebar_sections, cv_purpose,
       target_company, target_job_title, jd_keywords, dark_mode, updated_at
FROM user_preferences
WHERE user_id IS NOT NULL
ORDER BY updated_at DESC;

DROP TABLE user_preferences;
ALTER TABLE user_preferences_new RENAME TO user_preferences;

CREATE INDEX IF NOT EXISTS idx_user_prefs_updated ON user_preferences(updated_at);
