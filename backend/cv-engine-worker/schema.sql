-- cv-engine-db schema (D1 / SQLite flavour)
-- Source of truth for the ProCV human-like generation engine.
-- All tables prefixed cv_ so they never collide with other DBs.

-- 1. Verbs ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_verbs (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  verb_present  TEXT NOT NULL,
  verb_past     TEXT NOT NULL,
  category      TEXT NOT NULL,                    -- technical/management/analysis/communication/financial/creative
  energy_level  TEXT NOT NULL DEFAULT 'medium',   -- high/medium/low
  human_score   INTEGER NOT NULL DEFAULT 7,       -- 1-10, only use >= 7
  formality     TEXT NOT NULL DEFAULT 'neutral',  -- formal/neutral/casual
  industry      TEXT NOT NULL DEFAULT 'general',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_verbs_present_cat ON cv_verbs(verb_present, category);
CREATE INDEX IF NOT EXISTS idx_verbs_cat_score ON cv_verbs(category, human_score);

-- 2. Openers ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_openers (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  opener          TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL,                  -- none/context/time/situation/achievement
  triggers_comma  INTEGER NOT NULL DEFAULT 1,
  example         TEXT,
  length_type     TEXT                            -- short/medium/long
);

-- 3. Context connectors -----------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_context_connectors (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  connector   TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,                       -- location/team/scope/time/condition
  example     TEXT
);

-- 4. Result connectors ------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_result_connectors (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  connector    TEXT NOT NULL UNIQUE,
  type         TEXT NOT NULL,                     -- metric/qualitative/em-dash/approximate/none
  example      TEXT,
  human_score  INTEGER NOT NULL DEFAULT 7
);

-- 5. Sentence structures ----------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_sentence_structures (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pattern_label   TEXT NOT NULL,                  -- short/medium/long/personality
  pattern         TEXT NOT NULL,
  word_count_min  INTEGER,
  word_count_max  INTEGER,
  example         TEXT,
  use_frequency   TEXT,                           -- common/occasional/rare
  section         TEXT NOT NULL DEFAULT 'bullet'  -- bullet/summary/project/education
);
CREATE INDEX IF NOT EXISTS idx_struct_label ON cv_sentence_structures(pattern_label);

-- 6. Rhythm patterns --------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_rhythm_patterns (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pattern_name  TEXT NOT NULL UNIQUE,             -- classic/aggressive/storytelling/technical/internship
  sequence      TEXT NOT NULL,                    -- JSON array of length labels
  section       TEXT NOT NULL,                    -- current_role/past_role/internship/summary
  bullet_count  INTEGER,
  description   TEXT,
  human_score   INTEGER NOT NULL DEFAULT 8
);

-- 7. Paragraph structures ---------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_paragraph_structures (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  section         TEXT NOT NULL,                  -- summary/education/project/skills
  sentence_count  INTEGER,
  pattern         TEXT NOT NULL,
  word_count_min  INTEGER,
  word_count_max  INTEGER,
  rules           TEXT                            -- JSON array
);

-- 8. Banned phrases ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_banned_phrases (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  phrase       TEXT NOT NULL UNIQUE,
  replacement  TEXT,
  severity     TEXT NOT NULL DEFAULT 'high',      -- critical/high/medium
  reason       TEXT,
  source       TEXT NOT NULL DEFAULT 'seed',      -- seed/user_edit/admin
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_banned_severity ON cv_banned_phrases(severity);

-- 9. Subjects ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_subjects (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  subject           TEXT,
  usage             TEXT,                         -- implicit/explicit/team/solo
  allowed_sections  TEXT                          -- JSON array
);

-- 10. Seniority levels ------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_seniority_levels (
  id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  level              TEXT NOT NULL UNIQUE,        -- entry/junior/mid/senior/lead
  years_min          INTEGER,
  years_max          INTEGER,
  bullet_style       TEXT,
  metric_density     TEXT,
  summary_tone       TEXT,
  forbidden_phrases  TEXT                         -- JSON array
);

-- 11. Field profiles --------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_field_profiles (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  field            TEXT NOT NULL UNIQUE,
  language_style   TEXT,
  preferred_verbs  TEXT,                          -- JSON array
  avoided_verbs    TEXT,                          -- JSON array
  metric_types     TEXT,                          -- JSON array
  jd_keywords      TEXT                           -- JSON array
);

-- 12. Seniority + field combos (forbidden combos) --------------------------
CREATE TABLE IF NOT EXISTS cv_seniority_field_combos (
  id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  seniority          TEXT NOT NULL,
  field              TEXT NOT NULL,
  forbidden_phrases  TEXT,                        -- JSON array
  required_tone      TEXT,
  notes              TEXT,
  UNIQUE(seniority, field)
);

-- 13. Voice profiles --------------------------------------------------------
CREATE TABLE IF NOT EXISTS cv_voice_profiles (
  id                    TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name                  TEXT NOT NULL UNIQUE,
  tone                  TEXT,
  description           TEXT,
  verbosity_level       INTEGER DEFAULT 3,        -- 1 (concise) → 5 (detailed)
  metric_preference     TEXT DEFAULT 'medium',    -- very_low/low/medium/high/very_high
  opener_frequency      REAL DEFAULT 0.2,         -- 0.0 → 1.0
  risk_tolerance        TEXT DEFAULT 'balanced',  -- safe/balanced/bold
  formality             TEXT DEFAULT 'neutral',   -- formal/neutral/slightly_casual
  compatible_fields     TEXT,                     -- JSON array
  compatible_seniority  TEXT,                     -- JSON array
  incompatible_with     TEXT,                     -- JSON array
  verb_bias             TEXT,                     -- JSON array
  structure_bias        TEXT                      -- JSON array
);

-- Phase I: leak miner queue (see migrations/004_leak_candidates.sql)
CREATE TABLE IF NOT EXISTS cv_leak_candidates (
    id            TEXT PRIMARY KEY,
    phrase        TEXT NOT NULL UNIQUE,
    count         INTEGER NOT NULL DEFAULT 1,
    sample        TEXT,
    first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
    status        TEXT NOT NULL DEFAULT 'pending',
    decided_at    TEXT,
    decided_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_leak_candidates_status_count
    ON cv_leak_candidates(status, count DESC);
