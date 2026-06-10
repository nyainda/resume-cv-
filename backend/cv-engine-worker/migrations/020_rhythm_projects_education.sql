-- Phase 3.4 — Rhythm patterns for Projects + Education sections
-- Previously only current_role, past_role, internship, summary had patterns.
-- Scenario C (fresh grad / no experience) is hurt most — projects are the main
-- work history but got no rhythm enforcement.
-- This migration adds three new patterns: project_showcase, project_minimal,
-- education_rich.
--
-- sequence is a JSON array of length-class tokens:
--   "short"       = concise context-setter or scope line   (~8–12 words)
--   "medium"      = contribution / method line             (~13–18 words)
--   "long"        = full impact bullet with metric          (~19–26 words)
--   "personality" = optional soft / values signal          (any length, no metric required)

INSERT OR IGNORE INTO cv_rhythm_patterns (pattern_name, section, sequence, description, human_score)
VALUES
    (
        'project_showcase',
        'projects',
        '["short","long","medium","long","short"]',
        'Open with project scope (short), two impact bullets (long), one method note (medium), close with outcome or link (short). Best for 4-5 bullet project listings.',
        85
    ),
    (
        'project_minimal',
        'projects',
        '["short","medium","short"]',
        'Tight 3-bullet listing: scope context, key contribution, measurable result. Best for portfolios with many projects.',
        78
    ),
    (
        'education_rich',
        'education',
        '["short","medium","medium","short"]',
        'Degree and institution context (short), two achievement or activity bullets (medium), GPA / award / honour close (short). Best for fresh-grad and academic CVs.',
        80
    );
