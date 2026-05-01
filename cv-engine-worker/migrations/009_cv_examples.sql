-- Phase J: CV structural example store.
-- After each successful generation, we save a compact structural fingerprint
-- so future generations for the same role+seniority+mode can use a proven
-- structural pattern as a reference guide — reducing token spend and improving
-- first-pass quality.
--
-- The fingerprint is a SHA-256 of: normalised_role + seniority_tier + purpose + mode
-- so it's never tied to a specific user — only to a role-type.
--
-- experience_structure: JSON array of arrays, e.g. [[5,18,22,14],[4,17,21,19]]
-- The outer array = roles (most-recent first); inner array = word count per bullet.
-- This encodes the bullet rhythm without any personal content.

CREATE TABLE IF NOT EXISTS cv_examples (
    fingerprint          TEXT    PRIMARY KEY,
    primary_title        TEXT    NOT NULL DEFAULT '',    -- e.g. "Software Engineer"
    seniority            TEXT    NOT NULL DEFAULT 'mid', -- junior|mid|senior|exec
    generation_mode      TEXT    NOT NULL DEFAULT 'honest',
    purpose              TEXT    NOT NULL DEFAULT 'job',
    summary_words        INTEGER NOT NULL DEFAULT 0,
    skills_count         INTEGER NOT NULL DEFAULT 0,
    experience_structure TEXT    NOT NULL DEFAULT '[]',  -- JSON [[bw,...],...]
    created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_cv_examples_seniority ON cv_examples(seniority, generation_mode);
