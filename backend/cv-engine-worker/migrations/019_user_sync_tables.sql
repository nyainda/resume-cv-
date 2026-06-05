-- Migration 019: User Sync Tables
--
-- Extends CF D1 with 6 new tables that allow ProCV to back up and sync
-- all user-owned data from the browser (localStorage / IndexedDB) to the
-- Cloudflare edge. Identified by `device_id` — the stable UUID stored in
-- `cv_builder:deviceId` in localStorage.
--
-- New tables:
--   user_slots            — full UserProfile JSON snapshots per slot
--   saved_cvs             — individual SavedCV objects
--   tracked_applications  — application tracker rows
--   star_stories          — STAR interview stories
--   saved_cover_letters   — drafted cover letters
--   user_preferences      — AI provider, sidebar prefs, generation prefs
--
-- Existing tables (already in D1):
--   profile_cache         — compact profile JSON for generation (migration 010)
--   llm_cache             — LLM response cache (migration 008)
--   cv_examples           — structural CV blueprints (migration 009)
--   market_research_cache — market research results (migration 011)
--   jd_analysis_cache     — JD analysis results (migration 012)
--   cv_shares             — shareable CV links (migration 013)
--   job_search_cache      — job search results (migration 014)
--   cv_events             — generation analytics (migration 015)
--   custom_templates      — user custom templates (migration 016)

-- ── user_slots ─────────────────────────────────────────────────────────────
-- Full UserProfile JSON snapshots.  One row per (device_id, slot_id).
-- Enables cross-device restore and browser-clear recovery beyond what
-- IndexedDB alone provides (IndexedDB is wiped on "Clear cookies & site data").
CREATE TABLE IF NOT EXISTS user_slots (
    device_id    TEXT    NOT NULL,
    slot_id      TEXT    NOT NULL,
    slot_name    TEXT    NOT NULL DEFAULT '',
    color        TEXT    NOT NULL DEFAULT 'indigo',
    profile_json TEXT    NOT NULL,   -- JSON: full UserProfile object
    current_cv   TEXT,               -- JSON: CVData | null (last active CV)
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (device_id, slot_id)
);

CREATE INDEX IF NOT EXISTS idx_user_slots_device ON user_slots(device_id);
CREATE INDEX IF NOT EXISTS idx_user_slots_updated ON user_slots(updated_at);

-- ── saved_cvs ──────────────────────────────────────────────────────────────
-- Individual SavedCV objects.  One row per (device_id, cv_id).
-- Supplements Google Drive sync — works without a Google account.
CREATE TABLE IF NOT EXISTS saved_cvs (
    device_id    TEXT    NOT NULL,
    slot_id      TEXT    NOT NULL DEFAULT '',
    cv_id        TEXT    NOT NULL,
    name         TEXT    NOT NULL DEFAULT 'Untitled CV',
    template     TEXT    NOT NULL DEFAULT 'professional',
    cv_json      TEXT    NOT NULL,   -- JSON: CVData
    ats_score    INTEGER,            -- last ATS score (0–100)
    job_title    TEXT,               -- target job title from generation context
    company      TEXT,               -- target company from generation context
    saved_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (device_id, cv_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_cvs_device  ON saved_cvs(device_id, slot_id);
CREATE INDEX IF NOT EXISTS idx_saved_cvs_updated ON saved_cvs(updated_at);

-- ── tracked_applications ───────────────────────────────────────────────────
-- One row per job application.
CREATE TABLE IF NOT EXISTS tracked_applications (
    device_id    TEXT    NOT NULL,
    slot_id      TEXT    NOT NULL DEFAULT '',
    app_id       TEXT    NOT NULL,
    company      TEXT    NOT NULL DEFAULT '',
    job_title    TEXT    NOT NULL DEFAULT '',
    status       TEXT    NOT NULL DEFAULT 'applied',
    applied_date TEXT,               -- ISO date string 'YYYY-MM-DD'
    job_url      TEXT,
    notes        TEXT,
    salary_min   INTEGER,
    salary_max   INTEGER,
    location     TEXT,
    meta_json    TEXT,               -- JSON: any remaining TrackedApplication fields
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (device_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_tracked_apps_device  ON tracked_applications(device_id, slot_id);
CREATE INDEX IF NOT EXISTS idx_tracked_apps_status  ON tracked_applications(status);
CREATE INDEX IF NOT EXISTS idx_tracked_apps_updated ON tracked_applications(updated_at);

-- ── star_stories ───────────────────────────────────────────────────────────
-- STAR interview stories per (device_id, story_id).
CREATE TABLE IF NOT EXISTS star_stories (
    device_id  TEXT    NOT NULL,
    slot_id    TEXT    NOT NULL DEFAULT '',
    story_id   TEXT    NOT NULL,
    title      TEXT    NOT NULL DEFAULT '',
    situation  TEXT,
    task       TEXT,
    action     TEXT,
    result     TEXT,
    skills     TEXT,               -- JSON: string[] — associated skills/competencies
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (device_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_star_stories_device ON star_stories(device_id, slot_id);

-- ── saved_cover_letters ────────────────────────────────────────────────────
-- Drafted cover letters per (device_id, cl_id).
CREATE TABLE IF NOT EXISTS saved_cover_letters (
    device_id  TEXT    NOT NULL,
    slot_id    TEXT    NOT NULL DEFAULT '',
    cl_id      TEXT    NOT NULL,
    name       TEXT    NOT NULL DEFAULT 'Untitled Cover Letter',
    content    TEXT    NOT NULL,   -- plain text or Markdown
    company    TEXT,
    role       TEXT,
    tone       TEXT,               -- 'formal' | 'conversational' | 'executive'
    saved_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (device_id, cl_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_cls_device  ON saved_cover_letters(device_id, slot_id);
CREATE INDEX IF NOT EXISTS idx_saved_cls_updated ON saved_cover_letters(updated_at);

-- ── user_preferences ───────────────────────────────────────────────────────
-- One row per device_id.  Stores lightweight settings.
-- Heavy data (profiles, CVs) lives in the tables above.
CREATE TABLE IF NOT EXISTS user_preferences (
    device_id        TEXT    NOT NULL PRIMARY KEY,
    ai_provider      TEXT,                -- 'workers-ai' | 'claude' | 'gemini'
    sidebar_sections TEXT,               -- JSON: SidebarSectionsVisibility
    cv_purpose       TEXT,               -- 'job' | 'academic' | 'freelance' | etc.
    target_company   TEXT,
    target_job_title TEXT,
    jd_keywords      TEXT,               -- JSON: string[] — tier-1 JD keywords
    dark_mode        INTEGER DEFAULT 0,   -- 0 | 1
    updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_user_prefs_updated ON user_preferences(updated_at);

-- ── Cleanup TTL: auto-delete rows older than 180 days (run by cron) ────────
-- The scheduled handler in index.ts should run:
--   DELETE FROM user_slots           WHERE updated_at < unixepoch() - 15552000;
--   DELETE FROM saved_cvs            WHERE updated_at < unixepoch() - 15552000;
--   DELETE FROM tracked_applications WHERE updated_at < unixepoch() - 15552000;
--   DELETE FROM star_stories         WHERE updated_at < unixepoch() - 15552000;
--   DELETE FROM saved_cover_letters  WHERE updated_at < unixepoch() - 15552000;
--   DELETE FROM user_preferences     WHERE updated_at < unixepoch() - 15552000;
