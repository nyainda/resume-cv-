-- S1: Rule Registry
-- Stores versioned scenario-selection rules and optional text overrides.
--
-- Each rule_key maps to one of the CV generation scenarios:
--   scenario:A  — no experience, no projects
--   scenario:B  — has experience, no projects
--   scenario:C  — no experience, has projects
--   scenario:D  — thin experience (< threshold months)
--   scenario:standard — full profile
--   scenario:pivot — career-domain pivot (orthogonal overlay)
--
-- `conditions` is a JSON object encoding the matching criteria the evaluator
-- uses to pick this scenario:
--   { "hasExperience": bool, "hasProjects": bool,
--     "totalMonthsMin": int, "totalMonthsMax": int | null,
--     "pivotRequired": bool }
--
-- `ab_weight` (0–100): multiple active variants of the SAME rule_key must
-- sum to 100. The evaluator picks the winner by weighted random selection.
-- A single variant with weight=100 is deterministic (the default case).
--
-- `text_override`: when non-empty the worker substitutes this text for the
-- compiled default scenario block — no redeploy needed for prompt tweaks.

CREATE TABLE IF NOT EXISTS rule_registry (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_key      TEXT    NOT NULL,
    version       INTEGER NOT NULL,
    conditions    TEXT    NOT NULL DEFAULT '{}',
    ab_weight     INTEGER NOT NULL DEFAULT 100,
    text_override TEXT    NOT NULL DEFAULT '',
    notes         TEXT    NOT NULL DEFAULT '',
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by    TEXT    NOT NULL DEFAULT 'system'
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_registry_key_version
    ON rule_registry(rule_key, version);

CREATE INDEX IF NOT EXISTS idx_rule_registry_active
    ON rule_registry(rule_key, is_active);

-- ── Seed: mirrors the exact hardcoded logic in detectScenario() v2.3 ─────────
-- Conditions use null for "don't care", int for specific thresholds.
-- All weights are 100 (single variant, deterministic).

INSERT OR IGNORE INTO rule_registry
    (rule_key, version, conditions, ab_weight, notes, is_active, created_by)
VALUES
    ('scenario:A', 1,
     '{"hasExperience":false,"hasProjects":false,"totalMonthsMin":0,"totalMonthsMax":null,"pivotRequired":false}',
     100, 'No experience, no projects — Foundation Formula', 1, 'migration'),

    ('scenario:B', 1,
     '{"hasExperience":true,"hasProjects":false,"totalMonthsMin":6,"totalMonthsMax":null,"pivotRequired":false}',
     100, 'Has experience (≥6 mo), no projects — experience-heavy treatment', 1, 'migration'),

    ('scenario:C', 1,
     '{"hasExperience":false,"hasProjects":true,"totalMonthsMin":0,"totalMonthsMax":null,"pivotRequired":false}',
     100, 'No experience, has projects — projects-led formula', 1, 'migration'),

    ('scenario:D', 1,
     '{"hasExperience":true,"hasProjects":null,"totalMonthsMin":1,"totalMonthsMax":5,"pivotRequired":false}',
     100, 'Thin experience (<6 mo) — emerging professional formula', 1, 'migration'),

    ('scenario:standard', 1,
     '{"hasExperience":true,"hasProjects":null,"totalMonthsMin":6,"totalMonthsMax":null,"pivotRequired":false}',
     100, 'Full profile — standard rules apply', 1, 'migration'),

    ('scenario:pivot', 1,
     '{"hasExperience":null,"hasProjects":null,"totalMonthsMin":null,"totalMonthsMax":null,"pivotRequired":true}',
     100, 'Cross-domain pivot overlay (orthogonal to A–D)', 1, 'migration');
