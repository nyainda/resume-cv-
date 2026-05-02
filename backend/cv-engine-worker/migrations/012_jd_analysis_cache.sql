-- Migration 012: JD keyword analysis cache.
--
-- Caches the output of analyzeJobDescriptionForKeywords() keyed by a hash
-- of the first 1500 chars of the JD (same truncation the prompt uses).
-- Avoids a Groq / Workers AI call on every re-generation when the user
-- re-uses the same job description.  TTL: 7 days.
--
-- Columns:
--   cache_key     — hash of normalised JD text — primary key
--   result_json   — full JobAnalysisResult serialised as JSON
--   created_at    — unix epoch seconds
--   last_used_at  — updated on every cache hit (for TTL cleanup)
--   use_count     — how many generations have benefited from this entry

CREATE TABLE IF NOT EXISTS jd_analysis_cache (
    cache_key     TEXT    PRIMARY KEY,
    result_json   TEXT    NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    last_used_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    use_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_jd_analysis_last ON jd_analysis_cache(last_used_at);
