-- Migration 010: Profile cache — store user profile snapshots in D1.
--
-- When a user imports or saves a profile in the app, a compact snapshot is
-- uploaded here keyed by (slot_id, hash).  The hash is a SHA-256 of the
-- compact profile JSON so the same profile is never stored twice.
--
-- Generation requests can send { slot_id, profile_hash } instead of the full
-- profile text, and the worker fetches the profile from here — eliminating
-- the profile payload from every generation request.
--
-- Columns:
--   hash          — SHA-256 hex of the compact profile JSON (primary key)
--   slot_id       — the profile slot UUID from the browser app
--   slot_name     — human-readable name of the slot (e.g. "Software Engineer")
--   compact_json  — compactProfile() output ready to inject into prompts
--   created_at    — unix epoch seconds
--   last_used_at  — updated on every GET/generation use (for TTL cleanup)
--   use_count     — how many times this profile has been used for generation

CREATE TABLE IF NOT EXISTS profile_cache (
    hash          TEXT    PRIMARY KEY,
    slot_id       TEXT    NOT NULL,
    slot_name     TEXT    NOT NULL DEFAULT '',
    compact_json  TEXT    NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    use_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_profile_cache_slot    ON profile_cache(slot_id);
CREATE INDEX IF NOT EXISTS idx_profile_cache_last    ON profile_cache(last_used_at);
