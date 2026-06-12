-- S4: Prompt Registry
-- Stores versioned prompt templates per CV section.
-- Each section_key (summary, experience, skills, cover_letter, …) can have
-- multiple versions; exactly one row per section_key has is_active = 1.
--
-- Workflow:
--   • POST /api/cv/prompt-registry — adds a new version (auto-deactivates old)
--   • POST /api/cv/prompt-registry/rollback — activates a prior version
--   • GET  /api/cv/prompt-registry — returns active version numbers for telemetry
--   • GET  /api/cv/prompt-registry/:section — returns full prompt text

CREATE TABLE IF NOT EXISTS prompt_registry (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    section_key  TEXT    NOT NULL,
    version      INTEGER NOT NULL,
    prompt_text  TEXT    NOT NULL DEFAULT '',
    notes        TEXT    NOT NULL DEFAULT '',
    is_active    INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by   TEXT    NOT NULL DEFAULT 'system'
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prompt_registry_section_version
    ON prompt_registry(section_key, version);

CREATE INDEX IF NOT EXISTS idx_prompt_registry_active
    ON prompt_registry(section_key, is_active);

-- Seed the known sections at version 1 so the registry is non-empty
-- from day one.  `prompt_text` is empty — the app uses its inline prompts
-- until an editor uploads real text via the admin UI.

INSERT OR IGNORE INTO prompt_registry (section_key, version, notes, is_active, created_by)
VALUES
    ('summary',       1, 'Initial seed — text managed inline in geminiService.ts',   1, 'migration'),
    ('experience',    1, 'Initial seed — text managed inline in geminiService.ts',   1, 'migration'),
    ('skills',        1, 'Initial seed — text managed inline in geminiService.ts',   1, 'migration'),
    ('education',     1, 'Initial seed — text managed inline in geminiService.ts',   1, 'migration'),
    ('cover_letter',  1, 'Initial seed — text managed inline in geminiService.ts',   1, 'migration'),
    ('ats_analysis',  1, 'Initial seed — text managed inline in geminiService.ts',   1, 'migration'),
    ('humanizer',     1, 'Initial seed — text managed inline in purify.ts',          1, 'migration'),
    ('validator',     1, 'Initial seed — text managed inline in purify.ts',          1, 'migration');
