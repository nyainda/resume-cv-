-- Migration 014: Job search results cache
--
-- Caches Tavily / JSearch API responses keyed by a hash of the search
-- parameters (query + location + job_type).  A 6-hour TTL avoids stale
-- listings while still dramatically reducing paid-API calls for users who
-- search the same role multiple times in a session.
--
-- Columns:
--   cache_key    — SHA-256 hex of normalised(query + location + job_type)
--   query_text   — raw search query for debugging / admin inspection
--   results_json — full API response serialised as JSON, max 200 KB
--   source       — 'tavily' | 'jsearch' | 'combined'
--   created_at   — unix epoch seconds
--   expires_at   — unix epoch seconds (default: 6 hours)
--   use_count    — how many requests have been served from this entry

CREATE TABLE IF NOT EXISTS job_search_cache (
    cache_key    TEXT    PRIMARY KEY,
    query_text   TEXT    NOT NULL DEFAULT '',
    results_json TEXT    NOT NULL,
    source       TEXT    NOT NULL DEFAULT 'tavily',
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at   INTEGER NOT NULL DEFAULT (unixepoch() + 21600),
    use_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_job_search_expires ON job_search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_job_search_query   ON job_search_cache(query_text);
